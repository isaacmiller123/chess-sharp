// Checkpoints (spec §2) — self-verifying, never trusted. The A1 fold is
// structural ('basic-v1'); A4 swaps in rating/trust/ban folds behind the
// same ChainFold interface. A checkpoint embeds the prior checkpoint's id,
// the height it covers through, the fold state at that height, and the
// state's canonical digest — so it is incrementally verifiable in ONE step
// (recompute the fold over (prevCkpt.through, through] from the prior
// embedded state) and deeply verifiable from genesis.
//
// Platform-neutral: no `node:` imports, no DOM globals.

import { canonicalHash, compareKeys, type CanonicalObject, type CanonicalValue } from './codec'
import { eventId, signBody, zCheckpointPayload } from './events'
import { toB64u } from './hash'
import {
  N_CKPT,
  type B64u,
  type Chain,
  type ChainFold,
  type CheckpointPayload,
  type EventBody,
  type EventId,
  type SignedEvent,
} from './types'

// ---------------------------------------------------------------------------
// The A1 structural fold
// ---------------------------------------------------------------------------

/** Canonical-safe structural fold state: counts, head id, head height. */
export interface BasicFoldState extends CanonicalObject {
  /** Witnessed events folded so far. */
  n: number
  /** Per-type event counts. */
  byType: { [t: string]: number }
  /** Head id at this state — absent only before genesis. */
  head?: string
  /** Head height at this state — absent only before genesis. */
  height?: number
}

export const basicFold: ChainFold<BasicFoldState> = {
  id: 'basic-v1',
  init: (_root: B64u): BasicFoldState => ({ n: 0, byType: {} }),
  step: (state: BasicFoldState, event: SignedEvent): BasicFoldState => {
    const t = event.body.type
    return {
      n: state.n + 1,
      byType: { ...state.byType, [t]: (state.byType[t] ?? 0) + 1 },
      head: eventId(event.body),
      height: event.body.height,
    }
  },
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Witnessed events sorted by (height, id) — the fold order. */
function witnessedSorted(chain: Chain): SignedEvent[] {
  return chain.events
    .filter((e) => e.body.lane === 'w')
    .sort((a, b) => a.body.height - b.body.height || compareKeys(eventId(a.body), eventId(b.body)))
}

// ---------------------------------------------------------------------------
// Building
// ---------------------------------------------------------------------------

/**
 * Build (do not append) a checkpoint event at the current witnessed head:
 * through = head height, state = basic-v1 fold over heights [0, through],
 * prevCkpt = id of the latest prior ckpt event when one exists. The policy
 * cadence is every N_CKPT witnessed games (see dueForCheckpoint) but in A1
 * this is callable at any point.
 */
export function makeCheckpointEvent(chain: Chain, priv: Uint8Array, key: B64u, ts: number): SignedEvent {
  const w = witnessedSorted(chain)
  const head = w[w.length - 1]
  if (!head) throw new Error('makeCheckpointEvent: chain has no witnessed events')
  let prevCkpt: EventId | undefined
  for (let i = w.length - 1; i >= 0; i--)
    if (w[i].body.type === 'ckpt') {
      prevCkpt = eventId(w[i].body)
      break
    }
  let state = basicFold.init(chain.root)
  for (const ev of w) state = basicFold.step(state, ev)
  const payload: CheckpointPayload = {
    ...(prevCkpt !== undefined ? { prevCkpt } : {}),
    through: head.body.height,
    state,
    stateDigest: toB64u(canonicalHash(state)),
  }
  const body: EventBody = {
    v: 1,
    lane: 'w',
    type: 'ckpt',
    root: chain.root,
    key,
    height: head.body.height + 1,
    prev: eventId(head.body),
    ts,
    payload,
  }
  return signBody(body, priv)
}

/**
 * True when N_CKPT witnessed (non-checkpoint) events have accumulated since
 * the last checkpoint's covered height (or since the beginning).
 */
export function dueForCheckpoint(chain: Chain): boolean {
  const w = witnessedSorted(chain)
  let lastThrough = -1
  for (let i = w.length - 1; i >= 0; i--)
    if (w[i].body.type === 'ckpt') {
      const parsed = zCheckpointPayload.safeParse(w[i].body.payload)
      lastThrough = parsed.success ? parsed.data.through : w[i].body.height
      break
    }
  let n = 0
  for (const ev of w) if (ev.body.height > lastThrough && ev.body.type !== 'ckpt') n++
  return n >= N_CKPT
}

// ---------------------------------------------------------------------------
// Verification (never throws — bad input returns false)
// ---------------------------------------------------------------------------

interface ParsedCkpt {
  payload: CheckpointPayload
}

function parseCkpt(chain: Chain, ckptEvent: SignedEvent): ParsedCkpt | null {
  const b = ckptEvent.body
  if (b.type !== 'ckpt' || b.lane !== 'w' || b.root !== chain.root) return null
  const parsed = zCheckpointPayload.safeParse(b.payload)
  if (!parsed.success) return null
  const payload = b.payload as CheckpointPayload
  // (a)+(b) self-consistency: the digest must be OF the embedded state.
  if (toB64u(canonicalHash(payload.state as CanonicalValue)) !== payload.stateDigest) return null
  return { payload }
}

/** Fold `state` over witnessed heights (after, through], demanding contiguity. */
function foldRange(
  chain: Chain,
  state: BasicFoldState,
  after: number,
  through: number,
): BasicFoldState | null {
  const range = witnessedSorted(chain).filter((e) => e.body.height > after && e.body.height <= through)
  if (range.length !== through - after) return null
  for (let i = 0; i < range.length; i++) if (range[i].body.height !== after + 1 + i) return null
  let s = state
  for (const ev of range) s = basicFold.step(s, ev)
  return s
}

/**
 * Incremental verification (spec §2: one step): recompute the fold over
 * (prevCkpt.through, through] starting from the previous checkpoint's
 * EMBEDDED state, and require the result to hash to stateDigest. Detects
 * both a forged digest and a forged state under a correct digest.
 */
export function verifyCheckpointIncremental(chain: Chain, ckptEvent: SignedEvent): boolean {
  try {
    const parsed = parseCkpt(chain, ckptEvent)
    if (!parsed) return false
    const { payload } = parsed
    let start: BasicFoldState
    let after: number
    if (payload.prevCkpt !== undefined) {
      const prevEv = chain.events.find(
        (e) => e.body.lane === 'w' && e.body.type === 'ckpt' && eventId(e.body) === payload.prevCkpt,
      )
      if (!prevEv) return false
      const prev = parseCkpt(chain, prevEv)
      if (!prev) return false
      start = prev.payload.state as BasicFoldState
      after = prev.payload.through
    } else {
      start = basicFold.init(chain.root)
      after = -1
    }
    if (payload.through <= after) return false
    const computed = foldRange(chain, start, after, payload.through)
    if (!computed) return false
    return toB64u(canonicalHash(computed)) === payload.stateDigest
  } catch {
    return false
  }
}

/** Deep verification: recompute the fold from genesis over [0, through]. */
export function verifyCheckpointDeep(chain: Chain, ckptEvent: SignedEvent): boolean {
  try {
    const parsed = parseCkpt(chain, ckptEvent)
    if (!parsed) return false
    const computed = foldRange(chain, basicFold.init(chain.root), -1, parsed.payload.through)
    if (!computed) return false
    return toB64u(canonicalHash(computed)) === parsed.payload.stateDigest
  } catch {
    return false
  }
}
