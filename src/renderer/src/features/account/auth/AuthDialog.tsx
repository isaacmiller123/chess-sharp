import { useEffect, useState, type JSX } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  Eye,
  EyeOff,
  Fingerprint,
  Globe,
  X
} from 'lucide-react'
import { OverlayDialog } from '../../../components/OverlayDialog'
import { accountsUiStore, useAccountsUi } from '../mock/store'
import { RecoveryExportBody } from './RecoveryExport'

/**
 * Create / sign-in dialog (spec §1, §10) — WIRED to the real key derivation
 * (src/web/accounts.ts): both flows are pure local computation, no signup
 * round-trip, and signing in anywhere is re-derivation, never a lookup.
 * Steps:
 *   form     — username + password with inline validation and a mode toggle.
 *              Same name + different password IS a different account (its own
 *              derived tag), so no picker step exists: the password selects
 *              the account. When this device's keyring holds several accounts
 *              under one name, a hint says so.
 *   recovery — post-creation mnemonic/keyfile export (C-5), then close
 */

/** §1: 3–24 chars, letters / digits / underscore / hyphen. */
const NAME_RE = /^[a-zA-Z0-9_-]{3,24}$/

type Step = 'form' | 'recovery'

export function AuthDialog({
  mode,
  onClose
}: {
  mode: 'signin' | 'create'
  onClose: () => void
}): JSX.Element {
  const { busy, error, keyringAccounts } = useAccountsUi()
  const [activeMode, setActiveMode] = useState<'signin' | 'create'>(mode)
  const [step, setStep] = useState<Step>('form')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  // Privacy default (wiring-6): the derived seed is stored ONLY on explicit
  // opt-in — the box starts unchecked, matching src/web/accounts.ts
  // CreateAccountOpts ("Default: NOT stored") and the types.ts contract.
  const [remember, setRemember] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [fill, setFill] = useState(0)

  const isBusy = busy === 'deriving' || busy === 'verifying'

  // Closing during the recovery step still commits the created account — the
  // keys and chain already exist (real create), so hiding them behind a
  // signed-out card would be a dead end, not a cancel.
  const handleClose = (): void => {
    if (step === 'recovery') accountsUiStore.finishCreate()
    onClose()
  }

  // Progress fill for the derivation phases (§1: argon2id is seconds-scale on
  // slow hardware, so the wait deserves a bar). Cosmetic pacing only — the
  // phase flips come from the real store.
  useEffect(() => {
    if (busy !== 'deriving' && busy !== 'verifying') {
      setFill(0)
      return
    }
    const started = Date.now()
    const budget = busy === 'deriving' ? 1300 : 480
    setFill(6)
    const t = window.setInterval(() => {
      setFill(Math.min(96, Math.round(((Date.now() - started) / budget) * 100)))
    }, 80)
    return () => window.clearInterval(t)
  }, [busy])

  const nameOk = NAME_RE.test(name)
  const passOk = activeMode === 'create' ? password.length >= 8 : password.length > 0
  const showNameError = !nameOk && (submitted || name !== '')
  const showPassError = !passOk && (submitted || (activeMode === 'create' && password !== ''))

  // Real keyring rows sharing this display name (same name + different
  // password coexist under different tags — §1 collision rule).
  const sameName = (keyringAccounts ?? []).filter(
    (k) => k.displayName.toLowerCase() === name.toLowerCase()
  )

  const switchMode = (m: 'signin' | 'create'): void => {
    if (isBusy) return
    setActiveMode(m)
    setSubmitted(false)
    accountsUiStore.clearError()
  }

  async function submit(): Promise<void> {
    setSubmitted(true)
    if (isBusy || !nameOk || !passOk) return
    if (activeMode === 'create') {
      const ok = await accountsUiStore.createAccount(name, password, remember)
      // Keys exist now — nudge the mnemonic/keyfile export before closing (C-5).
      if (ok) setStep('recovery')
      return
    }
    const ok = await accountsUiStore.signIn(name, password, remember)
    if (ok) onClose()
  }

  const title =
    step === 'recovery'
      ? 'Save your recovery phrase'
      : activeMode === 'create'
        ? 'Create your account'
        : 'Sign in'

  const primaryLabel =
    busy === 'deriving'
      ? 'Deriving…'
      : busy === 'verifying'
        ? 'Verifying…'
        : activeMode === 'create'
          ? 'Create account'
          : 'Sign in'

  const busyNote = isBusy ? (
    <div className="aauth-busy" role="status">
      <span className="aauth-busy-copy">
        {busy === 'deriving' ? 'Deriving your keys locally (argon2id)…' : 'Verifying your chain…'}
      </span>
      <span className="aauth-busy-sub">
        {busy === 'deriving'
          ? 'Pure local computation — nothing leaves this device.'
          : 'Re-checking your event log from genesis.'}
      </span>
      <span className="aauth-busy-track" aria-hidden>
        <span className="aauth-busy-fill" style={{ width: `${fill}%` }} />
      </span>
    </div>
  ) : null

  return (
    <OverlayDialog
      onClose={handleClose}
      placement="center"
      className="shell-modal"
      labelledBy="aauth-title"
    >
      <div className="shell-modal-head">
        <h2 id="aauth-title">{title}</h2>
        <button
          type="button"
          className="shell-modal-close"
          aria-label="Close"
          onClick={handleClose}
        >
          <X size={18} aria-hidden />
        </button>
      </div>

      {step === 'recovery' ? (
        <div className="shell-modal-body">
          <RecoveryExportBody
            onDone={() => {
              // Commit the staged account only now — flipping signedIn earlier
              // would unmount this dialog before the recovery step is seen.
              accountsUiStore.finishCreate()
              onClose()
            }}
          />
        </div>
      ) : (
        <form
          className="aauth-form"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <div className="shell-modal-body aauth-stack" aria-busy={isBusy}>
            <div className="segmented aauth-modeswitch">
              <button
                type="button"
                className={`seg${activeMode === 'create' ? ' on' : ''}`}
                aria-pressed={activeMode === 'create'}
                disabled={isBusy}
                onClick={() => switchMode('create')}
              >
                Create account
              </button>
              <button
                type="button"
                className={`seg${activeMode === 'signin' ? ' on' : ''}`}
                aria-pressed={activeMode === 'signin'}
                disabled={isBusy}
                onClick={() => switchMode('signin')}
              >
                Sign in
              </button>
            </div>

            <div className="field">
              <label htmlFor="aauth-name">Username</label>
              <input
                id="aauth-name"
                className="text-input"
                value={name}
                maxLength={24}
                autoComplete="username"
                spellCheck={false}
                disabled={isBusy}
                onChange={(e) => setName(e.target.value)}
                aria-invalid={showNameError}
                aria-describedby={showNameError ? 'aauth-name-err' : 'aauth-name-hint'}
              />
              {showNameError ? (
                <p id="aauth-name-err" className="aauth-err" role="alert">
                  <AlertCircle size={13} aria-hidden /> 3–24 characters: letters, numbers, _ and -
                  only.
                </p>
              ) : (
                <span id="aauth-name-hint" className="aauth-hint">
                  3–24 characters: letters, numbers, _ and -.
                </span>
              )}
            </div>

            <div className="field">
              <label htmlFor="aauth-pass">Password</label>
              <div className="aauth-pw">
                <input
                  id="aauth-pass"
                  className="text-input"
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  autoComplete={activeMode === 'create' ? 'new-password' : 'current-password'}
                  disabled={isBusy}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-invalid={showPassError}
                  aria-describedby={showPassError ? 'aauth-pass-err' : 'aauth-pass-hint'}
                />
                <button
                  type="button"
                  className="aauth-pw-toggle"
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                  disabled={isBusy}
                  onClick={() => setShowPw((v) => !v)}
                >
                  {showPw ? <EyeOff size={15} aria-hidden /> : <Eye size={15} aria-hidden />}
                </button>
              </div>
              {showPassError ? (
                <p id="aauth-pass-err" className="aauth-err" role="alert">
                  <AlertCircle size={13} aria-hidden />{' '}
                  {activeMode === 'create' ? 'At least 8 characters.' : 'Enter your password.'}
                </p>
              ) : (
                <span id="aauth-pass-hint" className="aauth-hint">
                  {activeMode === 'create'
                    ? 'At least 8 characters. Your password is half of your keys — choose it like it matters.'
                    : 'The password you created this account with — it re-derives the same keys.'}
                </span>
              )}
            </div>

            {activeMode === 'signin' && sameName.length > 1 && (
              <p className="aauth-note">
                <Fingerprint size={14} aria-hidden />
                This device holds {sameName.length} accounts named &ldquo;{name}&rdquo; (
                {sameName.map((k) => `#${k.tag}`).join(', ')}). Each password derives its own
                keys, so your password picks the account.
              </p>
            )}

            {activeMode === 'create' && nameOk && (
              <div className="aauth-tagprev" aria-live="polite">
                <span className="aauth-tagprev-ic" aria-hidden>
                  <Fingerprint size={16} />
                </span>
                <span className="aauth-tagprev-body">
                  <span className="aauth-tagprev-eyebrow">You&rsquo;ll be</span>
                  <span className="aauth-tagprev-handle">
                    {name}
                    <b>#·····</b>
                  </span>
                  <span className="aauth-tagprev-sub">
                    Your 5-character tag derives from your keys the moment they exist — no
                    registry, no squatting.
                  </span>
                </span>
              </div>
            )}

            {activeMode === 'create' && (
              <div className="aauth-warn">
                <AlertTriangle size={16} aria-hidden />
                <span>
                  <strong>There is no recovery — by design.</strong> No email, no reset. Next
                  you&rsquo;ll save a 24-word recovery phrase and a keyfile — the only ways back
                  in.
                </span>
              </div>
            )}

            {activeMode === 'signin' && (
              <p className="aauth-note">
                <Globe size={14} aria-hidden />
                Any device works: signing in re-derives your keys from your name and password.
                There is no server account to look up.
              </p>
            )}

            <label className="aauth-ack">
              <input
                type="checkbox"
                checked={remember}
                disabled={isBusy}
                onChange={(e) => setRemember(e.target.checked)}
              />
              <span>Keep me signed in on this device (stores your derived seed locally).</span>
            </label>

            {error !== null && (
              <p className="aauth-err" role="alert">
                <AlertCircle size={13} aria-hidden /> {error}
              </p>
            )}

            {busyNote}
          </div>

          <div className="shell-modal-foot">
            <button type="button" className="btn ghost" disabled={isBusy} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn" disabled={isBusy}>
              {primaryLabel}
            </button>
          </div>
        </form>
      )}
    </OverlayDialog>
  )
}
