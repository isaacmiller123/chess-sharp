import { useEffect, useState, type JSX, type KeyboardEvent } from 'react'
import {
  AlertTriangle,
  Check,
  Eye,
  EyeOff,
  Fingerprint,
  KeyRound,
  Lock,
  RefreshCw,
  X
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { OverlayDialog } from '../../../components/OverlayDialog'
import { DEV_FIXTURE } from '../mock/fixtures'
import { FixturePreviewBadge } from '../mock/FixturePreviewBadge'
import { accountsUiStore, useAccountsUi } from '../mock/store'
import './pin.css'

/**
 * §1/§4 PIN-gated actions: lease takeover, first witnessed device contact,
 * committee handoff. A wrong PIN spends a lifetime failure against the
 * committee counter (never resets — C-2); a correct one plays a brief
 * threshold-OPRF evaluation before resolving. DEV_FIXTURE preview flow
 * (labeled in the UI): the committee and SAMPLE_PIN are sample state.
 */

type PinPurpose = 'lease-takeover' | 'device-witness' | 'committee-handoff'

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

/** The preview accepts this PIN; anything else spends a lifetime failure. */
const SAMPLE_PIN = '2468'

/** Failure count at which the meter and copy escalate to danger. */
const CRITICAL_AT = 90

/** Ms between committee answers in the mock threshold evaluation. */
const ANSWER_TICK_MS = 260

/** Keep only digits, capped at the 8-digit maximum. */
function digitsOnly(v: string): string {
  return v.replace(/\D/g, '').slice(0, 8)
}

export function PinEntryDialog({
  purpose,
  onClose,
  onSuccess
}: {
  purpose: 'lease-takeover' | 'device-witness' | 'committee-handoff'
  onClose: () => void
  onSuccess?: () => void
}): JSX.Element {
  const ui = useAccountsUi()
  const [value, setValue] = useState('')
  const [show, setShow] = useState(false)
  const [phase, setPhase] = useState<'input' | 'checking' | 'success'>('input')
  const [answered, setAnswered] = useState(0)
  const [failed, setFailed] = useState(false)

  const { t, n } = ui.pin.committee
  const failures = ui.pin.failures
  const cap = ui.pin.lifetimeCap
  const critical = failures >= CRITICAL_AT

  // Checking: committee answers arrive one by one until the threshold is met.
  useEffect(() => {
    if (phase !== 'checking') return
    const iv = window.setInterval(() => {
      setAnswered((a) => {
        const next = Math.min(a + 1, t)
        if (next === t) window.clearInterval(iv)
        return next
      })
    }, ANSWER_TICK_MS)
    return () => window.clearInterval(iv)
  }, [phase, t])

  // Threshold met → a short beat, then the success line.
  useEffect(() => {
    if (phase !== 'checking' || answered < t) return
    const to = window.setTimeout(() => setPhase('success'), 350)
    return () => window.clearTimeout(to)
  }, [phase, answered, t])

  // Success lingers long enough to read, then resolves the flow.
  useEffect(() => {
    if (phase !== 'success') return
    const to = window.setTimeout(() => {
      onSuccess?.()
      onClose()
    }, 1300)
    return () => window.clearTimeout(to)
  }, [phase, onSuccess, onClose])

  const copy = PURPOSE_COPY[purpose]
  const canSubmit = phase === 'input' && value.length >= 4

  function submit(): void {
    if (!canSubmit) return
    if (value === SAMPLE_PIN) {
      setAnswered(0)
      setPhase('checking')
    } else {
      accountsUiStore.recordPinFailure()
      setFailed(true)
      setValue('')
    }
  }

  function onInputKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter') {
      e.preventDefault()
      submit()
    }
  }

  return (
    <OverlayDialog
      onClose={onClose}
      placement="center"
      className="shell-modal"
      labelledBy="apin-entry-title"
    >
      <div className="shell-modal-head">
        <h2 id="apin-entry-title">{copy.title}</h2>
        {DEV_FIXTURE && (
          <FixturePreviewBadge label="Preview flow — the real committee arrives with network transport" />
        )}
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

          {phase === 'input' ? (
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
                <p className="apin-check hint">Preview — the sample PIN is {SAMPLE_PIN}.</p>
              </div>

              {failed ? (
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
              ) : (
                <p className="apin-counter muted small num">
                  Committee counter: {failures} of {cap} lifetime failures on record.
                </p>
              )}
            </>
          ) : (
            <div className="apin-eval" role="status" aria-busy={phase === 'checking'}>
              <div className="apin-eval-dots" aria-hidden>
                {Array.from({ length: n }, (_, i) => (
                  <span key={i} className={`apin-eval-dot${i < answered ? ' is-on' : ''}`} />
                ))}
              </div>
              {phase === 'success' ? (
                <p className="apin-eval-ok">
                  <Check size={14} aria-hidden /> {t} of {n} committee members answered — nobody
                  saw your PIN.
                </p>
              ) : (
                <p className="apin-eval-label num">
                  Evaluating threshold OPRF — {answered} of {t} required answers…
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
        <button type="button" className="btn apin-next" disabled={!canSubmit} onClick={submit}>
          <KeyRound size={14} aria-hidden /> {copy.cta}
        </button>
      </div>
    </OverlayDialog>
  )
}
