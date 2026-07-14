// Chain events — zod v4 schemas mirroring types.ts EXACTLY, plus the
// id/sign/verify primitives every other accounts module builds on.
// (spec: docs/ACCOUNTS-SPEC.md §2, contract: ./types.ts)
//
// Platform-neutral: no `node:` imports, no DOM globals.

import { z } from 'zod'
import { canonicalBytes, canonicalHash } from './codec'
import { ed25519, fromB64u, toB64u } from './hash'
import {
  AVATAR_MAX_BYTES,
  BIO_MAX,
  NAME_MAX,
  NAME_MIN,
  type B64u,
  type EventBody,
  type EventId,
  type EventType,
  type Lane,
  type SignedEvent,
} from './types'

// ---------------------------------------------------------------------------
// b64u primitives (hash.ts convention: base64url, no padding)
// ---------------------------------------------------------------------------

const B64U_RE = /^[A-Za-z0-9_-]+$/
/** b64u of 32 bytes (pubkeys, sha256 ids, digests): exactly 43 chars. */
export const zB64u32 = z.string().length(43).regex(B64U_RE)
/** b64u of 64 bytes (ed25519 signatures): exactly 86 chars. */
export const zB64u64 = z.string().length(86).regex(B64U_RE)

const zHeight = z.int().min(0)
const zTs = z.int().min(0)

// ---------------------------------------------------------------------------
// Payload schemas (one per A1 event type, all .strict())
// ---------------------------------------------------------------------------

/** Control chars, zero-width chars, bidi/paragraph separators — never in names. */
const NAME_FORBIDDEN = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\u2060\ufeff]/

/** Display-form name: NAME_MIN..NAME_MAX chars, trimmed, no control/zero-width. */
export const zName = z
  .string()
  .min(NAME_MIN)
  .max(NAME_MAX)
  .refine((s) => s.trim() === s, 'name has leading/trailing whitespace')
  .refine((s) => !NAME_FORBIDDEN.test(s), 'name contains control or zero-width characters')

/** Avatar stays a base64 string; decoded cap AVATAR_MAX_BYTES → chars cap. */
export const AVATAR_B64_MAX_CHARS = Math.ceil((AVATAR_MAX_BYTES * 4) / 3) + 8

export const zGenesisPayload = z.strictObject({
  params: zB64u32,
  name: zName,
})

export const zCertPayload = z.strictObject({
  pub: zB64u32,
  /** KEY_PURPOSE: 0=device, 1=session, 2=context. */
  purpose: z.int().min(0).max(2),
  index: z.int().min(0),
  label: z.string().min(1).max(64).optional(),
})

export const zRevokePayload = z.strictObject({
  pub: zB64u32,
})

/** Profile field writes — keys restricted to PROFILE_FIELDS (types.ts). */
export const zProfileFields = z.strictObject({
  bio: z.string().max(BIO_MAX).optional(),
  avatar: z.string().max(AVATAR_B64_MAX_CHARS).optional(),
  country: z.string().max(64).optional(),
  flair: z.string().max(64).optional(),
})

export const zProfilePayload = z.strictObject({
  fields: zProfileFields,
})

export const zCheckpointPayload = z.strictObject({
  prevCkpt: zB64u32.optional(),
  through: zHeight,
  state: z.record(z.string(), z.unknown()),
  stateDigest: zB64u32,
})

export const PAYLOAD_SCHEMA: Record<EventType, z.ZodType> = {
  genesis: zGenesisPayload,
  cert: zCertPayload,
  revoke: zRevokePayload,
  profile: zProfilePayload,
  ckpt: zCheckpointPayload,
}

/** The lane each event type belongs to (types.ts registry). */
export const LANE_FOR: Record<EventType, Lane> = {
  genesis: 'w',
  cert: 'p',
  revoke: 'w',
  profile: 'p',
  ckpt: 'w',
}

// ---------------------------------------------------------------------------
// Event body / signed event / attestation schemas
// ---------------------------------------------------------------------------

/**
 * Structural body shape WITHOUT per-type payload validation — used by chain
 * loading so a chain carrying a bad payload still loads and verifyChain can
 * report 'bad-payload' instead of the loader throwing.
 */
export const zEventBodyCore = z.strictObject({
  v: z.literal(1),
  lane: z.enum(['w', 'p']),
  type: z.enum(['genesis', 'cert', 'revoke', 'profile', 'ckpt']),
  root: zB64u32,
  key: zB64u32,
  height: zHeight,
  prev: zB64u32.optional(),
  ts: zTs,
  payload: z.record(z.string(), z.unknown()),
})

/** Full body validation: shape + lane rule + per-type payload schema. */
export const zEventBody = zEventBodyCore.superRefine((b, ctx) => {
  if (b.lane !== LANE_FOR[b.type])
    ctx.addIssue({
      code: 'custom',
      message: `event type '${b.type}' belongs in lane '${LANE_FOR[b.type]}'`,
      path: ['lane'],
    })
  // Certificates are ALWAYS root-signed (spec §1) — a device-signed cert is
  // not a weaker cert, it is an invalid payload.
  if (b.type === 'cert' && b.key !== b.root)
    ctx.addIssue({ code: 'custom', message: 'cert events must be signed by the root key', path: ['key'] })
  const res = PAYLOAD_SCHEMA[b.type].safeParse(b.payload)
  if (!res.success)
    for (const issue of res.error.issues)
      ctx.addIssue({
        code: 'custom',
        // STABLE text only — the sub-issue's code + path, never zod's
        // free-form `message`: these strings reach VerifyError.detail and
        // therefore the parity digest, and zod's prose drifts across minors.
        message: `payload invalid: ${issue.code} at ${issue.path.map(String).join('.') || '$'}`,
        path: ['payload'],
      })
})

/**
 * STABLE rendering of a zod issue for VerifyError.detail: composed ONLY from
 * the issue `code` and `path` — never zod's free-text `message`, which can
 * change under a zod minor bump and would shift the parity digest of invalid
 * chains. 'custom' issues carry OUR OWN fixed messages (the superRefine rules
 * above) and pass through verbatim.
 */
export function stableIssueDetail(
  issue: { code?: string; path: ReadonlyArray<PropertyKey>; message: string } | undefined,
): string {
  if (!issue) return 'bad shape'
  if (issue.code === 'custom') return issue.message
  const path = issue.path.map(String).join('.')
  return path ? `${issue.code ?? 'invalid'} at ${path}` : (issue.code ?? 'invalid')
}

export const zWitnessAttestation = z.strictObject({
  w: zB64u32,
  wts: zTs,
  epoch: z.int().min(0),
  sig: zB64u64,
})

/** Loose signed-event shape (loading); payload contents checked at verify. */
export const zSignedEventCore = z.strictObject({
  body: zEventBodyCore,
  sig: zB64u64,
  wit: z.array(zWitnessAttestation).optional(),
})

/** Full signed-event validation (body payload included). */
export const zSignedEvent = z.strictObject({
  body: zEventBody,
  sig: zB64u64,
  wit: z.array(zWitnessAttestation).optional(),
})

// ---------------------------------------------------------------------------
// id / sign / verify
// ---------------------------------------------------------------------------

/** sha256(canonicalBytes(body)) as b64u — the id every `prev` points at. */
export function eventId(body: EventBody): EventId {
  return toB64u(canonicalHash(body))
}

/** Sign a body with the private key matching body.key. Pure; ts is the caller's. */
export function signBody(body: EventBody, priv: Uint8Array): SignedEvent {
  const sig = toB64u(ed25519.sign(canonicalBytes(body), priv))
  return { body, sig }
}

/** ed25519 verify of ev.sig by ev.body.key over canonicalBytes(body). Never throws. */
export function verifyEventSig(ev: SignedEvent): boolean {
  try {
    return ed25519.verify(fromB64u(ev.sig), canonicalBytes(ev.body), fromB64u(ev.body.key))
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Head helpers (shared by certs/chain/checkpoint — linkage math in ONE place)
// ---------------------------------------------------------------------------

export interface Head {
  id: EventId
  height: number
}

/** Highest witnessed event of a well-formed event list (null when no genesis). */
export function witnessedHeadOf(events: readonly SignedEvent[]): Head | null {
  let best: SignedEvent | null = null
  for (const ev of events) {
    if (ev.body.lane !== 'w') continue
    if (!best || ev.body.height > best.body.height) best = ev
  }
  return best ? { id: eventId(best.body), height: best.body.height } : null
}

/** Highest personal event BY `key` (personal heights are per signing key). */
export function personalHeadOf(events: readonly SignedEvent[], key: B64u): Head | null {
  let best: SignedEvent | null = null
  for (const ev of events) {
    if (ev.body.lane !== 'p' || ev.body.key !== key) continue
    if (!best || ev.body.height > best.body.height) best = ev
  }
  return best ? { id: eventId(best.body), height: best.body.height } : null
}
