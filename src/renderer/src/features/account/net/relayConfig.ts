// RELAY-SEAM — env/config-replaceable Nostr SIGNALING relays (spec §4 C-11, the
// signaling half of the same requirement iceConfig.ts covers for STUN/TURN). The
// trystero fork rides a set of public Nostr relays for peer discovery; C-11
// requires that set be replaceable so a production build points at OUR relays.
// iceConfig.ts already makes the TURN/STUN list replaceable (VITE_ICE_SERVERS);
// this is its EXACT twin for the relay list, so a single build-time env owns the
// signaling relays for ALL THREE trystero users: the browser accounts fabric
// (browserFabric.ts), the matchmaking pool (matchmaking.ts), and the mp game
// transport (rtcTransport.ts).
//
// The GAP this closes: only the trystero fork DEFAULT relays are used in
// production (no relayConfig is passed to joinRoom). This module lets a build
// inject a relay list via `VITE_NOSTR_RELAYS`; when it is unset the result is
// null and every call site passes NO relayConfig — BYTE-IDENTICAL to today, so
// the proven live signaling path is unchanged.
//
// Platform: renderer, but DOM-free (plain strings + a config object), so it also
// loads in the bare-node smoke bundles that import browserFabric/matchmaking. The
// env read is guarded EXACTLY like iceConfig.ts / accountsFlag.ts so the module
// still loads where there is no import.meta.env; a malformed value is IGNORED
// (keep defaults) — garbage never silently breaks signaling.
//
// FORMAT of `VITE_NOSTR_RELAYS` (either is accepted):
//   • comma-separated:  wss://relay.a.example,wss://relay.b.example
//   • JSON string array: ["wss://relay.a.example","wss://relay.b.example"]
// Every entry must be a ws:// or wss:// URL; if any entry is malformed the whole
// value is ignored and the fork defaults stand (mirrors iceConfig's all-or-none
// `every(isIceServer)` guard).

/**
 * The relay config handed to trystero's `joinRoom` (a structural subset of the
 * fork's `RelayConfig`, declared inline so this module imports nothing — the same
 * zero-import discipline as iceConfig.ts). `redundancy` = the full list length so
 * ALL configured relays are used (the fork only slices its OWN defaults by
 * redundancy; an explicit `urls` list is used verbatim — this matches the proven
 * smoke shape `{ urls, redundancy: urls.length }`, scripts/smoke/turnBrowserEntry.js).
 */
export interface NostrRelayConfig {
  urls: string[]
  redundancy: number
}

/**
 * The effective Nostr signaling relay config, or `null` to keep the trystero fork
 * defaults. Precedence: `VITE_NOSTR_RELAYS` env → null. When null the call sites
 * pass NO `relayConfig` to joinRoom, so behavior is byte-identical to the former
 * default-relays path. When set, EXACTLY the configured relays are used.
 */
export function resolveNostrRelays(): NostrRelayConfig | null {
  const urls = envNostrRelays()
  if (!urls || urls.length === 0) return null
  return { urls: [...urls], redundancy: urls.length }
}

/**
 * Build-time env override (C-11): a comma-separated or JSON-array list of relay
 * URLs in `VITE_NOSTR_RELAYS`. Guarded like iceConfig.ts / accountsFlag.ts so the
 * module loads in bare-node bundles with no import.meta.env. A malformed value is
 * IGNORED (falls back to the fork defaults) — garbage never silently breaks
 * signaling.
 */
function envNostrRelays(): string[] | null {
  const env = (import.meta as { env?: Record<string, unknown> }).env
  const raw = env?.VITE_NOSTR_RELAYS
  if (typeof raw !== 'string' || raw.trim() === '') return null
  const urls = parseRelayList(raw)
  // All-or-none, mirroring iceConfig's `parsed.every(isIceServer)`: any malformed
  // entry ⇒ ignore the whole value and keep the defaults.
  if (urls && urls.length > 0 && urls.every(isRelayUrl)) return urls
  return null
}

/**
 * Parse the raw env value into a candidate URL list (not yet validated): a JSON
 * string array (leading `[`) or a comma-separated list. Empty segments are
 * dropped; each is trimmed. Returns null when the JSON form is malformed / not a
 * string array (so the caller keeps the defaults).
 */
function parseRelayList(raw: string): string[] | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  if (trimmed.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(trimmed)
      if (Array.isArray(parsed) && parsed.every((u) => typeof u === 'string'))
        return parsed.map((u) => (u as string).trim()).filter((s) => s !== '')
    } catch {
      /* malformed JSON VITE_NOSTR_RELAYS — ignore, keep the defaults */
    }
    return null
  }
  return trimmed
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '')
}

/** Minimal structural guard: a Nostr relay is a `ws://` or `wss://` URL. */
function isRelayUrl(u: unknown): u is string {
  return typeof u === 'string' && /^wss?:\/\/[^\s]+$/i.test(u)
}
