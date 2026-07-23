// A-final switch, web side (docs/building/ACCOUNTS-SPEC.md §14).
//
// ONE boolean decides which account system the web surface speaks:
//   ON  (the default) — the decentralized accounts (src/web/accounts.ts over
//        @shared/accounts) ARE the account system. The interim server-account
//        client (authStore.ts -> /api/auth/*) is never consulted:
//        main.web.tsx skips authStore.boot(), so authStore stays
//        {known:false}, webApi keeps routing every user-data namespace to the
//        honest local layer, and the interim account chip renders null (it
//        returns null until `known`) — no dead interim UI against the
//        server's 410-gated endpoints.
//   OFF — the interim client path is fully intact (emergency fallback,
//        mirroring the server's ACCOUNTS_DECENTRALIZED=0).
//
// The web default is ON unconditionally: a build flips OFF only via an
// explicit VITE_ACCOUNTS_DECENTRALIZED=0|false|off at vite build time. An
// unset or unrecognized value stays ON — the decentralized path is the
// default, and garbage never silently reverts the flip. (Server-side
// resolution lives in server/afinal.ts; the token grammar is kept identical.)

/** Parse one flag token; undefined = unset/unrecognized. Same grammar as
 *  server/afinal.ts parseFlagToken — keep them in lockstep. */
export function parseFlagToken(raw: unknown): boolean | undefined {
  if (typeof raw === 'boolean') return raw
  if (typeof raw !== 'string') return undefined
  const t = raw.trim().toLowerCase()
  if (t === '1' || t === 'true' || t === 'on' || t === 'yes') return true
  if (t === '0' || t === 'false' || t === 'off' || t === 'no') return false
  return undefined
}

/** Pure web-side resolution: default ON, explicit off tokens only. */
export function resolveWebAccountsFlag(raw: unknown): boolean {
  return parseFlagToken(raw) ?? true
}

export type AccountSystem = 'decentralized' | 'interim'

/** The explicit selection the rest of the web surface keys off. */
export function accountSystem(on: boolean): AccountSystem {
  return on ? 'decentralized' : 'interim'
}

// import.meta.env exists under vite (dev + build); the typeof guard keeps
// this module loadable in bare-node suite bundles (engines/assets.ts
// precedent).
const rawEnv: unknown =
  typeof import.meta.env !== 'undefined'
    ? (import.meta.env as Record<string, unknown>).VITE_ACCOUNTS_DECENTRALIZED
    : undefined

/** The single web-side switch (spec §14 A-final). */
export const ACCOUNTS_DECENTRALIZED: boolean = resolveWebAccountsFlag(rawEnv)

/** Which account system this build of the web surface uses. */
export const ACCOUNT_SYSTEM: AccountSystem = accountSystem(ACCOUNTS_DECENTRALIZED)
