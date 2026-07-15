// A3 entanglement primitives (spec §3): the per-move signature chain, the
// transcript digest, the witness stream signatures, and the 'segment'
// witnessed-lane event builders/verifiers. ONE definition consumed by BOTH the
// storage layer (segments, pointers, reconstruction) and wire v6 (mpSession's
// signed move messages) — the wire and the chain must agree on these bytes.
//
// Conventions are A1's: cjson-v1 canonical bytes, sha256 ids, ed25519
// signatures, base64url-no-pad strings. Pure + platform-neutral: no `node:`
// imports, no DOM globals, no ambient time or randomness.

import { z } from 'zod'
import { canonicalBytes, canonicalHash, type CanonicalObject } from './codec'
import { ed25519, toB64u, verifySigB64u } from './hash'
import { zB64u32, zSegmentPayload, eventId, verifyEventSig } from './events'
import type { B64u, EventId, SignedEvent } from './types'
import type {
  ProfileSnapshot,
  SegmentPayload,
  WitnessedResultBody,
  WitnessedResultRecord,
} from './storage/types'

// ---------------------------------------------------------------------------
// Game key — the value every per-move signature covers
// ---------------------------------------------------------------------------

/**
 * The GLOBAL game identifier signed into every move. Minted by the host at
 * game start; both players and the witness verify they hold the same key
 * before signing anything. Binding the players' ROOTS + a host nonce makes a
 * signature from one game unreplayable into any other (different roots or
 * nonce → different key → different signed bytes).
 */
export interface GameKeySeed extends CanonicalObject {
  v: 1
  t: 'game-key'
  /** Player roots by color. */
  w: B64u
  b: B64u
  /** Host-supplied 32-byte nonce, b64u (from the host's CSPRNG — injected). */
  nonce: B64u
  /** Host-claimed start time (unix ms) — informational, witness time rules. */
  ts: number
}

export function gameKey(seed: GameKeySeed): B64u {
  return toB64u(canonicalHash(seed))
}

// ---------------------------------------------------------------------------
// Per-move signature chain (§3 / wire v6)
// ---------------------------------------------------------------------------

/** One signed move: the mover signs (game, ply, move, clocks, prev move sig).
 * The RECEIVER's next move signs over this move's sig via `prev` — that is
 * the pairwise countersigning: neither side can alter or drop an interior
 * move without breaking the other's chain of signatures. */
export interface SignedMove extends CanonicalObject {
  ply: number
  /** Game-defined move codec (chess: UCI). Bounded 1..64 chars. */
  move: string
  /** Mover's clock snapshot AFTER the move, ms. */
  clockMs: { w: number; b: number }
  /** ed25519 by the mover's device key over moveSigBytes(...). */
  sig: B64u
}

/** The exact bytes a mover signs for ply `ply`. `prev` is the PREVIOUS ply's
 * sig — absent only at ply 0. */
export function moveSigBytes(
  game: B64u,
  ply: number,
  move: string,
  clockMs: { w: number; b: number },
  prev?: B64u,
): Uint8Array {
  const body: CanonicalObject = {
    v: 1,
    t: 'mv',
    g: game,
    ply,
    move,
    clock: { w: clockMs.w, b: clockMs.b },
    ...(prev !== undefined ? { prev } : {}),
  }
  return canonicalBytes(body)
}

export function signMove(
  priv: Uint8Array,
  game: B64u,
  ply: number,
  move: string,
  clockMs: { w: number; b: number },
  prev?: B64u,
): SignedMove {
  const sig = toB64u(ed25519.sign(moveSigBytes(game, ply, move, clockMs, prev), priv))
  return { ply, move, clockMs: { w: clockMs.w, b: clockMs.b }, sig }
}

/**
 * Verify a full interleaved move chain. Mover alternation: ply 0 is
 * `firstMover` (chess: 'w'), parity alternates. Checks: contiguous plies from
 * 0, every signature verifies against the mover's key, every sig chains over
 * the previous sig. Returns the first failing ply, or -1 when the whole
 * chain verifies.
 */
export function verifyMoveChain(
  game: B64u,
  moves: readonly SignedMove[],
  keys: { w: B64u; b: B64u },
  firstMover: 'w' | 'b' = 'w',
): number {
  let prev: B64u | undefined
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i]
    if (m.ply !== i) return i
    const mover = (i % 2 === 0) === (firstMover === 'w') ? 'w' : 'b'
    // Fail CLOSED like MoveChainVerifier.check: moveSigBytes → canonicalBytes
    // THROWS on an unencodable clock (non-safe integer, -0, NaN — the wire
    // clock schema is float-permissive), so an untrusted transcript (overlay /
    // A6 reconstruction) must reject the ply, never propagate a RangeError out
    // of this documented byte-deterministic verifier.
    let bytes: Uint8Array
    try {
      bytes = moveSigBytes(game, m.ply, m.move, m.clockMs, prev)
    } catch {
      return i
    }
    if (!verifySigB64u(m.sig, bytes, keys[mover])) return i
    prev = m.sig
  }
  return -1
}

// ---------------------------------------------------------------------------
// Transcript digest
// ---------------------------------------------------------------------------

/** The digest a segment event + witness stream bind: the FULL signed move
 * list plus the result. Deterministic bytes → one digest per game outcome. */
export function transcriptDigest(
  game: B64u,
  moves: readonly SignedMove[],
  result: '1-0' | '0-1' | '1/2-1/2',
  reason: string,
): B64u {
  const body: CanonicalObject = {
    v: 1,
    t: 'transcript',
    g: game,
    moves: moves.map((m) => ({
      ply: m.ply,
      move: m.move,
      clock: { w: m.clockMs.w, b: m.clockMs.b },
      sig: m.sig,
    })),
    result,
    reason,
  }
  return toB64u(canonicalHash(body))
}

// ---------------------------------------------------------------------------
// Witness stream (§3): countersigned clock stream + terminal signature
// ---------------------------------------------------------------------------

/** Bytes the witness signs periodically over the interleaved stream: the
 * latest countersigned ply + clocks, at the witness's own clock reading. */
export function witnessClockBytes(
  game: B64u,
  ply: number,
  clockMs: { w: number; b: number },
  wts: number,
): Uint8Array {
  return canonicalBytes({ v: 1, t: 'wclk', g: game, ply, clock: { w: clockMs.w, b: clockMs.b }, wts })
}

/** Terminal witness signature bytes — what SegmentPayload.wstream.sig covers. */
export function witnessEndBytes(
  game: B64u,
  result: '1-0' | '0-1' | '1/2-1/2',
  plies: number,
  transcript: B64u,
): Uint8Array {
  return canonicalBytes({ v: 1, t: 'wend', g: game, result, plies, transcript })
}

export function signWitnessEnd(
  wpriv: Uint8Array,
  wkey: B64u,
  game: B64u,
  result: '1-0' | '0-1' | '1/2-1/2',
  plies: number,
  transcript: B64u,
): { wkey: B64u; sig: B64u } {
  return { wkey, sig: toB64u(ed25519.sign(witnessEndBytes(game, result, plies, transcript), wpriv)) }
}

export function verifyWitnessEnd(
  wstream: { wkey: B64u; sig: B64u },
  game: B64u,
  result: '1-0' | '0-1' | '1/2-1/2',
  plies: number,
  transcript: B64u,
): boolean {
  return verifySigB64u(wstream.sig, witnessEndBytes(game, result, plies, transcript), wstream.wkey)
}

// ---------------------------------------------------------------------------
// Witnessed result record (§3 rage-quit denial)
// ---------------------------------------------------------------------------

export function makeWitnessedResult(
  wpriv: Uint8Array,
  wroot: B64u,
  wkey: B64u,
  // Spelled out (not Omit<WitnessedResultBody,'v'>): the CanonicalObject index
  // signature makes Omit collapse the named properties.
  body: {
    game: B64u
    players: { w: B64u; b: B64u }
    result: '1-0' | '0-1' | '1/2-1/2'
    reason: string
    transcript: B64u
    plies: number
    wts: number
  },
): WitnessedResultRecord {
  const full: WitnessedResultBody = { ...body, v: 1 }
  return {
    body: full,
    wroot,
    wkey,
    sig: toB64u(ed25519.sign(canonicalBytes(full as unknown as CanonicalObject), wpriv)),
  }
}

export function verifyWitnessedResult(rec: WitnessedResultRecord): boolean {
  if (rec.body.v !== 1) return false
  if (!zWitnessedResultBody.safeParse(rec.body).success) return false
  return verifySigB64u(rec.sig, canonicalBytes(rec.body as unknown as CanonicalObject), rec.wkey)
}

export const zResult = z.enum(['1-0', '0-1', '1/2-1/2'])

export const zWitnessedResultBody = z.strictObject({
  v: z.literal(1),
  game: zB64u32,
  players: z.strictObject({ w: zB64u32, b: zB64u32 }),
  result: zResult,
  reason: z.string().min(1).max(64),
  transcript: zB64u32,
  plies: z.int().min(0).max(4096),
  wts: z.int().min(0),
})

// ---------------------------------------------------------------------------
// Segment payload builder + verifier
// ---------------------------------------------------------------------------

export interface MakeSegmentOpts {
  game: B64u
  opp: B64u
  color: 'w' | 'b'
  result: '1-0' | '0-1' | '1/2-1/2'
  reason: string
  moves: readonly SignedMove[]
  heads: { w: { head: B64u; height: number }; b: { head: B64u; height: number } }
  wstream: { wkey: B64u; sig: B64u }
  oppCkpt?: SignedEvent
  oppProfile: ProfileSnapshot
}

/** Build the SegmentPayload for THIS player's chain (the caller appends it
 * via appendWitnessed(chain, priv, key, 'segment', payload, ts)). */
export function makeSegmentPayload(o: MakeSegmentOpts): SegmentPayload {
  return {
    game: o.game,
    opp: o.opp,
    color: o.color,
    result: o.result,
    reason: o.reason,
    transcript: transcriptDigest(o.game, o.moves, o.result, o.reason),
    plies: o.moves.length,
    heads: o.heads,
    wstream: o.wstream,
    ...(o.oppCkpt !== undefined ? { oppCkpt: o.oppCkpt } : {}),
    oppProfile: o.oppProfile,
  }
}

export type SegmentVerifyError =
  | 'not-segment'
  | 'bad-payload'
  | 'bad-event-sig'
  | 'bad-wstream'
  | 'opp-is-self'
  | 'bad-opp-ckpt'

/**
 * Verify what a segment event can prove ABOUT ITSELF, with no chain context:
 * the event signature, the witness terminal signature over (game, result,
 * plies, transcript), opp ≠ owner, and — when present — that oppCkpt is a
 * structurally valid, signature-valid ckpt event OF the named opponent.
 * Chain-context rules (linkage, cert of the signing key, attestations) are
 * verifyChain's / the witness layer's job, not duplicated here.
 */
export function verifySegmentEvent(ev: SignedEvent): SegmentVerifyError | null {
  if (ev.body.type !== 'segment' || ev.body.lane !== 'w') return 'not-segment'
  // Fail CLOSED on a malformed payload (the module invariant — see
  // verifyEventSig / verifyWitnessedResult): a valid ed25519 signature over a
  // shape-invalid payload must return a typed error, never throw. This is the
  // designated standalone entry point for untrusted, overlay-delivered segment
  // events (brick 4/5 feed it PointerProof.event), so the shape gate precedes
  // every field dereference below. The try/catch is a backstop: zSegmentPayload
  // is now bounded-depth (oppCkpt = zCkptEvent, non-recursive), but a deeply
  // nested value smuggled through a ckpt's free-form `state` could still
  // overflow the codec stack in a later verify — a RangeError here must still
  // read as 'bad-payload', never propagate.
  try {
    if (!zSegmentPayload.safeParse(ev.body.payload).success) return 'bad-payload'
  } catch {
    return 'bad-payload'
  }
  if (!verifyEventSig(ev)) return 'bad-event-sig'
  const p = ev.body.payload as unknown as SegmentPayload
  if (p.opp === ev.body.root) return 'opp-is-self'
  if (
    !verifyWitnessEnd(
      { wkey: p.wstream.wkey, sig: p.wstream.sig },
      p.game,
      p.result,
      p.plies,
      p.transcript,
    )
  )
    return 'bad-wstream'
  if (p.oppCkpt !== undefined) {
    const c = p.oppCkpt
    if (c.body.type !== 'ckpt' || c.body.root !== p.opp || !verifyEventSig(c)) return 'bad-opp-ckpt'
  }
  return null
}

/** The id a pointer names when it points at this segment. */
export function segmentEventId(ev: SignedEvent): EventId {
  return eventId(ev.body)
}
