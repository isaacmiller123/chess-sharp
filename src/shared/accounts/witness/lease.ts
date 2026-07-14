// A2 fabric — the write lease (spec §4): threshold-granted, epoch-fenced write
// authority for one device of an account. A lease is valid iff ≥ T_lease
// distinct grantors from the account's canonical witness set each signed it,
// its granted time sits within the clock window of the grantors' median, its
// epoch advances monotonically, no unexpired fuse bans the root, and — for a
// takeover by a DIFFERENT device — it carries a PIN-gated session that verifies
// against the account's active pinPub.
//
// GENERATION (buildLeaseBody/signGrant/grantLease) mints records; VERIFICATION
// (verifyLease/verifyGrantSig) is a pure function of its inputs — same bytes →
// same verdict on node and in the browser bundle. Platform-neutral: no `node:`
// imports, no DOM globals. All signing/hashing/serialization is A1's + pin.ts's;
// nothing is re-implemented here.

import { canonicalBytes, canonicalHash } from '../codec'
import { ed25519, toB64u, verifySigB64u as verifySig } from '../hash'
import type { B64u } from '../types'
import { nodeIdOf } from './distance'
import { canonicalWitnessSet, type ChainSummary, type EligibilityParams } from './eligibility'
import { isFuseActive, verifyPinSession } from './pin'
import type {
  FuseRecord,
  Lease,
  LeaseBody,
  LeaseGrant,
  NodeDirectory,
  NodeId,
  PinSession,
  SubjectSummary,
} from './types'
import { medianInt } from './wtime'

// ---------------------------------------------------------------------------
// Lease body + grant construction
// ---------------------------------------------------------------------------

export interface BuildLeaseOpts {
  root: B64u
  epoch: number
  device: B64u
  grantedWts: number
  ttlMs: number
  params: B64u
  /** eventId/hash of the PIN session authorizing a takeover (different device). */
  takeover?: B64u
}

/** Assemble a LeaseBody (the exact object grantors sign over). */
export function buildLeaseBody(opts: BuildLeaseOpts): LeaseBody {
  const body: LeaseBody = {
    v: 1,
    root: opts.root,
    epoch: opts.epoch,
    device: opts.device,
    grantedWts: opts.grantedWts,
    ttlMs: opts.ttlMs,
    params: opts.params,
  }
  if (opts.takeover !== undefined) body.takeover = opts.takeover
  return body
}

/** sha256(canonicalBytes(leaseBody)) b64u — what each grant signature covers. */
export function leaseBodyHash(body: LeaseBody): B64u {
  return toB64u(canonicalHash(body))
}

/** The canonical bytes one grantor signs: {body: leaseBodyHash, w, wts} (§4). */
export function grantBytes(bodyHash: B64u, w: NodeId, wts: number): Uint8Array {
  return canonicalBytes({ body: bodyHash, w, wts })
}

/**
 * One grantor signs a lease body. `w` is the grantor's nodeId, `key` its
 * signing device key (certified in its own chain, advertised in presence),
 * `wts` its independent clock reading — all three bound by one signature.
 */
export function signGrant(
  body: LeaseBody,
  w: NodeId,
  key: B64u,
  priv: Uint8Array,
  wts: number,
): LeaseGrant {
  const sig = toB64u(ed25519.sign(grantBytes(leaseBodyHash(body), w, wts), priv))
  return { w, key, wts, sig }
}

/** Verify one grant's signature binds (bodyHash, w, wts) under grant.key. Pure. */
export function verifyGrantSig(grant: LeaseGrant, bodyHash: B64u): boolean {
  return verifySig(grant.sig, grantBytes(bodyHash, grant.w, grant.wts), grant.key)
}

/** Bundle a lease body with its collected grants. */
export function grantLease(body: LeaseBody, grants: readonly LeaseGrant[]): Lease {
  return { body, grants: [...grants] }
}

/** The takeover reference id of a PIN session (matches LeaseBody.takeover). */
export function pinSessionId(session: PinSession): B64u {
  return toB64u(canonicalHash(session.body))
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

/** PARAMS_A2 subset the lease math reads (PARAMS_A2 satisfies it). */
export interface LeaseParams extends EligibilityParams {
  /** Lease grant threshold (strict majority of wN). */
  tLease: number
}

export interface VerifyLeaseCtx {
  subject: SubjectSummary
  directory: NodeDirectory
  summaries: ReadonlyMap<NodeId, ChainSummary>
  params: LeaseParams
  nowMs: number
  /** Any fuse record the verifier holds for the root (null ⇒ none). Granting
   * into an unexpired fuse is witness misbehavior — the lease is invalid. */
  fuse?: FuseRecord | null
  /** The previously observed lease for this root, if any — fences epoch and
   * decides whether a takeover gate is required. */
  prior?: { epoch: number; device: B64u } | null
  /** pinPub from the account's active PIN record — required to check a takeover. */
  pinPub?: B64u
  /** The PIN session a takeover lease references (must hash to body.takeover). */
  session?: PinSession
}

export interface LeaseVerify {
  ok: boolean
  errors: string[]
  /** The canonical witness set the verdict was judged against (diagnostic). */
  witnessSet: NodeId[]
  /** Distinct valid grantors that were counted. */
  validGrantors: NodeId[]
}

/**
 * Verify a lease against the account's canonical witness set (spec §4). The
 * effective threshold is min(tLease, |witnessSet|) with a floor of 1 — so the
 * 2-user rated-play boundary (C-10) has a live grantor, never a dead button —
 * while at full population the strict-majority tLease makes two overlapping-epoch
 * leases impossible. Pure. Error strings are a stable, sorted API.
 */
export function verifyLease(lease: Lease, ctx: VerifyLeaseCtx): LeaseVerify {
  const errors: string[] = []
  const { subject, directory, summaries, params, nowMs } = ctx
  const body = lease.body
  const bodyHash = leaseBodyHash(body)

  // The canonical witness set the grants must come from (folds eligibility +
  // small-population relaxation). Grants are only ever admissible from this set.
  const witnessSet = canonicalWitnessSet(subject, directory, summaries, params, nowMs)
  const witnessSetIds = new Set(witnessSet)
  const effectiveThreshold = Math.max(1, Math.min(params.tLease, witnessSet.length))

  // Bind lease body to the subject.
  if (body.root !== subject.root) errors.push('lease: body root != subject root')
  if (body.epoch < 1) errors.push('lease: epoch must be ≥ 1')

  // Count distinct valid grantors: each must be in the witness set, its grant
  // signature must verify over the body, and its signing key must match the key
  // that node advertises in its presence record (no key-spoofing a distance).
  const validGrantors: NodeId[] = []
  const counted = new Set<NodeId>()
  const grantWts: number[] = []
  for (const g of lease.grants) {
    if (!witnessSetIds.has(g.w)) {
      errors.push(`lease: grantor ${g.w} not in the canonical witness set`)
      continue
    }
    if (counted.has(g.w)) continue // one grant per node
    const advertised = directory.nodes.get(g.w)?.body.key
    if (advertised !== undefined && advertised !== g.key) {
      errors.push(`lease: grantor ${g.w} key does not match its advertised presence key`)
      continue
    }
    // Distance integrity: the grantor's nodeId must equal sha256(its root).
    const presenceRoot = directory.nodes.get(g.w)?.body.root
    if (presenceRoot !== undefined && nodeIdOf(presenceRoot) !== g.w) {
      errors.push(`lease: grantor ${g.w} nodeId does not derive from its presence root`)
      continue
    }
    if (!verifyGrantSig(g, bodyHash)) {
      errors.push(`lease: bad grant signature from ${g.w}`)
      continue
    }
    counted.add(g.w)
    validGrantors.push(g.w)
    grantWts.push(g.wts)
  }
  if (validGrantors.length < effectiveThreshold)
    errors.push(`lease: only ${validGrantors.length} valid grantors (need ${effectiveThreshold})`)

  // Witnessed grant time: within the clock window of the grantors' median.
  if (grantWts.length > 0) {
    const median = medianInt(grantWts)
    if (Math.abs(body.grantedWts - median) > params.timeWindowMs)
      errors.push('lease: grantedWts outside the clock window of the grantor median')
  }

  // Expiry.
  if (nowMs >= body.grantedWts + body.ttlMs) errors.push('lease: expired')

  // Epoch monotonicity + takeover gate.
  const prior = ctx.prior ?? null
  if (prior) {
    const sameDevice = body.device === prior.device
    if (sameDevice) {
      // Crash-recovery renewal: epoch may hold or advance, never regress.
      if (body.epoch < prior.epoch) errors.push('lease: epoch regressed below the prior lease')
    } else {
      // Takeover by a different device REQUIRES a strictly higher epoch AND a
      // PIN-gated session that authorizes exactly this device.
      if (body.epoch <= prior.epoch) errors.push('lease: takeover must advance the epoch')
      const gate = verifyTakeover(body, ctx)
      for (const e of gate) errors.push(e)
    }
  }

  // Fuse: granting into an unexpired fuse window is witness misbehavior (§1/§4).
  if (ctx.fuse && ctx.fuse.body.root === body.root && isFuseActive(ctx.fuse, nowMs))
    errors.push('lease: root has an active fuse (grantors must refuse)')

  errors.sort()
  return { ok: errors.length === 0, errors, witnessSet, validGrantors }
}

/** Takeover-gate checks (§4): a valid PIN session authorizing this device. */
function verifyTakeover(body: LeaseBody, ctx: VerifyLeaseCtx): string[] {
  const errors: string[] = []
  if (body.takeover === undefined) {
    errors.push('takeover: different device but no PIN session referenced')
    return errors
  }
  if (ctx.pinPub === undefined) {
    errors.push('takeover: no active pinPub to verify the session against')
    return errors
  }
  const session = ctx.session
  if (!session) {
    errors.push('takeover: referenced PIN session not presented')
    return errors
  }
  if (pinSessionId(session) !== body.takeover) errors.push('takeover: session id != lease.takeover reference')
  if (session.body.purpose !== 'lease-takeover') errors.push('takeover: session purpose is not lease-takeover')
  if (session.body.root !== body.root) errors.push('takeover: session root != lease root')
  if (session.body.device !== body.device) errors.push('takeover: session authorizes a different device')
  // Epoch-bind: the session must authorize THIS lease's epoch, so a takeover
  // session captured at one epoch cannot be replayed to authorize a later one.
  if (session.body.epoch !== body.epoch) errors.push('takeover: session epoch != lease epoch')
  if (!verifyPinSession(session, ctx.pinPub)) errors.push('takeover: session signature does not verify under pinPub')
  return errors
}
