// The account chain (spec §0/§2): a self-carried, append-only, hash-linked
// log of signed events in two lanes. This module owns the container —
// creation, structural append, full verification, and the canonical file
// format. Verification implements EXACTLY the linkage rules documented in
// types.ts and NEVER throws on bad input: bad chains come back as
// VerifyResult errors; only programmer misuse throws (appendEvent & co).
//
// Platform-neutral: no `node:` imports, no DOM globals.

import { basicFold, type BasicFoldState } from './checkpoint'
import {
  canonicalBytes,
  canonicalHash,
  compareKeys,
  parseCanonical,
  type CanonicalObject,
  type CanonicalValue,
} from './codec'
import {
  LANE_FOR,
  eventId,
  personalHeadOf,
  signBody,
  stableIssueDetail,
  verifyEventSig,
  witnessedHeadOf,
  zB64u32,
  zSignedEvent,
  zSignedEventCore,
} from './events'
import { sha256, toB64u } from './hash'
import { PARAMS_V1_DIGEST } from './params'
import {
  KEY_PURPOSE,
  PROFILE_FIELDS,
  type B64u,
  type CertPayload,
  type Chain,
  type CheckpointPayload,
  type EventBody,
  type EventId,
  type EventType,
  type GenesisPayload,
  type RevokePayload,
  type SignedEvent,
  type VerifyError,
  type VerifyErrorCode,
  type VerifyResult,
} from './types'
import { z } from 'zod'

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

export interface CreateAccountOpts {
  rootPriv: Uint8Array
  rootPub: Uint8Array
  displayName: string
  ts: number
  /** Optional first device enrollment (root-signed personal-lane cert). */
  device?: { pub: B64u; index: number; label?: string }
}

/**
 * Create a fresh account chain: the genesis event (witnessed lane, height 0,
 * prev absent, root-signed, payload binding the frozen parameter digest and
 * the display name), plus an optional device certificate — the root key's
 * FIRST personal-lane event, so height 0 with prev absent.
 */
export function createAccountChain(opts: CreateAccountOpts): Chain {
  const root = toB64u(opts.rootPub)
  const genesisBody: EventBody = {
    v: 1,
    lane: 'w',
    type: 'genesis',
    root,
    key: root,
    height: 0,
    ts: opts.ts,
    payload: { params: PARAMS_V1_DIGEST, name: opts.displayName },
  }
  let chain: Chain = { root, events: [signBody(genesisBody, opts.rootPriv)] }
  if (opts.device) {
    const certBody: EventBody = {
      v: 1,
      lane: 'p',
      type: 'cert',
      root,
      key: root,
      height: 0,
      ts: opts.ts,
      payload: {
        pub: opts.device.pub,
        purpose: KEY_PURPOSE.device,
        index: opts.device.index,
        ...(opts.device.label !== undefined ? { label: opts.device.label } : {}),
      },
    }
    chain = appendEvent(chain, signBody(certBody, opts.rootPriv))
  }
  return chain
}

// ---------------------------------------------------------------------------
// Structural append
// ---------------------------------------------------------------------------

/**
 * Admit one signed event structurally: shape + payload schema, signature,
 * root binding, and linkage/height contiguity against the CURRENT heads.
 * Returns a new Chain (never mutates); throws Error on inadmissible input.
 * Certification/revocation admissibility is verifyChain's business — the
 * append gate is purely structural.
 */
export function appendEvent(chain: Chain, ev: SignedEvent): Chain {
  const shape = zSignedEvent.safeParse(ev)
  if (!shape.success) {
    const issue = shape.error.issues[0]
    throw new Error(
      `appendEvent: invalid event: ${issue ? `${issue.path.map(String).join('.')}: ${issue.message}` : 'bad shape'}`,
    )
  }
  canonicalBytes(ev.body) // throws CodecError on non-canonical bodies (floats, null, non-NFC)
  if (ev.body.root !== chain.root) throw new Error('appendEvent: event root does not match chain root')
  if (!verifyEventSig(ev)) throw new Error('appendEvent: signature does not verify')
  const b = ev.body
  if (b.lane === 'w') {
    const head = witnessedHeadOf(chain.events)
    if (b.type === 'genesis') {
      if (head) throw new Error('appendEvent: genesis onto a non-empty witnessed lane')
      if (b.height !== 0 || b.prev !== undefined)
        throw new Error('appendEvent: genesis must be height 0 with prev absent')
    } else {
      if (!head) throw new Error('appendEvent: witnessed lane has no genesis')
      if (b.height !== head.height + 1)
        throw new Error(`appendEvent: witnessed height ${b.height} is not contiguous (head is ${head.height})`)
      if (b.prev !== head.id) throw new Error('appendEvent: prev does not match the witnessed head')
    }
  } else {
    const head = personalHeadOf(chain.events, b.key)
    if (head) {
      if (b.height !== head.height + 1)
        throw new Error(`appendEvent: personal height ${b.height} is not contiguous for key (head is ${head.height})`)
      if (b.prev !== head.id) throw new Error("appendEvent: prev does not match the key's personal head")
    } else if (b.height !== 0 || b.prev !== undefined) {
      throw new Error("appendEvent: a key's first personal event must be height 0 with prev absent")
    }
  }
  return { root: chain.root, events: [...chain.events, ev] }
}

/** Build, sign and append a witnessed-lane event at the current head. */
export function appendWitnessed(
  chain: Chain,
  priv: Uint8Array,
  key: B64u,
  type: EventType,
  payload: CanonicalObject,
  ts: number,
): Chain {
  if (LANE_FOR[type] !== 'w') throw new Error(`appendWitnessed: '${type}' is not a witnessed-lane type`)
  const head = witnessedHeadOf(chain.events)
  if (!head) throw new Error('appendWitnessed: chain has no genesis')
  const body: EventBody = {
    v: 1,
    lane: 'w',
    type,
    root: chain.root,
    key,
    height: head.height + 1,
    prev: head.id,
    ts,
    payload,
  }
  return appendEvent(chain, signBody(body, priv))
}

/** Build, sign and append a personal-lane event on `key`'s per-key chain. */
export function appendPersonal(
  chain: Chain,
  priv: Uint8Array,
  key: B64u,
  type: EventType,
  payload: CanonicalObject,
  ts: number,
): Chain {
  if (LANE_FOR[type] !== 'p') throw new Error(`appendPersonal: '${type}' is not a personal-lane type`)
  const head = personalHeadOf(chain.events, key)
  const body: EventBody = {
    v: 1,
    lane: 'p',
    type,
    root: chain.root,
    key,
    height: head ? head.height + 1 : 0,
    ...(head ? { prev: head.id } : {}),
    ts,
    payload,
  }
  return appendEvent(chain, signBody(body, priv))
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

interface Rec {
  ev: SignedEvent
  id: EventId
}

/** Merge-order comparator for personal-lane events: (ts, key, height, id). */
function mergeCompare(a: { ev: SignedEvent; id: string }, b: { ev: SignedEvent; id: string }): number {
  return (
    a.ev.body.ts - b.ev.body.ts ||
    compareKeys(a.ev.body.key, b.ev.body.key) ||
    a.ev.body.height - b.ev.body.height ||
    compareKeys(a.id, b.id)
  )
}

/**
 * Full deterministic verification. Same chain (as a SET of events — storage
 * order is immaterial) → bit-identical VerifyResult, on node and in the
 * browser bundle. Never throws on bad input.
 */
export function verifyChain(chain: Chain): VerifyResult {
  const errors: VerifyError[] = []
  const err = (code: VerifyErrorCode, detail: string, event?: EventId): void => {
    errors.push(event !== undefined ? { code, event, detail } : { code, detail })
  }

  // --- per-event pass: canonical form, root binding, payload schema, signature
  const recs: Rec[] = []
  const seenIds = new Set<string>()
  for (const ev of chain.events) {
    let id: EventId | null = null
    try {
      const bytes = canonicalBytes(ev.body as CanonicalValue)
      parseCanonical(bytes) // canonical round-trip equivalence
      id = toB64u(sha256(bytes))
    } catch (e) {
      err('bad-canonical', e instanceof Error ? e.message : 'body is not canonical')
      continue
    }
    if (ev.body.root !== chain.root) {
      err('wrong-root', 'event root does not match chain root', id)
      continue
    }
    const shape = zSignedEvent.safeParse(ev)
    if (!shape.success) {
      // stableIssueDetail: code+path only — zod's free text must never reach
      // VerifyError.detail (it feeds the parity digest and drifts across minors).
      err('bad-payload', stableIssueDetail(shape.error.issues[0]), id)
      continue
    }
    if (!verifyEventSig(ev)) {
      err('bad-signature', 'ed25519 signature does not verify', id)
      continue
    }
    if (seenIds.has(id)) continue // exact duplicate storage — harmless
    seenIds.add(id)
    recs.push({ ev, id })
  }

  // --- certificate set (root-signed ⇒ chain position immaterial)
  const certs = new Map<B64u, { purpose: number; index: number }>()
  const certRecs = recs
    .filter((r) => r.ev.body.type === 'cert')
    .sort((a, b) => a.ev.body.height - b.ev.body.height || compareKeys(a.id, b.id))
  for (const r of certRecs) {
    // zEventBody already enforced lane 'p', key === root, valid payload.
    const p = r.ev.body.payload as CertPayload
    if (p.pub === chain.root) {
      err('bad-payload', 'certificate for the root key itself', r.id)
      continue
    }
    if (!certs.has(p.pub)) certs.set(p.pub, { purpose: p.purpose, index: p.index })
  }

  // --- witnessed lane: single contiguous hash chain from genesis
  const w = recs
    .filter((r) => r.ev.body.lane === 'w')
    .sort((a, b) => a.ev.body.height - b.ev.body.height || compareKeys(a.id, b.id))
  const byHeight = new Map<number, Rec[]>()
  let maxHeight = -1
  for (const r of w) {
    const h = r.ev.body.height
    const g = byHeight.get(h)
    if (g) g.push(r)
    else byHeight.set(h, [r])
    if (h > maxHeight) maxHeight = h
  }

  const revokedAt = new Map<B64u, { height: number; ts: number }>()
  let head: { id: EventId; height: number } | null = null
  let fold: BasicFoldState = basicFold.init(chain.root)
  const foldAt = new Map<number, BasicFoldState>()
  const ckpts: { rec: Rec; payload: CheckpointPayload }[] = []

  if (!byHeight.has(0)) {
    err('bad-genesis', 'missing genesis (no witnessed event at height 0)')
  } else {
    walk: for (let h = 0; h <= maxHeight; h++) {
      const group = byHeight.get(h)
      if (!group) {
        err('bad-height', `witnessed lane gap at height ${h}`)
        break
      }
      if (group.length > 1) {
        const [a, b] = group
        if ((a.ev.body.prev ?? '') === (b.ev.body.prev ?? '')) {
          if (h === 0) err('bad-genesis', 'more than one genesis event', b.id)
          else err('fork', `two witnessed successors of one prev at height ${h}`, b.id)
        } else {
          err('bad-height', `duplicate witnessed height ${h}`, b.id)
        }
        break
      }
      const r = group[0]
      const b = r.ev.body
      if (h === 0) {
        let bad: string | null = null
        if (b.type !== 'genesis') bad = 'witnessed lane does not start with a genesis event'
        else if (b.prev !== undefined) bad = 'genesis carries a prev'
        else if (b.key !== chain.root) bad = 'genesis is not signed by the root key'
        else if ((b.payload as GenesisPayload).params !== PARAMS_V1_DIGEST)
          bad = 'genesis params digest is not a known parameter set'
        if (bad) {
          err('bad-genesis', bad, r.id)
          break walk
        }
      } else {
        if (b.type === 'genesis') {
          err('bad-genesis', `genesis event at height ${h}`, r.id)
          break
        }
        if (b.prev !== head!.id) {
          err('bad-linkage', `prev does not match the witnessed chain at height ${h}`, r.id)
          break
        }
        if (b.key !== chain.root && !certs.has(b.key))
          err('uncertified-key', 'witnessed event signed by a key that is neither root nor certified', r.id)
        const rv = revokedAt.get(b.key)
        if (rv && rv.height < h) err('revoked-key', `signing key was revoked at witnessed height ${rv.height}`, r.id)
      }
      if (b.type === 'revoke') {
        const pub = (b.payload as RevokePayload).pub
        if (pub === chain.root) err('bad-payload', 'the root key cannot be revoked', r.id)
        else if (!revokedAt.has(pub)) revokedAt.set(pub, { height: h, ts: b.ts })
      }
      if (b.type === 'ckpt') ckpts.push({ rec: r, payload: b.payload as CheckpointPayload })
      fold = basicFold.step(fold, r.ev)
      foldAt.set(h, fold)
      head = { id: r.id, height: h }
    }
  }

  // --- checkpoints: self-authenticating; mismatch is fraud ('bad-checkpoint')
  let prevCk: { id: EventId; through: number } | null = null
  for (const { rec, payload } of ckpts) {
    const h = rec.ev.body.height
    let bad: string | null = null
    if (toB64u(canonicalHash(payload.state as CanonicalValue)) !== payload.stateDigest)
      bad = 'stateDigest does not match the embedded state'
    else if (payload.through >= h) bad = 'checkpoint must cover heights strictly below itself'
    else if ((payload.prevCkpt ?? '') !== (prevCk?.id ?? '')) bad = 'prevCkpt does not reference the prior checkpoint'
    else if (prevCk && payload.through <= prevCk.through) bad = 'through does not advance past the prior checkpoint'
    else {
      const truth = foldAt.get(payload.through)
      if (!truth || toB64u(canonicalHash(truth)) !== payload.stateDigest) bad = 'state recomputation mismatch'
    }
    if (bad) err('bad-checkpoint', bad, rec.id)
    prevCk = { id: rec.id, through: payload.through }
  }

  // --- personal lane: per-key contiguous chains; deterministic merge
  const byKey = new Map<B64u, Rec[]>()
  for (const r of recs) {
    if (r.ev.body.lane !== 'p') continue
    const g = byKey.get(r.ev.body.key)
    if (g) g.push(r)
    else byKey.set(r.ev.body.key, [r])
  }
  const included: Rec[] = []
  const personalHeads: { key: B64u; head: EventId; height: number }[] = []
  for (const key of [...byKey.keys()].sort(compareKeys)) {
    const list = byKey.get(key)!.sort((a, b) => a.ev.body.height - b.ev.body.height || compareKeys(a.id, b.id))
    if (key !== chain.root && !certs.has(key)) {
      for (const r of list) err('uncertified-key', 'personal event signed by a key that is neither root nor certified', r.id)
      continue
    }
    const rv = revokedAt.get(key)
    let prevId: EventId | null = null
    let expect = 0
    let keyHead: { id: EventId; height: number } | null = null
    for (const r of list) {
      const b = r.ev.body
      if (b.height !== expect) {
        err(
          'bad-height',
          b.height < expect
            ? `duplicate personal height ${b.height} for one key`
            : `personal lane gap: height ${b.height} where ${expect} was expected`,
          r.id,
        )
        break
      }
      if (expect === 0 ? b.prev !== undefined : b.prev !== prevId) {
        err('bad-linkage', `personal prev does not match the key's chain at height ${b.height}`, r.id)
        break
      }
      prevId = r.id
      expect++
      // Revoked key: personal events with ts AFTER the revocation are
      // IGNORED (sync noise from a retired device), not fraud.
      if (rv !== undefined && b.ts > rv.ts) continue
      included.push(r)
      keyHead = { id: r.id, height: b.height }
    }
    if (keyHead) personalHeads.push({ key, head: keyHead.id, height: keyHead.height })
  }

  // --- LWW profile fold over included personal events in merge order
  included.sort(mergeCompare)
  const profile: Record<string, CanonicalValue> = {}
  for (const r of included) {
    if (r.ev.body.type !== 'profile') continue
    const fields = (r.ev.body.payload as { fields: CanonicalObject }).fields
    for (const f of PROFILE_FIELDS) {
      const v = fields[f]
      if (v !== undefined) profile[f] = v
    }
  }

  // --- active keys: certified minus revoked, sorted by pub
  const activeKeys = [...certs.entries()]
    .filter(([pub]) => !revokedAt.has(pub))
    .map(([pub, c]) => ({ pub, purpose: c.purpose, index: c.index }))
    .sort((a, b) => compareKeys(a.pub, b.pub))

  // --- deterministic result + parity digest
  errors.sort(
    (a, b) => compareKeys(a.code, b.code) || compareKeys(a.event ?? '', b.event ?? '') || compareKeys(a.detail, b.detail),
  )
  const ok = errors.length === 0
  const projection: CanonicalObject = {
    ok,
    errors: errors.map((e) => ({ code: e.code, detail: e.detail, ...(e.event !== undefined ? { event: e.event } : {}) })),
    ...(head ? { witnessedHead: head.id, witnessedHeight: head.height } : {}),
    personalHeads,
    activeKeys,
    profile,
    fold,
  }
  return {
    ok,
    errors,
    ...(head ? { witnessedHead: head.id, witnessedHeight: head.height } : {}),
    personalHeads,
    activeKeys,
    profile,
    fold,
    digest: toB64u(canonicalHash(projection)),
  }
}

// ---------------------------------------------------------------------------
// Canonical file format
// ---------------------------------------------------------------------------

const zChainFile = z.strictObject({
  v: z.literal(1),
  root: zB64u32,
  events: z.array(zSignedEventCore),
})

/**
 * Serialize a chain to its ONE canonical byte stream: {v:1, root, events}
 * with witnessed events first (by height), then personal events in merge
 * order — bit-identical for equal chains regardless of in-memory order.
 * Canonical over the event SET: exact duplicate storage (same event id) is
 * dropped first — the same rule verifyChain applies — so a chain carrying
 * duplicates serializes byte-identical to its deduped form.
 * Throws on chains whose bodies are not canonical (programmer misuse).
 */
export function chainToBytes(chain: Chain): Uint8Array {
  const seen = new Set<string>()
  const recs: { ev: SignedEvent; id: string }[] = []
  for (const ev of chain.events) {
    const id = eventId(ev.body)
    if (seen.has(id)) continue
    seen.add(id)
    recs.push({ ev, id })
  }
  const w = recs
    .filter((r) => r.ev.body.lane === 'w')
    .sort((a, b) => a.ev.body.height - b.ev.body.height || compareKeys(a.id, b.id))
  const p = recs.filter((r) => r.ev.body.lane === 'p').sort(mergeCompare)
  const events = [...w, ...p].map(({ ev }) => ({
    body: ev.body,
    sig: ev.sig,
    ...(ev.wit !== undefined ? { wit: ev.wit } : {}),
  }))
  return canonicalBytes({ v: 1, root: chain.root, events } as CanonicalValue)
}

/**
 * Parse canonical chain bytes. Throws (CodecError / Error) on truncated,
 * non-canonical, or wrongly-shaped input — loading is strict; SEMANTIC
 * verdicts stay with verifyChain, which never throws.
 */
export function chainFromBytes(bytes: Uint8Array): Chain {
  const parsed = parseCanonical(bytes)
  const res = zChainFile.safeParse(parsed)
  if (!res.success) {
    const issue = res.error.issues[0]
    throw new Error(
      `chainFromBytes: not a chain file: ${issue ? `${issue.path.map(String).join('.')}: ${issue.message}` : 'bad shape'}`,
    )
  }
  return { root: res.data.root, events: res.data.events as unknown as SignedEvent[] }
}
