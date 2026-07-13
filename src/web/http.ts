// HTTP seam for the web `Api` (web port W3 — build contract AGENT-CLIENT).
//
// Three surfaces, all same-origin, all cookie-authenticated (sid, httpOnly —
// the client never sees or stores a token):
//   invoke(channel, payload)  →  POST /api/ipc/<channel>   (the IPC bridge:
//     JSON body = the desktop handler's payload object, response = its result)
//   auth*()                   →  /api/auth/*               (session lifecycle)
//   review{Save,Load}Http()   →  /api/review/*             (review persistence)
//
// 401 policy: a 401 from any BRIDGE/REVIEW call means the session died out
// from under us (expiry, server restart) — the registered unauthorized handler
// (authStore.signOutLocally, wired in authStore.ts) flips the app to the
// logged-out local layer and the call rejects. Auth endpoints themselves opt
// out (`on401: 'pass'`) so a wrong-password 401 surfaces as its own error,
// not a phantom "session expired".
//
// The server side is built in parallel to the same contract
// (scratchpad web-build-contract.md §3/§5); tests mock global fetch and never
// depend on a live server.

import type { GameReview, ReviewMoveEval } from '@shared/types'

export interface AuthUser {
  id: number
  username: string
}

export class HttpError extends Error {
  readonly status: number
  readonly body: unknown

  constructor(message: string, status: number, body: unknown) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.body = body
  }
}

let onUnauthorized: (() => void) | null = null

/** Register the single 401 listener (authStore). Last registration wins. */
export function setOnUnauthorized(fn: (() => void) | null): void {
  onUnauthorized = fn
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json()
  } catch {
    return null
  }
}

function errorMessage(status: number, body: unknown): string {
  if (body && typeof body === 'object') {
    const b = body as { message?: unknown; error?: unknown }
    if (typeof b.message === 'string' && b.message) return b.message
    if (typeof b.error === 'string' && b.error) return b.error
  }
  return `Request failed (HTTP ${status})`
}

interface RequestOpts {
  /** 'signout' (default): a 401 flips auth state via the registered handler.
   *  'pass': surface the 401 as a plain HttpError (auth endpoints). */
  on401?: 'signout' | 'pass'
  signal?: AbortSignal
}

async function request<T>(
  method: 'GET' | 'POST',
  url: string,
  body?: unknown,
  opts: RequestOpts = {}
): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: opts.signal
  })
  if (res.status === 401 && (opts.on401 ?? 'signout') === 'signout') {
    onUnauthorized?.()
    throw new HttpError(
      'Your session ended — sign in again (bottom-right) to keep progress syncing.',
      401,
      await safeJson(res)
    )
  }
  if (!res.ok) {
    const parsed = await safeJson(res)
    throw new HttpError(errorMessage(res.status, parsed), res.status, parsed)
  }
  return (await res.json()) as T
}

// ---- The IPC bridge -----------------------------------------------------------

/** POST /api/ipc/<channel> — the desktop IPC handler run server-side against
 *  the caller's per-account DB (or the shared anon DB for public content).
 *  The default `any` is deliberate: the bridge executes the SAME zod-validated
 *  desktop handlers, so each call site's result type is the `Api` method's —
 *  exactly how preload's untyped ipcRenderer.invoke satisfies the contract. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function invoke<T = any>(channel: string, payload: unknown): Promise<T> {
  return request<T>('POST', `/api/ipc/${channel}`, payload ?? {})
}

// ---- Auth ----------------------------------------------------------------------

export function authMe(opts: { signal?: AbortSignal } = {}): Promise<{ user: AuthUser | null }> {
  return request<{ user: AuthUser | null }>('GET', '/api/auth/me', undefined, {
    on401: 'pass',
    signal: opts.signal
  })
}

export function authLogin(username: string, password: string): Promise<{ user: AuthUser }> {
  return request<{ user: AuthUser }>('POST', '/api/auth/login', { username, password }, { on401: 'pass' })
}

export function authSignup(
  username: string,
  password: string,
  email?: string
): Promise<{ user: AuthUser }> {
  const body = email ? { username, password, email } : { username, password }
  return request<{ user: AuthUser }>('POST', '/api/auth/signup', body, { on401: 'pass' })
}

export function authLogout(): Promise<unknown> {
  return request<unknown>('POST', '/api/auth/logout', {}, { on401: 'pass' })
}

// ---- Review persistence ---------------------------------------------------------

export function reviewSaveHttp(gameId: number | null, review: GameReview): Promise<unknown> {
  return request<unknown>('POST', '/api/review/save', { gameId, review })
}

export function reviewLoadHttp(
  gameId: number
): Promise<{ review: GameReview | null; moveEvals: ReviewMoveEval[] }> {
  return request<{ review: GameReview | null; moveEvals: ReviewMoveEval[] }>(
    'GET',
    `/api/review/${gameId}`
  )
}
