// A2 fabric — the CLIENT / WITNESS / MEMBER protocol flows over a FabricEndpoint
// (spec §1 PIN, §4 write lease + witnessed events). This module COMPOSES the
// built pieces (attest.ts, lease.ts, cache.ts, pin.ts, oprf.ts) into the wire
// choreography; it introduces NO new crypto — every signature, hash, blind,
// evaluation, and verdict is one of the primitives those modules already own.
//
// GENERATION paths (a client requesting a lease, blinding a PIN) take injected
// randomness / clocks so suites are reproducible; every VERIFIER the flows call
// is a pure function. Platform-neutral: no `node:` imports, no DOM globals, no
// Date.now(), no Math.random().

import { canonicalBytes, type CanonicalObject } from '../codec'
import { appendEvent } from '../chain'
import { eventId, signBody, witnessedHeadOf } from '../events'
import { ed25519, fromB64u, sha256, toB64u, verifySigB64u } from '../hash'
import type { B64u, Chain, EventBody, EventId, EventType, SignedEvent, WitnessAttestation } from '../types'
import { admitEvent, cosignCheckpoint, verifyAttestation, type HeadRef } from './attest'
import { updateHeadFromEvent } from './cache'
import { canonicalWitnessSet, type ChainSummary } from './eligibility'
import {
  buildLeaseBody,
  grantLease,
  leaseBodyHash,
  pinSessionId,
  signGrant,
  verifyGrantSig,
  type LeaseParams,
} from './lease'
import {
  applyEval,
  applySuccess,
  effectiveCount,
  fuseRecordBody,
  isFuseActive,
  makeFuseRecord,
  memberFails,
  newCounter,
  pinRecordId,
  signAttemptReport,
  signFuse,
  signHandoff,
  verifyAttemptReport,
  verifyHandoff,
  verifyPinRecord,
  verifyPinSession,
  type HandoffAuth,
  type PinCounterState,
  type SignedPinRecord,
} from './pin'
import {
  clientBlind,
  clientFinalize,
  combinePartials,
  dleqProve,
  dleqProveDeterministic,
  dleqVerify,
  memberBlindEvaluate,
  pinKeyFromOutput,
  type Partial as OprfPartial,
} from './oprf'
import { pointFromBytes, pointToBytes, scalarFromBytes, shareCommitment, type Rng } from './shamir'
import { PARAMS_A2 } from './params'
import type {
  FabricEndpoint,
  FuseRecord,
  Lease,
  LeaseBody,
  NodeId,
  PinAttemptReport,
  PinSession,
  SubjectSummary,
  WitnessStore,
} from './types'

// ---------------------------------------------------------------------------
// Wire helpers — the transport moves CanonicalObjects; these cast at the seam.
// ---------------------------------------------------------------------------

function asMsg<T>(v: T): CanonicalObject {
  return v as unknown as CanonicalObject
}
function fromMsg<T>(v: CanonicalObject): T {
  return v as unknown as T
}
async function req<R>(
  fabric: FabricEndpoint,
  to: NodeId,
  kind: Parameters<FabricEndpoint['request']>[1],
  payload: unknown,
): Promise<R> {
  return fromMsg<R>(await fabric.request(to, kind, asMsg(payload)))
}

/**
 * Register a request handler that can never crash the transport: a malformed wire
 * payload (missing/ill-typed fields reaching a crypto/point-decode primitive)
 * returns a typed {error} instead of rejecting the handler promise. fromMsg does
 * no shape validation, so this is the uniform boundary guard for every handler.
 */
function onSafe(
  fabric: FabricEndpoint,
  kind: Parameters<FabricEndpoint['onRequest']>[0],
  handler: Parameters<FabricEndpoint['onRequest']>[1],
): void {
  fabric.onRequest(kind, async (from, payload) => {
    try {
      return await handler(from, payload)
    } catch {
      return asMsg({ error: 'malformed-request' })
    }
  })
}

/** The `fuse-check` handler — identical for witnesses and members: return the
 * held fuse record + whether it is active on the responder's own clock. */
function serveFuseCheck(fabric: FabricEndpoint, fuseOf: (root: B64u) => FuseRecord | null, wts: () => number): void {
  onSafe(fabric, 'fuse-check', async (_from, payload) => {
    const { root } = fromMsg<{ root: B64u }>(payload)
    const fuse = fuseOf(root)
    return asMsg(fuse ? { active: isFuseActive(fuse, wts()), fuse } : { active: false })
  })
}

// ---------------------------------------------------------------------------
// PIN success proof (pinKey-signed) — a composition of ed25519 over cjson bytes,
// NOT a new primitive.
// ---------------------------------------------------------------------------

const PIN_SUCCESS_PURPOSE = 'pin-success'
function successBytes(root: B64u, evalNonce: B64u, wts: number): Uint8Array {
  return canonicalBytes({ root, evalNonce, wts, purpose: PIN_SUCCESS_PURPOSE })
}
/** Sign a pin-eval success with the derived pinKey (offline brute force stays
 * impossible: producing this at all required a committee evaluation). */
export function signPinSuccess(root: B64u, evalNonce: B64u, wts: number, pinPriv: Uint8Array): B64u {
  return toB64u(ed25519.sign(successBytes(root, evalNonce, wts), pinPriv))
}
function verifyPinSuccess(sig: B64u, root: B64u, evalNonce: B64u, wts: number, pinPub: B64u): boolean {
  // Fail closed if the (untrusted) wts is not a safe integer (canonicalBytes throws).
  let msg: Uint8Array
  try {
    msg = successBytes(root, evalNonce, wts)
  } catch {
    return false
  }
  return verifySigB64u(sig, msg, pinPub)
}

// ===========================================================================
// WITNESS — serves lease-grant / attest / cosign-ckpt / head / fuse-check.
// ===========================================================================

export interface WitnessIdentity {
  nodeId: NodeId
  /** Device signing pubkey (advertised in presence, certified in own chain). */
  key: B64u
  priv: Uint8Array
}

export interface WitnessDeps {
  store: WitnessStore
  /** The witness's independent clock reading (ms), injected. */
  wts: () => number
  /** Fuse the witness holds for a root (null ⇒ none). Granting into an active
   * fuse is misbehavior, so an honest witness refuses. */
  fuseOf?: (root: B64u) => FuseRecord | null
  timeWindowMs: number
  /** Full lease validity check (threshold + eligibility over the canonical set).
   * When a witness holds the subject's chain facts (via A3 replication) it wires
   * verifyLease here; without it the witness enforces only the context-free
   * ≥1-valid-grant floor in admitEvent. */
  verifyLease?: (lease: Lease) => boolean
}

export interface WitnessServeHandle {
  /** Seed the cached head for a root (bootstrapping from gossip — e.g. the
   * genesis head learned when the account was first witnessed). */
  seedHead(root: B64u, head: HeadRef): Promise<void>
  headOf(root: B64u): Promise<HeadRef | null>
}

async function headRefOf(store: WitnessStore, root: B64u): Promise<HeadRef | null> {
  const e = await store.get(root)
  if (!e || e.witnessedHead === undefined || e.witnessedHeight === undefined) return null
  return e.lastEpoch !== undefined
    ? { id: e.witnessedHead, height: e.witnessedHeight, epoch: e.lastEpoch }
    : { id: e.witnessedHead, height: e.witnessedHeight }
}

/** Register the witness request handlers on `fabric`. */
export function witnessServe(
  fabric: FabricEndpoint,
  id: WitnessIdentity,
  deps: WitnessDeps,
): WitnessServeHandle {
  const fuseOf = deps.fuseOf ?? (() => null)

  // NOTE (A3 residual): the witness blind-signs any well-formed leaseBody after
  // the fuse check. Preventing a witness from being tricked into signing two
  // conflicting same-epoch leases to different devices — the self-inflicted
  // double-grant §4 would slash it for — requires AUTHENTICATING the grant
  // request (device-key possession / the takeover PIN session for a device
  // change), which is A3's device-ownership layer. A local conflict memory can't
  // do it soundly (an unauthenticated attacker either bypasses it by pre-bumping
  // the epoch or weaponizes it as a front-running lockout). What A2 CAN keep
  // sound is the ADJUDICATION's attribution: slash.adjudicate binds each grantor
  // to its advertised key (keyOf), so a fabricated grant set can never frame an
  // honest witness.
  // lease-grant and lease-renew are identical: sign the presented body unless a
  // fuse bans the root. (A renewal is just a fresh grant at the same epoch/device
  // with a new clock reading.)
  const serveGrant = async (_from: NodeId, payload: CanonicalObject): Promise<CanonicalObject> => {
    const { leaseBody } = fromMsg<{ leaseBody: LeaseBody }>(payload)
    const wts = deps.wts()
    const fuse = fuseOf(leaseBody.root)
    if (fuse && isFuseActive(fuse, wts)) return asMsg({ error: 'fuse-active' })
    return asMsg({ grant: signGrant(leaseBody, id.nodeId, id.key, id.priv, wts) })
  }
  onSafe(fabric, 'lease-grant', serveGrant)
  onSafe(fabric, 'lease-renew', serveGrant)

  // Attests for one root are SERIALIZED (a per-root promise chain): read-head →
  // admit → advance-head spans awaits, so two concurrent attests must not both
  // admit against the same stale head and cosign two successors of one prev (the
  // fork admitEvent's head check exists to prevent).
  const attestChain = new Map<B64u, Promise<unknown>>()
  onSafe(fabric, 'attest', async (_from, payload) => {
    const { event, lease } = fromMsg<{ event: SignedEvent; lease: Lease }>(payload)
    const root = event.body.root
    const run = (attestChain.get(root) ?? Promise.resolve()).then(async () => {
      const cachedHead = await headRefOf(deps.store, root)
      const res = admitEvent({
        event,
        lease,
        fuse: fuseOf(root),
        cachedHead,
        witnessKey: id.key,
        witnessPriv: id.priv,
        wts: deps.wts(),
        params: { timeWindowMs: deps.timeWindowMs },
        ...(deps.verifyLease ? { leaseOk: deps.verifyLease } : {}),
      })
      if (!res.ok) return asMsg({ error: res.reason, ...(res.myHead ? { myHead: res.myHead } : {}) })
      // Admitted: advance the cached head under the lease epoch.
      const entry = await deps.store.get(root)
      await deps.store.put(updateHeadFromEvent(entry, root, event, lease.body.epoch))
      return asMsg({ attestation: res.attestation })
    })
    const tail = run.catch(() => undefined)
    attestChain.set(root, tail)
    // Evict once settled if still the tail — the map holds only in-flight chains,
    // so an unauthenticated attest flood over many roots can't grow it unbounded.
    void tail.then(() => {
      if (attestChain.get(root) === tail) attestChain.delete(root)
    })
    return run
  })

  onSafe(fabric, 'cosign-ckpt', async (_from, payload) => {
    const { chain, ckpt } = fromMsg<{ chain: Chain; ckpt: SignedEvent }>(payload)
    const att = cosignCheckpoint(ckpt, chain, id.key, id.priv, deps.wts())
    if (!att) return asMsg({ error: 'checkpoint-recompute-failed' })
    return asMsg({ attestation: att })
  })

  onSafe(fabric, 'head', async (_from, payload) => {
    const { root } = fromMsg<{ root: B64u }>(payload)
    const head = await headRefOf(deps.store, root)
    return asMsg(head ? { head } : {})
  })

  serveFuseCheck(fabric, fuseOf, deps.wts)

  return {
    async seedHead(root, head) {
      const entry = (await deps.store.get(root)) ?? { root }
      await deps.store.put({
        ...entry,
        root,
        witnessedHead: head.id,
        witnessedHeight: head.height,
        ...(head.epoch !== undefined ? { lastEpoch: head.epoch } : {}),
      })
    },
    headOf: (root) => headRefOf(deps.store, root),
  }
}

// ===========================================================================
// MEMBER — serves pin-provision / pin-eval / pin-prove / pin-report /
// pin-handoff / fuse-check for the tOPRF committee.
// ===========================================================================

export interface MemberIdentity {
  nodeId: NodeId
  key: B64u
  priv: Uint8Array
}

export interface MemberDeps {
  wts: () => number
  fuseOf?: (root: B64u) => FuseRecord | null
  /** RNG for the DLEQ nonce when a member proves its partial honest. Optional —
   * without it, members prove deterministically. */
  dleqRng?: Rng
  /** Max age (ms, member clock) a `pin-prove` SUCCESS PROOF's wts may be from now
   * (§1 "within the session window"). Default 5 min — generous for clock skew,
   * still bounded. This gates ONLY the success proof; the fuse trippedWts window
   * is the §4 witnessed-time window (PARAMS_A2.timeWindowMs), independent of this. */
  sessionWindowMs?: number
}

/** Bound on the per-root recent-nonce window a member retains (prevents an
 * unauthenticated pin-eval flood from growing member memory without limit). A
 * proof is always prompt, so a few hundred outstanding nonces is ample. */
const MAX_ISSUED_NONCES = 512

/** Add to a bounded insertion-ordered set, evicting the oldest past `max`. */
function boundedAdd(set: Set<B64u>, v: B64u, max: number): void {
  set.add(v)
  if (set.size > max) {
    const oldest = set.values().next().value
    if (oldest !== undefined) set.delete(oldest)
  }
}

interface MemberShare {
  i: number
  scalar: bigint
  commitment: B64u
  pinPub: B64u
  /** id of the PIN record this share was provisioned under — binds pin-fuse-sign
   * to the member's OWN provisioned context (a fuse for a record it doesn't hold
   * a share under can't co-opt its signature). */
  pinRecord: EventId
  counter: PinCounterState
  /** Recent issued eval nonces (bounded). A nonce is REMOVED on a proven success,
   * so its presence means "issued and not yet spent" — one set covers both replay
   * protection and the rate window, with no unbounded `succeeded` set. */
  issued: Set<B64u>
  evalCount: number
}

export interface MemberServeHandle {
  /** Provision this member's share for a root (transport-encrypted in prod; the
   * mock delivers it in the clear). `pinRecord` binds the share to its PIN record
   * so pin-fuse-sign can reject a fuse for a record it doesn't hold. */
  provision(root: B64u, i: number, scalar: bigint, commitment: B64u, pinPub: B64u, pinRecord: EventId): void
  counter(root: B64u): PinCounterState
}

export function memberServe(
  fabric: FabricEndpoint,
  id: MemberIdentity,
  deps: MemberDeps,
): MemberServeHandle {
  const shares = new Map<B64u, MemberShare>()
  const fuseOf = deps.fuseOf ?? (() => null)

  const ensure = (root: B64u): MemberShare | null => shares.get(root) ?? null

  onSafe(fabric, 'pin-provision', async (_from, payload) => {
    const p = fromMsg<{
      newRecord: SignedPinRecord
      i: number
      share: B64u
      /** Re-provision (handoff) bundle — REQUIRED iff newRecord.payload.prev is set. */
      oldRecord?: SignedPinRecord
      handoff?: HandoffAuth
    }>(payload)

    // 1. The record must be genuinely root-signed + well-formed. (A password
    //    thief HOLDS the root key, so a root signature alone is NOT enough — the
    //    already-provisioned + handoff gates below are what stop him.)
    if (!verifyPinRecord(p.newRecord).ok) return asMsg({ error: 'bad-pin-record' })
    const nr = p.newRecord.payload
    const root = p.newRecord.root
    const newId = pinRecordId(nr)

    // 2. This member must actually be listed at index i, and its share must lie
    //    on the published commitment (Feldman) — else it cannot serve correct
    //    partials and would only self-DoS.
    if (!Number.isInteger(p.i) || p.i < 1 || p.i > nr.committee.length) return asMsg({ error: 'bad-index' })
    if (nr.committee[p.i - 1] !== id.nodeId) return asMsg({ error: 'not-in-committee' })
    const shareScalar = scalarFromBytes(fromB64u(p.share))
    if (toB64u(pointToBytes(shareCommitment(shareScalar))) !== nr.shareCommitments[p.i - 1])
      return asMsg({ error: 'share-commitment-mismatch' })

    // 3. Re-provision gate. A member that ALREADY holds a share for this root
    //    must NOT accept an initial-shaped (no-prev) record — that is exactly how
    //    a root-key holder would reset the fuse to zero by re-dealing a fresh
    //    committee. Any re-provision of a known root MUST set prev and pass the
    //    handoff. Only a genuine first enrollment takes the no-prev path.
    const existing = ensure(root)
    let startFails = 0
    if (existing) {
      if (nr.prev === undefined) return asMsg({ error: 'already-provisioned-needs-handoff' })
    }
    if (nr.prev !== undefined) {
      if (!p.oldRecord || !p.handoff) return asMsg({ error: 'reprovision-needs-handoff' })
      if (!verifyPinRecord(p.oldRecord).ok) return asMsg({ error: 'bad-old-record' })
      if (pinRecordId(p.oldRecord.payload) !== nr.prev) return asMsg({ error: 'old-record-not-prev' })
      // Old-committee key bindings come from TRUSTED presence (a node can only
      // announce for a nodeId derived from a root IT controls, so it cannot spoof
      // another committee member's nodeId) — never from the request.
      const dir = fabric.directory()
      const keyOf = new Map<NodeId, B64u>()
      for (const w of p.oldRecord.payload.committee) {
        const sp = dir.nodes.get(w)
        if (sp) keyOf.set(w, sp.body.key)
      }
      // The carried count's FLOOR is enforced authoritatively by the OLD committee
      // members (each refuses in pin-handoff to sign a carriedFails below its own
      // count), so ≥ pinT handoff signatures already attest carriedFails ≥ the
      // effective count. minCarry=0 here; the signed carriedFails is the floor.
      // (Verifying oldRecord/pinPub are the account's REAL current record is a
      // reader/A3 concern — see the header note on chain-authoritative state.)
      const hv = verifyHandoff(p.handoff, {
        oldCommittee: p.oldRecord.payload.committee,
        keyOf,
        pinPub: p.oldRecord.payload.pinPub,
        newRecord: p.newRecord,
        minCarry: 0,
      })
      if (!hv.ok) return asMsg({ error: 'bad-handoff', detail: hv.errors })
      startFails = nr.carriedFails ?? 0
    }
    // A member re-provisioned into an OVERLAPPING committee must never LOSE its
    // own accumulated failures — floor the starting count by what it already
    // holds (a purely local monotonicity invariant, no chain anchoring needed).
    if (existing) startFails = Math.max(startFails, memberFails(existing.counter))

    shares.set(root, {
      i: p.i,
      scalar: shareScalar,
      commitment: nr.shareCommitments[p.i - 1],
      pinPub: nr.pinPub,
      pinRecord: newId,
      counter: { evaluations: startFails, successes: 0 },
      issued: new Set(),
      evalCount: 0,
    })
    return asMsg({ ok: true })
  })

  onSafe(fabric, 'pin-eval', async (_from, payload) => {
    const { root, blinded } = fromMsg<{ root: B64u; blinded: B64u }>(payload)
    const s = ensure(root)
    if (!s) return asMsg({ error: 'not-provisioned' })
    // An honest member refuses to serve — and does NOT increment — while a fuse
    // bans the root (§1): the witnessed zone is closed, so deriving the pinKey is
    // pointless, and serving would let the ban window pile up failures against
    // the refill-by-R cooling-off. This is where the committee enforces the fuse
    // — NOT a single member's unverified word on a client-side gate.
    const evalFuse = fuseOf(root)
    if (evalFuse && isFuseActive(evalFuse, deps.wts())) return asMsg({ error: 'fuse-active' })
    // The blinded element must decode to a canonical ristretto point BEFORE we
    // count it — a junk (non-point) request must not consume a counter increment.
    try {
      pointFromBytes(fromB64u(blinded))
    } catch {
      return asMsg({ error: 'bad-blinded' })
    }
    // Every served evaluation increments the counter (C-2) — the rate limit.
    s.counter = applyEval(s.counter)
    s.evalCount += 1
    // deterministic, per (root, key, count) — a stable, injective nonce.
    const evalNonce = toB64u(sha256(canonicalBytes({ root, key: id.key, count: s.evalCount })))
    boundedAdd(s.issued, evalNonce, MAX_ISSUED_NONCES)
    const partial = memberBlindEvaluate(s.scalar, blinded)
    // ALWAYS attach a DLEQ proof binding the partial to this member's published
    // shareCommitment — the client's verifiability check is not optional (a
    // faulty/malicious member's wrong partial must be detectable, spec §1). The
    // deterministic prover needs no RNG, so the operator peer proves too; an
    // injected dleqRng only overrides the nonce source (reproducible suites).
    const proof = deps.dleqRng
      ? dleqProve(s.scalar, blinded, partial, s.commitment, deps.dleqRng)
      : dleqProveDeterministic(s.scalar, blinded, partial, s.commitment)
    return asMsg({ i: s.i, partial, evalNonce, proof })
  })

  onSafe(fabric, 'pin-prove', async (_from, payload) => {
    const { root, evalNonce, wts, sig } = fromMsg<{ root: B64u; evalNonce: B64u; wts: number; sig: B64u }>(payload)
    const s = ensure(root)
    if (!s) return asMsg({ ok: false, error: 'not-provisioned' })
    // Presence in `issued` means issued-and-not-yet-spent (spent nonces are
    // removed below), so this one check covers unknown AND replayed nonces.
    if (!s.issued.has(evalNonce)) return asMsg({ ok: false, error: 'unknown-or-spent-nonce' })
    // The success proof must be recent (§1 "within the session window"): a stale
    // wts is rejected against the member's own clock. Replay is already closed by
    // the single-use nonce; this bounds the window per spec.
    const windowMs = deps.sessionWindowMs ?? 300_000
    if (Math.abs(deps.wts() - wts) > windowMs) return asMsg({ ok: false, error: 'success-proof-stale' })
    if (!verifyPinSuccess(sig, root, evalNonce, wts, s.pinPub)) return asMsg({ ok: false, error: 'bad-success-proof' })
    s.issued.delete(evalNonce) // spend the nonce (prevents replay / double-credit)
    s.counter = applySuccess(s.counter)
    return asMsg({ ok: true })
  })

  onSafe(fabric, 'pin-report', async (_from, payload) => {
    const { root } = fromMsg<{ root: B64u }>(payload)
    const s = ensure(root)
    if (!s) return asMsg({ error: 'not-provisioned' })
    const report = signAttemptReport(s.counter, root, id.nodeId, id.key, id.priv, deps.wts())
    return asMsg({ report })
  })

  // Co-sign a fuse trip ONLY on the strength of THIS member's OWN monotonic
  // failure counter for THIS root. A fuse is real iff ≥ pinT members each
  // independently confirm their own count crossed the threshold — so it cannot be
  // forged with an attacker-supplied committee, cross-root-replayed reports, or a
  // far-future trip time. Nothing about the count is taken from the requester.
  onSafe(fabric, 'pin-fuse-sign', async (_from, payload) => {
    const p = fromMsg<{
      body: { v: 1; root: B64u; fails: number; trippedWts: number; expiryWts: number; pinRecord: EventId; params: B64u }
    }>(payload)
    const s = ensure(p.body.root)
    if (!s) return asMsg({ error: 'not-provisioned' })
    // The fuse must target the SAME PIN record this member holds a share under —
    // a fuse for a record I wasn't provisioned for can't co-opt my signature.
    if (p.body.pinRecord !== s.pinRecord) return asMsg({ error: 'pin-record-mismatch' })
    const now = deps.wts()
    // Idempotency: never co-sign a fresh trip while a fuse is already active.
    const held = fuseOf(p.body.root)
    if (held && isFuseActive(held, now)) return asMsg({ error: 'already-fused' })
    // Body well-formed (expiry = tripped + ban window, current params).
    const canon = fuseRecordBody(p.body.root, p.body.fails, p.body.trippedWts, p.body.pinRecord)
    if (p.body.expiryWts !== canon.expiryWts || p.body.params !== canon.params || p.body.v !== 1)
      return asMsg({ error: 'malformed-fuse-body' })
    // trippedWts must be ~now on MY clock (diversity-bound witnessed time, §4) —
    // no far-future ban window.
    if (Math.abs(now - p.body.trippedWts) > PARAMS_A2.timeWindowMs)
      return asMsg({ error: 'trippedWts-out-of-window' })
    // Self-qualify against a threshold the MEMBER derives from its OWN state, not
    // the requester's. The cycle floor comes from the member's held (expired)
    // fuse — the next trip needs pinRefill more than the last one — so a requester
    // cannot understate the trip index to re-ban at 100 after a refill (the
    // counter is monotonically ≥ 100 post-trip). No trips value is trusted.
    const threshold =
      held && held.body.root === p.body.root ? held.body.fails + PARAMS_A2.pinRefill : PARAMS_A2.pinLifetimeFails
    const own = memberFails(s.counter)
    if (own < threshold) return asMsg({ error: 'not-due' })
    if (p.body.fails < threshold) return asMsg({ error: 'body-below-threshold' })
    // Upper-bound the recorded count by MY OWN observed failures. With ≥ pinT
    // signers each enforcing this, body.fails ≤ the t-th-largest counter = the
    // committee-effective count — so the recorded fails can never be inflated to
    // push a FUTURE cycle's threshold (held.body.fails + pinRefill) out of reach.
    if (p.body.fails > own) return asMsg({ error: 'body-above-own-count' })
    return asMsg({ sig: signFuse(canon, id.nodeId, id.key, id.priv) })
  })

  // Co-sign a committee handoff ONLY when the requester proves PIN knowledge (a
  // session against the pinPub THIS member holds — a password thief without the
  // PIN cannot produce it) AND the carried count is ≥ this member's own count
  // (so ≥ pinT signatures force carriedFails ≥ the effective count, §1).
  onSafe(fabric, 'pin-handoff', async (_from, payload) => {
    const p = fromMsg<{ root: B64u; prevPinRecord: EventId; newPinRecord: EventId; carriedFails: number; session: PinSession }>(payload)
    const s = ensure(p.root)
    if (!s) return asMsg({ error: 'not-provisioned' })
    if (!p.session || !verifyPinSession(p.session, s.pinPub)) return asMsg({ error: 'bad-session' })
    if (p.session.body.purpose !== 'committee-handoff' || p.session.body.root !== p.root)
      return asMsg({ error: 'bad-session-scope' })
    // The session must authorize THIS specific new record — no replay to another.
    if (p.session.body.record !== p.newPinRecord) return asMsg({ error: 'session-record-mismatch' })
    if (p.carriedFails < memberFails(s.counter)) return asMsg({ error: 'carried-below-my-count' })
    const sig = signHandoff(p.root, p.prevPinRecord, p.newPinRecord, p.carriedFails, id.nodeId, id.key, id.priv)
    return asMsg({ sig })
  })

  serveFuseCheck(fabric, fuseOf, deps.wts)

  return {
    provision(root, i, scalar, commitment, pinPub, pinRecord) {
      shares.set(root, {
        i,
        scalar,
        commitment,
        pinPub,
        pinRecord,
        counter: newCounter(),
        issued: new Set(),
        evalCount: 0,
      })
    },
    counter(root) {
      return shares.get(root)?.counter ?? newCounter()
    },
  }
}

// ===========================================================================
// CLIENT — request a lease, append a witnessed event, run a PIN evaluation.
// ===========================================================================

export interface RequestLeaseOpts {
  fabric: FabricEndpoint
  root: B64u
  epoch: number
  deviceKey: B64u
  devicePriv: Uint8Array
  /** Proposed grant time (client clock). Grantors return their own wts. */
  grantedWts: number
  ttlMs: number
  paramsDigest: B64u
  subject: SubjectSummary
  summaries: ReadonlyMap<NodeId, ChainSummary>
  params: LeaseParams
  nowMs: number
  /** Takeover session reference (different device); pass to embed body.takeover. */
  takeover?: { session: PinSession }
}

export type RequestLeaseResult =
  | { ok: true; lease: Lease; witnessSet: NodeId[] }
  | { ok: false; reason: string; witnessSet: NodeId[] }

/**
 * Gather grants from the account's canonical witness set until the effective
 * threshold — min(tLease, |witnessSet|), floored at 1 — is met. Honest
 * degradation: if fewer than the threshold reachable eligible witnesses grant,
 * returns {ok:false, reason:'insufficient-witnesses'} — never a dead grant that
 * would fail verifyLease (the 2-user rated-play boundary, spec §4/C-10).
 */
export async function clientRequestLease(opts: RequestLeaseOpts): Promise<RequestLeaseResult> {
  const directory = opts.fabric.directory()
  const witnessSet = canonicalWitnessSet(opts.subject, directory, opts.summaries, opts.params, opts.nowMs)
  const effectiveThreshold = Math.max(1, Math.min(opts.params.tLease, witnessSet.length))

  const body: LeaseBody = buildLeaseBody({
    root: opts.root,
    epoch: opts.epoch,
    device: opts.deviceKey,
    grantedWts: opts.grantedWts,
    ttlMs: opts.ttlMs,
    params: opts.paramsDigest,
    ...(opts.takeover ? { takeover: pinSessionId(opts.takeover.session) } : {}),
  })
  const bodyHash = leaseBodyHash(body)

  const grants = []
  const seen = new Set<NodeId>()
  for (const w of witnessSet) {
    if (grants.length >= effectiveThreshold) break
    try {
      const res = await req<{ grant?: { w: NodeId; key: B64u; wts: number; sig: B64u }; error?: string }>(
        opts.fabric,
        w,
        'lease-grant',
        { leaseBody: body },
      )
      if (!res.grant) continue
      const g = res.grant
      if (g.w !== w || seen.has(g.w)) continue
      if (!verifyGrantSig(g, bodyHash)) continue
      seen.add(g.w)
      grants.push(g)
    } catch {
      // Unreachable witness — skip; honest degradation handles the shortfall.
    }
  }

  if (grants.length < effectiveThreshold)
    return { ok: false, reason: 'insufficient-witnesses', witnessSet }
  return { ok: true, lease: grantLease(body, grants), witnessSet }
}

export interface AppendWitnessedOpts {
  fabric: FabricEndpoint
  chain: Chain
  lease: Lease
  deviceKey: B64u
  devicePriv: Uint8Array
  type: EventType
  payload: CanonicalObject
  ts: number
  epoch: number
  witnessSet: readonly NodeId[]
  /** Both players' nodeIds — a rated event needs ≥1 attestation from a witness
   * that is NEITHER player (spec §4). */
  players: ReadonlySet<NodeId>
  /** Minimum non-player attestations required (default 1). */
  minWitnesses?: number
}

export type AppendWitnessedResult =
  | { ok: true; event: SignedEvent; chain: Chain; attestations: WitnessAttestation[] }
  | { ok: false; reason: string }

/**
 * Build a witnessed-lane event under the lease, collect ≥ minWitnesses valid
 * attestations from witnesses that are NEITHER player, attach them, and append.
 */
export async function clientAppendWitnessed(opts: AppendWitnessedOpts): Promise<AppendWitnessedResult> {
  const head = witnessedHead(opts.chain)
  if (!head) return { ok: false, reason: 'no-genesis' }
  const body: EventBody = {
    v: 1,
    lane: 'w',
    type: opts.type,
    root: opts.chain.root,
    key: opts.deviceKey,
    height: head.height + 1,
    prev: head.id,
    ts: opts.ts,
    payload: opts.payload,
  }
  const event = signBody(body, opts.devicePriv)
  const evId = eventId(body)

  // Fan out to the witness set concurrently (each witness serializes its own
  // attests; there is no cross-witness ordering to preserve). Promise.all keeps
  // input order, so the attestation set is deterministic.
  const gathered = await Promise.all(
    opts.witnessSet.map(async (w): Promise<{ w: NodeId; att: WitnessAttestation } | null> => {
      try {
        const res = await req<{ attestation?: WitnessAttestation; error?: string }>(opts.fabric, w, 'attest', { event, lease: opts.lease })
        if (!res.attestation || !verifyAttestation(res.attestation, evId)) return null
        return { w, att: res.attestation }
      } catch {
        return null // unreachable witness
      }
    }),
  )
  const attestations: WitnessAttestation[] = []
  const counted = new Set<NodeId>()
  let nonPlayer = 0
  for (const g of gathered) {
    if (!g || counted.has(g.w)) continue
    counted.add(g.w)
    attestations.push(g.att)
    if (!opts.players.has(g.w)) nonPlayer += 1
  }

  const min = opts.minWitnesses ?? 1
  if (nonPlayer < min) return { ok: false, reason: 'no-non-player-witness' }

  const witnessed: SignedEvent = { ...event, wit: attestations }
  const chain = appendEvent(opts.chain, witnessed)
  return { ok: true, event: witnessed, chain, attestations }
}

// --- PIN evaluation flow ---------------------------------------------------

export interface PinCommittee {
  members: NodeId[]
  t: number
  shareCommitments: B64u[]
  pinPub: B64u
}

export interface PinVerifyOpts {
  fabric: FabricEndpoint
  root: B64u
  pin: string
  committee: PinCommittee
  /** Client clock for the success proof. */
  wts: number
  /** Injected blind RNG (reproducible suites). */
  rng?: Rng
  /**
   * Verify each member's DLEQ proof against its published shareCommitment.
   * Defaults to TRUE — the committee's verifiability is not optional; a member
   * without a valid proof is treated as faulty and skipped (the t-of-n gather
   * routes around it). Only a test that deliberately exercises the unverified
   * path should pass false.
   */
  checkDleq?: boolean
}

export type PinVerifyResult =
  | { ok: true; pinPriv: Uint8Array; pinPub: B64u; output: Uint8Array }
  | { ok: false; reason: string; pinPub?: B64u }

/**
 * Run one committee PIN evaluation, T-of-N (spec §1): blind, then query committee
 * members IN ORDER until `t` of them return a valid, DLEQ-verified partial —
 * routing around any member that is unreachable, errors, fails its proof, or
 * refuses because a fuse bans the root. Combine those t partials, finalize,
 * derive the pinKey. On a correct PIN (derived pinPub == the committee's pinPub)
 * prove success back to exactly the members whose partials were used (net-zero
 * counter contribution). A wrong PIN still consumed one evaluation at each
 * queried member — that IS the rate limit that eventually trips the fuse.
 *
 * Gathering the FIRST t responders (not a fixed prefix of the committee) is what
 * makes this a real threshold: a single down or faulty member can no longer deny
 * the honest owner their PIN. DLEQ is enforced by default; a member that omits
 * or fails its proof is faulty and skipped, never silently trusted.
 *
 * The fuse is enforced BY THE COMMITTEE, not by trusting one member's word: an
 * honest member refuses to serve a fuse-banned root (memberServe pin-eval), so a
 * genuinely banned account cannot reach t partials (≤ n−t members would serve).
 * A single member cannot forge a ban (it can only make itself one skipped node)
 * nor hide one (≥ t honest members still refuse). `fuse-active` is surfaced only
 * as a reason when the quorum could not be reached — never as a unilateral deny.
 */
export async function pinVerifyFlow(opts: PinVerifyOpts): Promise<PinVerifyResult> {
  const { fabric, root, committee } = opts
  const n = committee.members.length
  if (n < committee.t) return { ok: false, reason: 'committee-too-small' }
  const checkDleq = opts.checkDleq !== false // verifiability is on unless a test opts out

  const blind = clientBlind(opts.pin, opts.rng)
  const partials: OprfPartial[] = []
  const used: { member: NodeId; evalNonce: B64u }[] = []
  const seenIdx = new Set<number>()
  let sawFuseActive = false
  for (const m of committee.members) {
    if (partials.length >= committee.t) break // enough valid partials gathered
    let res: { i?: number; partial?: B64u; evalNonce?: B64u; proof?: { c: B64u; z: B64u }; error?: string }
    try {
      res = await req(fabric, m, 'pin-eval', { root, blinded: blind.blinded })
    } catch {
      continue // unreachable member — route around it
    }
    // A member refusing because a fuse bans the root: note it, but one member's
    // word is NOT decisive — keep gathering. We surface it as a reason only if
    // the honest quorum also can't be reached (below).
    if (res.error === 'fuse-active') {
      sawFuseActive = true
      continue
    }
    if (res.error || res.partial === undefined || res.evalNonce === undefined) continue
    // The claimed share index must be a real, not-yet-used committee slot.
    if (!Number.isInteger(res.i) || res.i! < 1 || res.i! > n || seenIdx.has(res.i!)) continue
    // Verifiability: a valid DLEQ proof binding the partial to THIS index's
    // published commitment. A missing or bad proof ⇒ faulty member ⇒ skip.
    if (checkDleq) {
      const commit = committee.shareCommitments[res.i! - 1]
      if (!commit || !res.proof || !dleqVerify(blind.blinded, res.partial, commit, res.proof)) continue
    }
    seenIdx.add(res.i!)
    partials.push({ i: res.i!, partial: res.partial })
    used.push({ member: m, evalNonce: res.evalNonce })
  }
  if (partials.length < committee.t)
    return { ok: false, reason: sawFuseActive ? 'fuse-active' : 'insufficient-partials' }

  // Combine → finalize → derive. On the checkDleq:false path a member's partial
  // was never point-validated, so a non-canonical or identity-producing partial
  // can throw here; return a typed verdict rather than rejecting the promise.
  let output: Uint8Array
  let pinKey: { priv: Uint8Array; pub: Uint8Array }
  try {
    const combined = combinePartials(partials, committee.t)
    output = clientFinalize(opts.pin, blind.blindState, combined)
    pinKey = pinKeyFromOutput(output)
  } catch {
    return { ok: false, reason: 'bad-partials' }
  }
  const pinPubB = toB64u(pinKey.pub)
  if (pinPubB !== committee.pinPub) return { ok: false, reason: 'wrong-pin', pinPub: pinPubB }

  // Correct PIN — prove success to exactly the members we used (net-zero).
  for (const u of used) {
    const sig = signPinSuccess(root, u.evalNonce, opts.wts, pinKey.priv)
    try {
      await req(fabric, u.member, 'pin-prove', { root, evalNonce: u.evalNonce, wts: opts.wts, sig })
    } catch {
      /* Best-effort. A dropped success proof leaves that eval UNcredited — a
         residual +1 fail at that member — which biases toward a false ban, not
         toward bypassing one. The member still accepts the unspent nonce, so a
         later session can re-prove it (client-side nonce persistence: A6). */
    }
  }
  return { ok: true, pinPriv: pinKey.priv, pinPub: pinPubB, output }
}

/**
 * Gather signed attempt reports from `members`, keeping only those whose
 * signature verifies under the member's advertised signing key (`keyOf`). The
 * caller reduces them with pin.effectiveCount (the t-th largest fails value).
 */
export async function collectAttemptReports(
  fabric: FabricEndpoint,
  root: B64u,
  members: readonly NodeId[],
  keyOf: (w: NodeId) => B64u | undefined,
): Promise<PinAttemptReport[]> {
  // Query members concurrently — reports have no per-request cost (unlike evals),
  // so there is no reason to pay N round-trips serially. Promise.all preserves
  // input order, so the reduced result stays deterministic.
  const results = await Promise.all(
    members.map(async (m): Promise<PinAttemptReport | null> => {
      try {
        const res = await req<{ report?: PinAttemptReport; error?: string }>(fabric, m, 'pin-report', { root })
        const r = res.report
        // Bind the report to THIS member and THIS account: a member cannot
        // attribute a count to another node's nodeId, nor replay a report signed
        // for a different root, to skew effectiveCount.
        if (!r || r.w !== m || r.root !== root) return null
        const key = keyOf(m)
        if (key === undefined || !verifyAttemptReport(r, key)) return null
        return r
      } catch {
        return null // unreachable member
      }
    }),
  )
  return results.filter((r): r is PinAttemptReport => r !== null)
}

// --- Fuse trip (spec §1) — the live rate-limit enforcement -----------------

export interface TripFuseOpts {
  fabric: FabricEndpoint
  root: B64u
  committee: readonly NodeId[]
  /** id of the account's CURRENT PIN record (binds the fuse to this committee). */
  pinRecord: EventId
  /** nodeId → each committee member's advertised signing key (presence/certs). */
  keyOf: ReadonlyMap<NodeId, B64u>
  /** Trip timestamp (aggregator clock; the co-signed body carries it). */
  wts: number
  /** The account's current held fuse (expired, or none) — sets the cycle floor
   * exactly as each member does in pin-fuse-sign (heldFuse.body.fails + pinRefill,
   * else pinLifetimeFails), so the aggregator's due-check agrees with the committee
   * and never wastes a round trying a trip the members will refuse. */
  heldFuse?: FuseRecord | null
  /** Co-signatures required (default pinT). */
  minSigs?: number
}

/**
 * Establish the committee-effective failure count from the members' MONOTONIC,
 * success-aware attempt counters (pin-report → effectiveCount, the t-th-largest),
 * and — if it reaches the current cycle's fuse threshold — gather ≥ minSigs
 * committee co-signatures on a threshold-signed fuse record. Each co-signer
 * (pin-fuse-sign) signs ONLY on the strength of ITS OWN counter for THIS root and
 * PIN record, so a fuse cannot be forged from attacker-supplied reports/committee
 * or cross-root-replayed. Returns null when the fuse is not due or the committee
 * won't co-sign. This is the live rate-limit enforcement (previously unwired).
 *
 * NOTE (accepted A2 residual): effectiveCount is the t-th-largest of per-member
 * counters, which an attacker who SPREADS guesses across the committee can hold
 * below the threshold (~n/(n-t+1)× the nominal budget). Defeating spreading needs
 * the spec's committee-wide gossip of served evaluations, whose reliable, Byzantine
 * dissemination + authoritative storage land with A3's overlay — the counters and
 * this trip flow are the seam. The count remains monotonic, success-aware, and
 * unforgeable; only the spreading discount is deferred.
 */
export async function tripFuseIfDue(opts: TripFuseOpts): Promise<FuseRecord | null> {
  // 1. effective count from monotonic per-member attempt reports (t-th-largest).
  const reports = await collectAttemptReports(opts.fabric, opts.root, opts.committee, (w) => opts.keyOf.get(w))
  const effective = effectiveCount(reports, PARAMS_A2.pinT)
  // The due-threshold is the SAME floor each member derives from the account's
  // held fuse — so the aggregator never tries a trip the committee would refuse.
  const threshold =
    opts.heldFuse && opts.heldFuse.body.root === opts.root
      ? opts.heldFuse.body.fails + PARAMS_A2.pinRefill
      : PARAMS_A2.pinLifetimeFails
  if (effective < threshold) return null

  // 2. gather ≥ minSigs independent co-signatures (concurrently — signing has no
  //    per-request cost); each member self-qualifies on its own counter +
  //    PIN-record binding inside pin-fuse-sign.
  const body = fuseRecordBody(opts.root, effective, opts.wts, opts.pinRecord)
  const gathered = await Promise.all(
    opts.committee.map(async (w): Promise<{ w: NodeId; key: B64u; sig: B64u } | null> => {
      try {
        const res = await req<{ sig?: { w: NodeId; key: B64u; sig: B64u }; error?: string }>(opts.fabric, w, 'pin-fuse-sign', { body })
        const g = res.sig
        const key = opts.keyOf.get(w)
        return g && g.w === w && key && g.key === key ? g : null
      } catch {
        return null
      }
    }),
  )
  const sigs: { w: NodeId; key: B64u; sig: B64u }[] = []
  const seenSig = new Set<NodeId>()
  for (const g of gathered) {
    if (g && !seenSig.has(g.w)) {
      seenSig.add(g.w)
      sigs.push(g)
    }
  }
  const minSigs = opts.minSigs ?? PARAMS_A2.pinT
  if (sigs.length < minSigs) return null
  return makeFuseRecord(opts.root, effective, opts.wts, opts.pinRecord, sigs)
}

// ---------------------------------------------------------------------------
// small local helper (no re-implementation of A1 primitives)
// ---------------------------------------------------------------------------

function witnessedHead(chain: Chain): { id: EventId; height: number } | null {
  return witnessedHeadOf(chain.events)
}
