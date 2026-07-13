// Account chip + sign-in modal (web port W3 — build contract AGENT-CLIENT).
//
// A SEPARATE React root (mounted by main.web.tsx after the renderer boots) so
// the renderer stays byte-identical to desktop: a floating chip bottom-right.
//   Signed out → "Sign in" → small modal (username/password, create-account
//     toggle, inline error row).
//   Signed in  → the username → menu with Sign out.
//
// Reload policy (documented in authStore.ts): user-driven auth changes call
// location.reload() AFTER the action resolves, remounting every surface onto
// the new backend. Involuntary 401 flips only re-render the chip (webApi is
// already routing locally).
//
// Styling: account.css, self-contained. It uses the app's design tokens
// (styles/tokens.css custom properties, loaded by the renderer) with the
// dark-theme values as literal fallbacks, so the chip looks right even if it
// renders before/without the renderer stylesheet.

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react'
import { authStore } from '../authStore'
import { HttpError } from '../http'
import { importLocalProgress, localProgressSummary } from '../migrate'

// Server rules (build contract §3) mirrored client-side so most mistakes never
// leave the browser.
const USERNAME_RE = /^[a-zA-Z0-9_-]{3,24}$/
const PASSWORD_MIN = 8

export function AccountChip(): React.JSX.Element | null {
  const state = useSyncExternalStore(authStore.subscribe, () => authStore.state)
  const [modalOpen, setModalOpen] = useState(false)

  if (!state.known) return null

  return (
    <div className="acct">
      {state.user ? (
        <UserMenu username={state.user.username} />
      ) : (
        <button type="button" className="acct-chip" onClick={() => setModalOpen(true)}>
          Sign in
        </button>
      )}
      {modalOpen && state.user === null && <AuthModal onClose={() => setModalOpen(false)} />}
    </div>
  )
}

function UserMenu({ username }: { username: string }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const signOut = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    // logout() never throws (it flips local state even if the request fails);
    // the reload remounts everything onto the logged-out local layer.
    await authStore.logout()
    window.location.reload()
  }

  return (
    <>
      {open && <div className="acct-backdrop" onClick={() => setOpen(false)} />}
      <button
        type="button"
        className="acct-chip"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="acct-dot" aria-hidden="true" />
        {username}
      </button>
      {open && (
        <div className="acct-menu" role="menu">
          <div className="acct-menu-header">Signed in as {username}</div>
          <button type="button" role="menuitem" onClick={signOut} disabled={busy}>
            {busy ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      )}
    </>
  )
}

/** "3 games, 1 custom variant" — the modal's local-progress summary.
 *  `includeRatings` is FALSE for the signup copy (ratings are deliberately not
 *  imported — migrate.ts) and TRUE for the sign-in "stays on this browser"
 *  copy, so neither sentence contradicts what actually happens. */
function summaryLabel(
  s: ReturnType<typeof localProgressSummary>,
  includeRatings: boolean
): string {
  const parts: string[] = []
  if (s.games > 0) parts.push(`${s.games} game${s.games === 1 ? '' : 's'}`)
  if (s.variants > 0) parts.push(`${s.variants} custom variant${s.variants === 1 ? '' : 's'}`)
  if (includeRatings && s.ratedAttempts > 0) parts.push('local ratings')
  return parts.join(', ') || 'settings'
}

function friendlyAuthError(err: unknown, mode: 'signin' | 'signup'): string {
  if (err instanceof HttpError) {
    if (mode === 'signin' && err.status === 401) return 'Wrong username or password.'
    if (mode === 'signup' && err.status === 409) return 'That username is already taken.'
    return err.message
  }
  if (err instanceof TypeError) {
    return 'Can’t reach the server — check your connection and try again.'
  }
  return err instanceof Error ? err.message : 'Something went wrong — try again.'
}

function AuthModal({ onClose }: { onClose: () => void }): React.JSX.Element {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [busyText, setBusyText] = useState<string | null>(null)
  // Snapshot once per modal open: does this browser hold signed-out progress?
  const [local] = useState(localProgressSummary)
  const userRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    userRef.current?.focus()
  }, [mode])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    if (busy) return
    const name = username.trim()
    if (!USERNAME_RE.test(name)) {
      setError('Usernames are 3–24 characters: letters, numbers, - or _.')
      return
    }
    if (password.length === 0) {
      setError('Enter your password.')
      return
    }
    if (mode === 'signup' && password.length < PASSWORD_MIN) {
      setError(`Passwords need at least ${PASSWORD_MIN} characters.`)
      return
    }
    setBusy(true)
    setError(null)
    try {
      if (mode === 'signup') {
        await authStore.signup(name, password)
        // One-time import into the brand-new (empty) account: games + cached
        // reviews, variants, settings. Best-effort — it never rejects, and the
        // local copies stay put either way (migrate.ts). Sign-IN deliberately
        // skips this: merging into existing account data is undecidable.
        if (local.hasAny || local.settings > 0) {
          setBusyText('Moving your progress into the account…')
          await importLocalProgress()
        }
      } else {
        await authStore.login(name, password)
      }
      // Remount every surface onto the account backend (v1 reload policy).
      window.location.reload()
    } catch (err) {
      setBusy(false)
      setBusyText(null)
      setError(friendlyAuthError(err, mode))
    }
  }

  const signup = mode === 'signup'

  return (
    <div
      className="acct-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="acct-modal" role="dialog" aria-modal="true" aria-label="Chess# account">
        <h2>{signup ? 'Create your account' : 'Sign in'}</h2>
        <p className="acct-sub">
          {signup
            ? 'Free — keeps games, ratings and school progress synced.'
            : 'Pick up your games, ratings and school progress.'}
        </p>
        {local.hasAny && (
          <p className="acct-local-note">
            {signup
              ? `Your progress on this browser (${summaryLabel(local, false)}) is copied into ` +
                'the new account. Puzzle and bot ratings start fresh.'
              : 'Progress made while signed out (' +
                summaryLabel(local, true) +
                ') stays on this browser — it is not merged into the account.'}
          </p>
        )}
        <form onSubmit={submit}>
          <div className="acct-field">
            <label htmlFor="acct-username">Username</label>
            <input
              id="acct-username"
              ref={userRef}
              value={username}
              autoComplete="username"
              spellCheck={false}
              maxLength={24}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <div className="acct-field">
            <label htmlFor="acct-password">Password</label>
            <input
              id="acct-password"
              type="password"
              value={password}
              autoComplete={signup ? 'new-password' : 'current-password'}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <div className="acct-error">{error}</div>}
          <button type="submit" className="acct-submit" disabled={busy}>
            {busy ? (busyText ?? 'One moment…') : signup ? 'Create account' : 'Sign in'}
          </button>
        </form>
        <div className="acct-switch">
          {signup ? 'Already have an account? ' : 'New here? '}
          <button
            type="button"
            onClick={() => {
              setMode(signup ? 'signin' : 'signup')
              setError(null)
            }}
          >
            {signup ? 'Sign in instead' : 'Create one'}
          </button>
        </div>
        <button type="button" className="acct-close" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>
    </div>
  )
}
