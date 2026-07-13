// Tiny subscribable auth state (web port W3 — build contract AGENT-CLIENT).
//
// One source of truth for "who is signed in" shared by webApi.ts (persistence
// routing) and the account UI (chip + modal). No framework: a snapshot object
// plus listeners, so React consumers can useSyncExternalStore and webApi can
// read synchronously at call time.
//
// Lifecycle / reload policy (build-contract deliverable 5, decided here):
//  - main.web.tsx AWAITS boot() (GET /api/auth/me) BEFORE the renderer boots,
//    so the very first settings/games reads already route to the right layer.
//  - USER-INITIATED auth changes (login / signup / logout in the account UI)
//    are followed by location.reload() — performed by the account UI after the
//    action resolves — which remounts every surface onto the new backend. A
//    full reload is the v1-correct way to swap backends: no renderer surface
//    holds stale cross-backend state.
//  - INVOLUNTARY sign-outs (a bridge call returns 401: session expired, server
//    restarted) do NOT reload: http.ts fires the unauthorized handler, state
//    flips here, webApi routes subsequent calls to the local layer and the
//    chip returns to "Sign in" — the user is never yanked out of a live game.

import { authLogin, authLogout, authMe, authSignup, setOnUnauthorized, type AuthUser } from './http'

export type { AuthUser }

export interface AuthState {
  /** False until boot() resolves the session (or fails ⇒ logged out). */
  known: boolean
  user: AuthUser | null
}

let state: AuthState = { known: false, user: null }
const listeners = new Set<() => void>()

function setState(next: AuthState): void {
  state = next
  for (const fn of [...listeners]) fn()
}

export const authStore = {
  /** Current snapshot (stable identity between changes — safe for
   *  useSyncExternalStore). */
  get state(): AuthState {
    return state
  },

  isAuthed(): boolean {
    return state.user !== null
  },

  subscribe(fn: () => void): () => void {
    listeners.add(fn)
    return () => {
      listeners.delete(fn)
    }
  },

  /** Resolve the session cookie once at boot. NEVER rejects: any failure
   *  (no server in dev, network down, timeout) resolves to logged-out so the
   *  app always boots onto the honest local layer. */
  async boot(): Promise<AuthState> {
    try {
      const signal =
        typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
          ? AbortSignal.timeout(8000)
          : undefined
      const { user } = await authMe({ signal })
      setState({ known: true, user: user ?? null })
    } catch {
      setState({ known: true, user: null })
    }
    return state
  },

  /** Rejects with HttpError (e.g. wrong password) — the modal renders it. */
  async login(username: string, password: string): Promise<AuthUser> {
    const { user } = await authLogin(username, password)
    setState({ known: true, user })
    return user
  },

  async signup(username: string, password: string, email?: string): Promise<AuthUser> {
    const { user } = await authSignup(username, password, email)
    setState({ known: true, user })
    return user
  },

  /** Ends the server session; flips local state even if the request fails
   *  (the cookie may already be dead — logged-out locally is always safe). */
  async logout(): Promise<void> {
    try {
      await authLogout()
    } catch {
      // Ignore: flipping to logged-out locally is the honest result either way.
    } finally {
      setState({ known: true, user: null })
    }
  },

  /** The involuntary 401 flip — local state only, no server call, no reload. */
  signOutLocally(): void {
    if (state.user !== null || !state.known) setState({ known: true, user: null })
  }
}

// Any bridge/review 401 means the session died — flip to the local layer.
setOnUnauthorized(() => authStore.signOutLocally())
