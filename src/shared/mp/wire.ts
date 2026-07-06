// Internet-multiplayer wire protocol (v3): message schemas, the version hello,
// wire-level heartbeat, and the room-code codec. ISOMORPHIC by design — ZERO node
// imports (no 'node:os', no Buffer) so this module bundles into the renderer AND
// runs unchanged under bare node for tests. The transport lives in the renderer
// (WebRTC via trystero); this file only knows how to (de)serialize and validate.
//
// v3 (docs/MP-V3-SPEC.md §1) over v2:
//   - hello carries `role` (host|guest) — a guest that hears hello{role:'guest'}
//     knows nobody is hosting and fails fast (kills the guest×guest deadlock) —
//     and an optional `name` (the player's display name).
//   - ALL in-game messages carry the host-owned `gameId` (monotonic per session,
//     starts 1). Receivers DROP any in-game message whose gameId ≠ the current
//     game, so late/duplicate traffic from a prior game can't corrupt state.
//   - `move` also carries a 0-based `ply` (receivers drop out-of-order/dupes).
//   - flags are their own `flag` message (no longer smuggled as a resign), the
//     first-move grace is enforced by `abort`, board-terminal endings ride a
//     `gameOver`, draws gain a `drawDecline`, rematch gains a `rematchDecline`,
//     and reconnect adds `resumeReq`/`resync`. ping/pong carry a timestamp for
//     RTT-based lag compensation.

import { z } from 'zod'
import type { MpGameConfig } from '@shared/types'

// ---- Version hello -----------------------------------------------------------
// First message a peer sends once the data channel opens, BOTH directions. A peer
// whose `v` doesn't match PROTOCOL_VERSION is refused with a wire 'error' and the
// session is torn down. Bump this on ANY wire-incompatible change below.

export const PROTOCOL_VERSION = 3

const roleSchema = z.enum(['host', 'guest'])

export const helloMsgSchema = z
  .object({
    t: z.literal('hello'),
    /** Protocol version — must equal PROTOCOL_VERSION on both sides. */
    v: z.number().int(),
    /** Sender's role. A guest hearing hello{role:'guest'} fails fast: that code
     *  has no host (kills the guest×guest deadlock, MP-V3 §1/T5). */
    role: roleSchema,
    /** Sender's trimmed display name (≤24 chars, control chars stripped). */
    name: z.string().optional(),
    /** App version string, informational only (never gates compatibility). */
    app: z.string().optional()
  })
  .strict()
export type HelloMsg = z.infer<typeof helloMsgSchema>

/** Longest display name we put on the wire; longer names are truncated. */
export const MAX_NAME_LEN = 24

/** Sanitize a raw display name for the wire: strip control chars, collapse
 *  whitespace, trim, clamp to MAX_NAME_LEN. Returns undefined when nothing
 *  usable remains (so hello omits `name` rather than sending ''). */
export function sanitizeName(raw: string | null | undefined): string | undefined {
  if (typeof raw !== 'string') return undefined
  // eslint-disable-next-line no-control-regex
  const cleaned = raw
    .replace(/[\x00-\x1f\x7f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME_LEN)
  return cleaned.length > 0 ? cleaned : undefined
}

/** The hello THIS build sends, carrying our role + optional display name. */
export function makeHello(role: 'host' | 'guest', name?: string, appVersion?: string): HelloMsg {
  const clean = sanitizeName(name)
  return {
    t: 'hello',
    v: PROTOCOL_VERSION,
    role,
    ...(clean ? { name: clean } : {}),
    ...(appVersion ? { app: appVersion } : {})
  }
}

// ---- Game config / message schemas --------------------------------------------
// Mirrors the shared MpGameConfig / MpEvent contract (src/shared/types.ts).
// Everything on the wire is one JSON-encoded WireMsg per data-channel message.

export const mpTimeControlSchema = z
  .object({
    // 0 == untimed/unlimited (no clock at all); otherwise a real starting budget.
    initialMs: z.number().int().min(0),
    incrementMs: z.number().int().min(0)
  })
  .strict()

export const mpGameConfigSchema = z
  .object({
    tc: mpTimeControlSchema,
    hostColor: z.enum(['white', 'black', 'random'])
  })
  .strict()
// Compile-time check: the zod schema stays in lockstep with the shared type.
type _AssertMpGameConfig = z.infer<typeof mpGameConfigSchema> extends MpGameConfig ? true : never
const _assertMpGameConfig: _AssertMpGameConfig = true
void _assertMpGameConfig

const colorSchema = z.enum(['white', 'black'])
const clocksSchema = z.object({ white: z.number(), black: z.number() }).strict()

/** UCI move like 'e2e4' / 'e7e8q'. */
export const uciSchema = z.string().regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/)

export const wireMsgSchema = z.discriminatedUnion('t', [
  helloMsgSchema,
  // host -> guest: colors resolved, game on. `yourColor` is the GUEST's color;
  // `gameId` opens this game (1, then +1 per rematch); `name` is the host's.
  z
    .object({
      t: z.literal('start'),
      gameId: z.number().int(),
      yourColor: colorSchema,
      config: mpGameConfigSchema,
      name: z.string().optional()
    })
    .strict(),
  // either direction: the sender's move (uci) at a given 0-based ply + the
  // sender's clocks after it. clockMs is authoritative only host -> guest.
  z
    .object({
      t: z.literal('move'),
      gameId: z.number().int(),
      ply: z.number().int().min(0),
      uci: uciSchema,
      clockMs: clocksSchema
    })
    .strict(),
  // host -> guest: authoritative clock ack after committing a guest move, and a
  // periodic re-sync while a clock runs. toMove = whose clock is now ticking.
  z
    .object({
      t: z.literal('clock'),
      gameId: z.number().int(),
      clockMs: clocksSchema,
      toMove: colorSchema
    })
    .strict(),
  // time-out. REPLACES resign-for-flag. clockMs has the loser (`by`) at 0.
  z
    .object({ t: z.literal('flag'), gameId: z.number().int(), by: colorSchema, clockMs: clocksSchema })
    .strict(),
  // first-move grace expired or a player aborted; no result is recorded.
  z
    .object({
      t: z.literal('abort'),
      gameId: z.number().int(),
      reason: z.enum(['no-first-move', 'manual'])
    })
    .strict(),
  // board-terminal ending (checkmate/stalemate/insufficient/…), confirmed both sides.
  z
    .object({
      t: z.literal('gameOver'),
      gameId: z.number().int(),
      result: z.enum(['1-0', '0-1', '1/2-1/2']),
      reason: z.string()
    })
    .strict(),
  // genuine resignation only.
  z.object({ t: z.literal('resign'), gameId: z.number().int(), by: colorSchema }).strict(),
  z.object({ t: z.literal('drawOffer'), gameId: z.number().int() }).strict(),
  z.object({ t: z.literal('drawDecline'), gameId: z.number().int() }).strict(),
  z.object({ t: z.literal('drawAccept'), gameId: z.number().int() }).strict(),
  // rematch is symmetric: either side offers; the host starts on mutual offers.
  z.object({ t: z.literal('rematchOffer') }).strict(),
  z.object({ t: z.literal('rematchDecline') }).strict(),
  // host -> guest on mutual rematch; `yourColor` is again the GUEST's (swapped) color.
  z.object({ t: z.literal('rematchStart'), gameId: z.number().int(), yourColor: colorSchema }).strict(),
  // reconnect: a rejoining peer asks the host to resume from the ply it has.
  z.object({ t: z.literal('resumeReq'), gameId: z.number().int(), havePly: z.number().int().min(0) }).strict(),
  // host -> peer: full authoritative snapshot to rebuild the live game after a rebond.
  z
    .object({
      t: z.literal('resync'),
      gameId: z.number().int(),
      moves: z.array(uciSchema),
      clockMs: clocksSchema,
      toMove: colorSchema,
      yourColor: colorSchema
    })
    .strict(),
  // graceful goodbye before leaving the room.
  z.object({ t: z.literal('bye') }).strict(),
  z.object({ t: z.literal('error'), message: z.string() }).strict(),
  // wire-level heartbeat: liveness rides on these, sent every few seconds once
  // handshaked. `t` echoes the sender's monotonic clock (ms) so a pong lets the
  // sender measure RTT for lag compensation (D11). Field is a plain number.
  z.object({ t: z.literal('ping'), ts: z.number() }).strict(),
  z.object({ t: z.literal('pong'), ts: z.number() }).strict()
])
export type WireMsg = z.infer<typeof wireMsgSchema>

/** Decode one raw data-channel payload (a string) into a WireMsg, or null if
 *  malformed. String input only — the transport hands us text. */
export function parseWireMsg(text: string): WireMsg | null {
  if (typeof text !== 'string') return null
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return null
  }
  const parsed = wireMsgSchema.safeParse(json)
  return parsed.success ? parsed.data : null
}

/** Encode a WireMsg for the wire. */
export function encodeWireMsg(msg: WireMsg): string {
  return JSON.stringify(msg)
}

// ---- Room-code codec -----------------------------------------------------------
// The join code is a random ROOM KEY, not an address: 10 Crockford-base32 chars
// (50 bits of entropy → collision-safe) rendered in two groups, e.g. "A1B2C-D3E4F".
// Crockford's alphabet drops I, L, O, U so codes survive being read aloud;
// normalize forgives case, hyphens/spaces, and the classic O/0, I/L/1 confusions.

const B32_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
export const ROOM_CODE_CHARS = 10 // 50 bits / 5 bits-per-char

/** A fresh random room code like "A1B2C-D3E4F". 50 bits from a CSPRNG. */
export function generateRoomCode(): string {
  // Rejection-sample bytes into the 32-symbol alphabet with no modulo bias:
  // any byte >= 256 - (256 % 32) == 256 (never) would bias, so 0..255 → &31 is
  // uniform here (256 is a multiple of 32). One byte per char, one char per 5 bits.
  const bytes = new Uint8Array(ROOM_CODE_CHARS)
  crypto.getRandomValues(bytes)
  let chars = ''
  for (let i = 0; i < ROOM_CODE_CHARS; i++) {
    chars += B32_ALPHABET[bytes[i] & 31]
  }
  return `${chars.slice(0, 5)}-${chars.slice(5)}`
}

/** Canonicalize a user-entered code. Forgiving about case/separators/look-alike
 *  chars; returns 'XXXXX-XXXXX' or null (never throws) when it's not exactly 10
 *  valid base32 chars. */
export function normalizeRoomCode(code: string): string | null {
  const cleaned = code
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
  if (cleaned.length !== ROOM_CODE_CHARS) return null
  for (const ch of cleaned) {
    if (B32_ALPHABET.indexOf(ch) < 0) return null
  }
  return `${cleaned.slice(0, 5)}-${cleaned.slice(5)}`
}
