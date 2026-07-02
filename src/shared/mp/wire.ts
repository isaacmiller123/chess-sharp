// Internet-multiplayer wire protocol (v2): message schemas, the version hello,
// wire-level heartbeat, and the room-code codec. ISOMORPHIC by design — ZERO node
// imports (no 'node:os', no Buffer) so this module bundles into the renderer AND
// runs unchanged under bare node for tests. The transport lives in the renderer
// (WebRTC via trystero); this file only knows how to (de)serialize and validate.

import { z } from 'zod'
import type { MpGameConfig } from '@shared/types'

// ---- Version hello -----------------------------------------------------------
// First message a peer sends once the data channel opens, BOTH directions. A peer
// whose `v` doesn't match PROTOCOL_VERSION is refused with a wire 'error' and the
// session is torn down. Bump this on ANY wire-incompatible change below.

export const PROTOCOL_VERSION = 2

export const helloMsgSchema = z
  .object({
    t: z.literal('hello'),
    /** Protocol version — must equal PROTOCOL_VERSION on both sides. */
    v: z.number().int(),
    /** App version string, informational only (never gates compatibility). */
    app: z.string().optional()
  })
  .strict()
export type HelloMsg = z.infer<typeof helloMsgSchema>

/** The hello THIS build sends. */
export function makeHello(appVersion?: string): HelloMsg {
  return { t: 'hello', v: PROTOCOL_VERSION, ...(appVersion ? { app: appVersion } : {}) }
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

/** UCI move like 'e2e4' / 'e7e8q'. */
export const uciSchema = z.string().regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/)

export const wireMsgSchema = z.discriminatedUnion('t', [
  helloMsgSchema,
  // host -> guest: colors resolved, game on. `yourColor` is the GUEST's color.
  z.object({ t: z.literal('start'), yourColor: colorSchema, config: mpGameConfigSchema }).strict(),
  // either direction: the sender's move + the sender's clocks after it.
  z
    .object({
      t: z.literal('move'),
      uci: uciSchema,
      clockMs: z.object({ white: z.number(), black: z.number() }).strict()
    })
    .strict(),
  z.object({ t: z.literal('drawOffer') }).strict(),
  z.object({ t: z.literal('drawAccept') }).strict(),
  z.object({ t: z.literal('resign'), by: colorSchema }).strict(),
  z.object({ t: z.literal('rematchOffer') }).strict(),
  // host -> guest on rematch accept; `yourColor` is again the GUEST's color.
  z.object({ t: z.literal('rematchStart'), yourColor: colorSchema }).strict(),
  // graceful goodbye before leaving the room.
  z.object({ t: z.literal('bye') }).strict(),
  z.object({ t: z.literal('error'), message: z.string() }).strict(),
  // wire-level heartbeat (v2): the old ws protocol-level ping/pong is gone, so
  // liveness rides on these. Sent every few seconds once handshaken.
  z.object({ t: z.literal('ping') }).strict(),
  z.object({ t: z.literal('pong') }).strict()
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
