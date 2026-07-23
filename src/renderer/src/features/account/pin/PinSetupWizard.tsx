import { useEffect, useState, type JSX } from 'react'
import {
  AlertCircle,
  ArrowLeft,
  Check,
  ChevronRight,
  CircleCheck,
  Eye,
  EyeOff,
  Infinity as InfinityIcon,
  KeyRound,
  Lock,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  X
} from 'lucide-react'
import { OverlayDialog } from '../../../components/OverlayDialog'
import { DEV_FIXTURE, PIN_STATUS, WITNESS_SET, fakeB64u, shortB64u } from '../mock/fixtures'
import { FixturePreviewBadge } from '../mock/FixturePreviewBadge'
import { accountsUiStore } from '../mock/store'
import './pin.css'

/**
 * §1 PIN setup, four steps: what the PIN gates → choose digits → bind the
 * T-of-N committee (animated mock provisioning) → the deal, stated plainly
 * (lifetime-100 fuse, no reset on success, refill R after a served ban).
 * DEV_FIXTURE preview flow (labeled in the UI): renders from fixtures only;
 * finishing flips accountsUiStore.pinConfigured().
 */

const COMMITTEE = PIN_STATUS.committee

interface CommitteeSeat {
  key: string
  label: string
  distance: number
  /** id-only seats (no handle known) render in mono. */
  mono: boolean
}

/**
 * The committee is drawn by key-distance from the witness fabric (§1/§4). The
 * fixture fabric names six nodes; the remaining seats to reach N are farther
 * nodes known only by node id.
 */
const SEATS: CommitteeSeat[] = [
  ...WITNESS_SET.map((w) => ({
    key: w.nodeId,
    label: w.handle,
    distance: w.distance,
    mono: false
  })),
  {
    key: fakeB64u('pin-committee-seat-6'),
    label: shortB64u(fakeB64u('pin-committee-seat-6')),
    distance: 6,
    mono: true
  },
  {
    key: fakeB64u('pin-committee-seat-7'),
    label: shortB64u(fakeB64u('pin-committee-seat-7')),
    distance: 7,
    mono: true
  }
]
  .sort((a, b) => a.distance - b.distance)
  .slice(0, COMMITTEE.n)

const STEP_LABELS = ['What it gates', 'Choose a PIN', 'Bind committee', 'The deal']

/** Mock provisioning cadence — one committee seat ticks per interval. */
const SEAT_TICK_MS = 420

/** Keep only digits, capped at the 8-digit maximum. */
function digitsOnly(v: string): string {
  return v.replace(/\D/g, '').slice(0, 8)
}

export function PinSetupWizard({ onClose }: { onClose: () => void }): JSX.Element {
  const [step, setStep] = useState(0)
  const [pin, setPin] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [placed, setPlaced] = useState(0)

  // Mock committee provisioning: seats tick one by one while the provisioning
  // step is showing; leaving the step resets progress via re-entry.
  useEffect(() => {
    if (step !== 2) return
    setPlaced(0)
    const iv = window.setInterval(() => {
      setPlaced((p) => {
        const next = Math.min(p + 1, SEATS.length)
        if (next === SEATS.length) window.clearInterval(iv)
        return next
      })
    }, SEAT_TICK_MS)
    return () => window.clearInterval(iv)
  }, [step])

  const lenOk = pin.length >= 4 && pin.length <= 8
  const mismatch = confirm.length > 0 && !pin.startsWith(confirm)
  const match = lenOk && confirm === pin
  const bound = placed >= SEATS.length

  function finish(): void {
    accountsUiStore.pinConfigured()
    onClose()
  }

  return (
    <OverlayDialog
      onClose={onClose}
      placement="center"
      className="shell-modal"
      labelledBy="apin-setup-title"
    >
      <div className="shell-modal-head">
        <h2 id="apin-setup-title">Set up your PIN</h2>
        {DEV_FIXTURE && (
          <FixturePreviewBadge label="Preview flow — the real committee arrives with network transport" />
        )}
        <button type="button" className="shell-modal-close" aria-label="Close" onClick={onClose}>
          <X size={18} aria-hidden />
        </button>
      </div>

      <div className="shell-modal-body">
        <div className="apin-body">
          <ol className="apin-steps" aria-label={`Step ${step + 1} of ${STEP_LABELS.length}`}>
            {STEP_LABELS.map((label, i) => (
              <li
                key={label}
                className={`apin-step${i === step ? ' on' : ''}${i < step ? ' done' : ''}`}
                aria-current={i === step ? 'step' : undefined}
              >
                <span className="apin-step-bar" aria-hidden />
                <span className="apin-step-label">{label}</span>
              </li>
            ))}
          </ol>

          {step === 0 && (
            <>
              <p className="apin-lede">
                Your PIN has one job: it gates the <strong>witnessed zone</strong> — the part of
                your account other people have to be able to trust. Everything else runs on your
                password alone.
              </p>
              <div className="apin-gates">
                <div className="apin-gate-col is-pin">
                  <span className="apin-gate-head">
                    <Lock size={13} aria-hidden /> PIN required
                  </span>
                  <ul className="apin-gate-list">
                    <li>Rated play (write-lease grants)</li>
                    <li>Taking over the write lease from another device</li>
                    <li>Witnessing a device&rsquo;s first witnessed contact</li>
                    <li>Re-provisioning the PIN committee</li>
                  </ul>
                </div>
                <div className="apin-gate-col">
                  <span className="apin-gate-head">
                    <KeyRound size={13} aria-hidden /> Password alone
                  </span>
                  <ul className="apin-gate-list">
                    <li>Full local &amp; offline use</li>
                    <li>Unrated link-play</li>
                    <li>Analysis, puzzles, and school</li>
                    <li>Reading any public chain</li>
                  </ul>
                </div>
              </div>
              <p className="apin-foot-note">
                A PIN is not a second password: it protects the zone others rely on, and it comes
                with a lifetime failure budget. The next steps spell out exactly what you are
                agreeing to.
              </p>
            </>
          )}

          {step === 1 && (
            <>
              <p className="apin-lede">
                Choose <strong>4–8 digits</strong>. Verification is a threshold OPRF against a
                bound committee — members hold shares and answer challenges, and none of them ever
                sees these digits.
              </p>
              <div className="apin-field">
                <label className="apin-field-label" htmlFor="apin-new-pin">
                  New PIN
                </label>
                <div className="apin-input-wrap">
                  <input
                    id="apin-new-pin"
                    className="apin-input"
                    type={show ? 'text' : 'password'}
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={8}
                    value={pin}
                    onChange={(e) => setPin(digitsOnly(e.target.value))}
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
                {pin.length === 0 ? (
                  <p className="apin-check hint">4–8 digits.</p>
                ) : !lenOk ? (
                  <p className="apin-check hint">
                    {4 - pin.length} more digit{4 - pin.length === 1 ? '' : 's'} to reach the
                    4-digit minimum.
                  </p>
                ) : (
                  <p className="apin-check ok">
                    <Check size={12} aria-hidden /> {pin.length}-digit PIN.
                  </p>
                )}
              </div>
              <div className="apin-field">
                <label className="apin-field-label" htmlFor="apin-confirm-pin">
                  Re-enter to confirm
                </label>
                <div className="apin-input-wrap">
                  <input
                    id="apin-confirm-pin"
                    className="apin-input"
                    type={show ? 'text' : 'password'}
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={8}
                    value={confirm}
                    onChange={(e) => setConfirm(digitsOnly(e.target.value))}
                  />
                </div>
                {mismatch ? (
                  <p className="apin-check err" role="alert">
                    <AlertCircle size={12} aria-hidden /> PINs don&rsquo;t match.
                  </p>
                ) : match ? (
                  <p className="apin-check ok" role="status">
                    <Check size={12} aria-hidden /> PINs match.
                  </p>
                ) : null}
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="apin-prov-head">
                <p className="apin-lede">
                  Drawing a{' '}
                  <strong>
                    {COMMITTEE.t}-of-{COMMITTEE.n}
                  </strong>{' '}
                  committee by key-distance from the witness fabric…
                </p>
                <span className="apin-prov-count num">
                  {placed} / {SEATS.length}
                </span>
              </div>
              <ul className="apin-seats" aria-busy={!bound}>
                {SEATS.map((seat, i) => {
                  const done = i < placed
                  const dealing = i === placed && !bound
                  return (
                    <li key={seat.key} className={`apin-seat${done ? ' is-done' : ''}`}>
                      {done ? (
                        <CircleCheck size={16} aria-hidden className="apin-seat-check" />
                      ) : (
                        <span
                          className={`apin-seat-dot${dealing ? ' apin-seat-wait' : ''}`}
                          aria-hidden
                        />
                      )}
                      <span className="apin-seat-id">
                        <span className={`apin-seat-name${seat.mono ? ' mono' : ''}`}>
                          {seat.label}
                        </span>
                        <span className="apin-seat-sub num">key-distance {seat.distance}</span>
                      </span>
                      <span className="apin-seat-state">
                        {done ? 'share placed · counter replicated' : dealing ? 'dealing share…' : ''}
                      </span>
                    </li>
                  )
                })}
              </ul>
              {bound && (
                <p className="apin-check ok" role="status">
                  <Check size={12} aria-hidden /> Committee bound — a witnessed, root-signed record
                  fixes these {COMMITTEE.n} seats.
                </p>
              )}
              <p className="apin-foot-note">
                Seats hold threshold shares plus a threshold-replicated failure counter. They can
                neither learn your PIN nor derive your keys — and any future re-provision is a
                PIN-gated handoff that carries the counter forward, so a fresh committee never
                starts at zero.
              </p>
            </>
          )}

          {step === 3 && (
            <>
              <p className="apin-done-head">
                <ShieldCheck size={16} aria-hidden /> PIN bound. The deal, plainly:
              </p>
              <div className="apin-deals">
                <div className="apin-deal is-danger">
                  <span className="apin-deal-icon">
                    <ShieldAlert size={16} aria-hidden />
                  </span>
                  <div>
                    <p className="apin-deal-title">
                      {PIN_STATUS.lifetimeCap} lifetime failures trips the fuse
                    </p>
                    <p className="apin-deal-sub">
                      On failure {PIN_STATUS.lifetimeCap} the committee emits a threshold-signed
                      fuse-tripped record — a 90-day witnessed-zone ban, published as a public fact
                      any verifier can check.
                    </p>
                  </div>
                </div>
                <div className="apin-deal">
                  <span className="apin-deal-icon">
                    <InfinityIcon size={16} aria-hidden />
                  </span>
                  <div>
                    <p className="apin-deal-title">The counter never resets on success</p>
                    <p className="apin-deal-sub">
                      Correct entries don&rsquo;t clear it. It only counts up, for the life of the
                      account — two mistypes today are two failures spent forever.
                    </p>
                  </div>
                </div>
                <div className="apin-deal">
                  <span className="apin-deal-icon">
                    <RefreshCw size={16} aria-hidden />
                  </span>
                  <div>
                    <p className="apin-deal-title">
                      A served ban refills {PIN_STATUS.refill} failures of headroom
                    </p>
                    <p className="apin-deal-sub">
                      After the 90 days, the count stands where it stood — you get{' '}
                      {PIN_STATUS.refill} further failures before the next trip. Lifetime means
                      lifetime.
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="shell-modal-foot">
        {step > 0 && step < 3 && (
          <button
            type="button"
            className="btn ghost apin-back"
            onClick={() => setStep((s) => s - 1)}
          >
            <ArrowLeft size={14} aria-hidden /> Back
          </button>
        )}
        {step < 3 ? (
          <button
            type="button"
            className="btn apin-next"
            disabled={(step === 1 && !match) || (step === 2 && !bound)}
            onClick={() => setStep((s) => s + 1)}
          >
            {step === 1 ? 'Provision committee' : 'Continue'}
            <ChevronRight size={14} aria-hidden />
          </button>
        ) : (
          <button type="button" className="btn apin-next" onClick={finish}>
            <Check size={14} aria-hidden /> Done — PIN active
          </button>
        )}
      </div>
    </OverlayDialog>
  )
}
