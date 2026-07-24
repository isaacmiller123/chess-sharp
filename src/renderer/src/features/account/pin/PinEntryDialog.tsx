import { useState, useSyncExternalStore, type JSX, type KeyboardEvent } from 'react'
import {
  AlertTriangle,
  Check,
  Eye,
  EyeOff,
  Fingerprint,
  KeyRound,
  Loader2,
  Lock,
  RefreshCw,
  ShieldAlert,
  Users,
  WifiOff,
  X
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { OverlayDialog } from '../../../components/OverlayDialog'
import {
  getPinClientState,
  runPinVerify,
  subscribePinClient,
  type PinClientState,
  type PinPurpose
} from '../net/pinClient'
import './pin.css'

/**
 * §1/§4 PIN-gated actions: lease takeover, first witnessed device contact,
 * committee handoff. LIVE: the entry runs the real threshold OPRF against the
 * account's bound committee over the account-peer overlay (pinClient) — a wrong
 * PIN spends a lifetime failure against the committee's replicated counter
 * (never resets — C-2), and a fuse-banned account is refused by the committee
 * itself. No committee reachable ⇒ an HONEST wait state, never a fake evaluation.
 */

const PURPOSE_COPY: Record<
  PinPurpose,
  { Icon: LucideIcon; title: string; body: string; cta: string }
> = {
  'lease-takeover': {
    Icon: Lock,
    title: 'Take over the write lease',
    body: 'Another device holds the write lease — taking over requires a PIN-gated witnessed session. The fabric grants the new lease under a fresh epoch, fencing the old device off.',
    cta: 'Take over'
  },
  'device-witness': {
    Icon: Fingerprint,
    title: 'Witness this device',
    body: 'First witnessed contact from this device — countersigning its enrollment is PIN-gated. Once witnessed, this device can act in the witnessed zone.',
    cta: 'Witness device'
  },
  'committee-handoff': {
    Icon: RefreshCw,
    title: 'Re-provision the PIN committee',
    body: 'Re-provisioning the PIN committee is a PIN-gated handoff — shares are re-dealt to fresh seats and the lifetime failure counter carries forward, never back to zero.',
    cta: 'Hand off'
  }
}

/** Failure count within this many of the cap escalates the copy to danger. */
const CRITICAL_MARGIN = 10

/** Keep only digits, capped at the 8-digit maximum. */
function digitsOnly(v: string): string {
  return v.replace(/\D/g, '').slice(0, 8)
}

function usePinClient(): PinClientState {
  return useSyncExternalStore(subscribePinClient, getPinClientState, getPinClientState)
}

export function PinEntryDialog({
  purpose,
  onClose,
  onSuccess
}: {
  purpose: PinPurpose
  onClose: () => void
  onSuccess?: () => void
}): JSX.Element {
  const pin = usePinClient()
  const [value, setValue] = useState('')
  const [show, setShow] = useState(false)
  const [phase, setPhase] = useState<'input' | 'checking' | 'success'>('input')
  const [failReason, setFailReason] = useState<string | null>(null)

  const { t, n } = pin.committee
  const cap = pin.lifetimeCap
  const failures = pin.failures ?? 0
  const critical = failures >= cap - CRITICAL_MARGIN
  const copy = PURPOSE_COPY[purpose]

  // The committee must be live + a PIN provisioned to run an evaluation. Any other
  // phase is surfaced honestly (no fake evaluation, no dead control).
  const notReady =
    pin.phase === 'signed-out'
      ? { Icon: KeyRound, line: 'Sign in to open a witnessed session — the PIN gates the witnessed zone.' }
      : pin.phase === 'no-peer'
        ? { Icon: WifiOff, line: 'Connecting to the network… a witnessed session needs the account peer online.' }
        : pin.phase === 'no-committee'
          ? { Icon: Users, line: `Waiting for your PIN committee — it needs ${n} nearby machines to answer.` }
          : pin.phase === 'unset'
            ? { Icon: KeyRound, line: 'No PIN is set for this account yet — set one up first.' }
            : null

  const banned = pin.phase === 'banned'
  const canSubmit = phase === 'input' && value.length >= 4 && !notReady && !banned

  async function submit(): Promise<void> {
    if (!canSubmit) return
    setFailReason(null)
    setPhase('checking')
    const res = await runPinVerify(value, purpose)
    if (res.ok) {
      setPhase('success')
      window.setTimeout(() => {
        onSuccess?.()
        onClose()
      }, 1200)
      return
    }
    // A wrong PIN (or a committee that could not be reached) returns to input with
    // the honest reason; a fuse trip flips the whole dialog to the banned state.
    setValue('')
    setFailReason(res.reason ?? 'verify-failed')
    setPhase('input')
  }

  function onInputKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter') {
      e.preventDefault()
      void submit()
    }
  }

  const showBanned = banned || failReason === 'fuse-active'

  return (
    <OverlayDialog
      onClose={onClose}
      placement="center"
      className="shell-modal"
      labelledBy="apin-entry-title"
    >
      <div className="shell-modal-head">
        <h2 id="apin-entry-title">{copy.title}</h2>
        <button type="button" className="shell-modal-close" aria-label="Close" onClick={onClose}>
          <X size={18} aria-hidden />
        </button>
      </div>

      <div className="shell-modal-body">
        <div className="apin-body">
          <div className="apin-purpose">
            <span className="apin-purpose-icon">
              <copy.Icon size={18} aria-hidden />
            </span>
            <p className="apin-lede">{copy.body}</p>
          </div>

          {showBanned ? (
            <div className="apin-fail is-critical" role="alert">
              <p className="apin-fail-line">
                <ShieldAlert size={14} aria-hidden /> Witnessed zone locked — the PIN fuse has
                tripped.
              </p>
              <p className="apin-fail-sub num">
                The committee refuses to serve a fuse-banned root; no witnessed session can open
                until the ban expires. Everything unwitnessed still works on your password alone.
              </p>
            </div>
          ) : notReady ? (
            <div className="apin-purpose" role="status">
              <span className="apin-purpose-icon">
                <notReady.Icon size={16} aria-hidden />
              </span>
              <p className="apin-lede">{notReady.line}</p>
            </div>
          ) : phase === 'input' ? (
            <>
              <div className="apin-field">
                <label className="apin-field-label" htmlFor="apin-entry-input">
                  PIN
                </label>
                <div className="apin-input-wrap">
                  <input
                    id="apin-entry-input"
                    className="apin-input"
                    type={show ? 'text' : 'password'}
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={8}
                    value={value}
                    onChange={(e) => setValue(digitsOnly(e.target.value))}
                    onKeyDown={onInputKeyDown}
                  />
                  <button
                    type="button"
                    className="apin-eye"
                    aria-label={show ? 'Hide PIN' : 'Show PIN'}
                    aria-pressed={show}
                    onClick={() => setShow((s) => !s)}
                  >
                    {show ? <EyeOff size={15} aria-hidden /> : <Eye size={15} aria-hidden />}
                  </button>
                </div>
                <p className="apin-check hint">
                  Verified by your {t}-of-{n} committee — none of them ever sees these digits.
                </p>
              </div>

              {failReason === 'wrong-pin' ? (
                <div className={`apin-fail${critical ? ' is-critical' : ''}`} role="alert">
                  <p className="apin-fail-line">
                    <AlertTriangle size={14} aria-hidden /> PIN rejected — the committee recorded
                    the failure.
                  </p>
                  <div className="apin-meter" aria-hidden>
                    <div
                      className="apin-meter-fill"
                      style={{ width: `${Math.min(100, (failures / cap) * 100)}%` }}
                    />
                  </div>
                  <p className="apin-fail-sub num">
                    {failures} of {cap} lifetime failures — this counter never resets.
                    {critical &&
                      ` ${cap - failures} left before the fuse trips: a 90-day witnessed-zone ban.`}
                  </p>
                </div>
              ) : failReason && failReason !== 'fuse-active' ? (
                <p className="apin-check err" role="alert">
                  <AlertTriangle size={12} aria-hidden /> Could not reach the committee ({failReason}
                  ) — try again once it is online.
                </p>
              ) : pin.failures !== null ? (
                <p className="apin-counter muted small num">
                  Committee counter: {failures} of {cap} lifetime failures on record.
                </p>
              ) : null}
            </>
          ) : (
            <div className="apin-eval" role="status" aria-busy={phase === 'checking'}>
              <div className="apin-eval-dots" aria-hidden>
                {Array.from({ length: n }, (_, i) => (
                  <span key={i} className={`apin-eval-dot${phase === 'success' ? ' is-on' : ''}`} />
                ))}
              </div>
              {phase === 'success' ? (
                <p className="apin-eval-ok">
                  <Check size={14} aria-hidden /> {t} of {n} committee members answered — nobody saw
                  your PIN.
                </p>
              ) : (
                <p className="apin-eval-label num">
                  <Loader2 size={13} aria-hidden /> Evaluating the threshold OPRF across your
                  committee…
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="shell-modal-foot">
        <button
          type="button"
          className="btn ghost"
          onClick={onClose}
          disabled={phase === 'success'}
        >
          Cancel
        </button>
        <button type="button" className="btn apin-next" disabled={!canSubmit} onClick={() => void submit()}>
          <KeyRound size={14} aria-hidden /> {copy.cta}
        </button>
      </div>
    </OverlayDialog>
  )
}
