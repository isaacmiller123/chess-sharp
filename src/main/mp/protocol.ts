// LAN-multiplayer wire protocol: message schemas, the join-code codec, and the
// version hello. PURE NODE — no electron imports; must stay importable (and
// testable) from a bare node script. The transport lives in ./session.ts.

import { networkInterfaces } from 'node:os'
import { z } from 'zod'
import type { MpGameConfig } from '../../shared/types'

// ---- Version hello -----------------------------------------------------------
// First message on the socket, BOTH directions. A peer whose `v` doesn't match
// PROTOCOL_VERSION is refused with a wire 'error' and the socket is closed.
// Bump this on ANY wire-incompatible change to the messages below.

export const PROTOCOL_VERSION = 1

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
// Everything on the socket is one JSON-encoded WireMsg per WebSocket message.

export const mpTimeControlSchema = z
  .object({
    initialMs: z.number().int().min(1000),
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
  // graceful goodbye before closing the socket.
  z.object({ t: z.literal('bye') }).strict(),
  z.object({ t: z.literal('error'), message: z.string() }).strict()
])
export type WireMsg = z.infer<typeof wireMsgSchema>

/** Decode one raw WebSocket payload into a WireMsg, or null if malformed. */
export function parseWireMsg(raw: unknown): WireMsg | null {
  let text: string
  if (typeof raw === 'string') text = raw
  else if (raw instanceof Uint8Array) text = Buffer.from(raw).toString('utf8')
  else return null
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return null
  }
  const parsed = wireMsgSchema.safeParse(json)
  return parsed.success ? parsed.data : null
}

/** Encode a WireMsg for the socket. */
export function encodeWireMsg(msg: WireMsg): string {
  return JSON.stringify(msg)
}

// ---- Join-code codec -----------------------------------------------------------
// The join code IS the address: 32-bit LAN IPv4 + 16-bit port packed into 48 bits,
// rendered as 10 Crockford-base32 chars in two groups — e.g. "0C0A8-01F2Y".
// Crockford's alphabet drops I, L, O, U so codes survive being read aloud;
// decode forgives case, hyphens/spaces, and the classic O/0, I/L/1 confusions.

const B32_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
export const JOIN_CODE_CHARS = 10 // 48 bits / 5 bits-per-char, rounded up

function ipv4ToUint32(ip: string): number | null {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  let out = 0
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null
    const n = Number(p)
    if (n > 255) return null
    out = out * 256 + n
  }
  return out
}

function uint32ToIpv4(n: number): string {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.')
}

/** Pack a LAN IPv4 + port into a friendly join code like "0C0A8-01F2Y". */
export function encodeJoinCode(ip: string, port: number): string {
  const ipBits = ipv4ToUint32(ip)
  if (ipBits === null) throw new Error(`encodeJoinCode: not an IPv4 address: ${ip}`)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`encodeJoinCode: bad port: ${port}`)
  }
  let bits = (BigInt(ipBits) << 16n) | BigInt(port)
  let chars = ''
  for (let i = 0; i < JOIN_CODE_CHARS; i++) {
    chars = B32_ALPHABET[Number(bits & 31n)] + chars
    bits >>= 5n
  }
  return `${chars.slice(0, 5)}-${chars.slice(5)}`
}

/** Reverse of encodeJoinCode. Forgiving about case/separators/look-alike chars;
 *  returns null (never throws) when the code is not decodable. */
export function decodeJoinCode(code: string): { ip: string; port: number } | null {
  const cleaned = code
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
  if (cleaned.length !== JOIN_CODE_CHARS) return null
  let bits = 0n
  for (const ch of cleaned) {
    const v = B32_ALPHABET.indexOf(ch)
    if (v < 0) return null
    bits = (bits << 5n) | BigInt(v)
  }
  const port = Number(bits & 0xffffn)
  const ipBits = Number(bits >> 16n)
  if (port < 1 || port > 65535 || ipBits > 0xffffffff) return null
  return { ip: uint32ToIpv4(ipBits), port }
}

// ---- LAN address discovery ------------------------------------------------------

/** Every non-internal IPv4 this machine has, private-range addresses first
 *  (those are what a LAN peer can actually reach). Empty when offline. */
export function listLanIPv4s(): string[] {
  const out: string[] = []
  const nics = networkInterfaces()
  for (const name of Object.keys(nics)) {
    for (const addr of nics[name] ?? []) {
      // node <18.0 reported family as the number 4; keep both for safety.
      const isV4 = addr.family === 'IPv4' || (addr.family as unknown) === 4
      if (isV4 && !addr.internal) out.push(addr.address)
    }
  }
  const isPrivate = (ip: string): boolean =>
    /^10\./.test(ip) || /^192\.168\./.test(ip) || /^172\.(1[6-9]|2\d|3[01])\./.test(ip)
  return out.sort((a, b) => Number(isPrivate(b)) - Number(isPrivate(a)))
}
