import { useState, useSyncExternalStore, type JSX } from 'react'
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
  Loader2,
  Lock,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Users,
  WifiOff,
  X
} from 'lucide-react'
import { OverlayDialog } from '../../../components/OverlayDialog'
import {
  getPinClientState,
  runPinProvision,
  subscribePinClient,
  type PinClientState
} from '../net/pinClient'
import './pin.css'

/**
 * §1 PIN setup, four steps: what the PIN gates → choose digits → bind the
 * T-of-N committee (LIVE: shares are dealt to the distance-drawn committee over
 * the account-peer overlay, a witnessed root-signed record fixes the seats) →
 * the deal, stated plainly (lifetime-100 fuse, no reset on success, refill R
 * after a served ban). With no committee reachable the bind step WAITS honestly
 * — it never fakes a provisioning animation.
 */

const STEP_LABELS = ['What it gates', 'Choose a PIN', 'Bind committee', 'The deal']

/** Keep only digits, capped at the 8-digit maximum. */
function digitsOnly(v: string): string {
  return v.replace(/\D/g, '').slice(0, 8)
}

function usePinClient(): PinClientState {
  return useSyncExternalStore(subscribePinClient, getPinClientState, getPinClientState)
}

export function PinSetupWizard({ onClose }: { onClose: () => void }): JSX.Element {
  const pin = usePinClient()
  const [step, setStep] = useState(0)
  const [pinVal, setPinVal] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [bound, setBound] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  // Whether the account already had a PIN when the wizard opened — a genuine
  // change re-provisions via the PIN-gated committee handoff (a follow-up).
  const [wasSet] = useState(pin.phase === 'set' || pin.phase === 'banned')

  const { t, n } = pin.committee
  const lenOk = pinVal.length >= 4 && pinVal.length <= 8
  const mismatch = confirm.length > 0 && !pinVal.startsWith(confirm)
  const match = lenOk && confirm === pinVal

  // Honest committee readiness (drives the bind step — never a fake).
  const notReady =
    pin.phase === 'signed-out'
      ? { Icon: KeyRound, line: 'Sign in first — a PIN binds to your account root and its committee.' }
      : pin.phase === 'no-peer'
        ? { Icon: WifiOff, line: 'Connecting to the network… binding a committee needs the account peer online.' }
        : pin.phase === 'no-committee'
          ? { Icon: Users, line: `Waiting for a committee — it needs ${n} nearby machines by key-distance to answer.` }
          : null
  const canProvision = !wasSet && !notReady && pin.phase === 'unset'

  async function provision(): Promise<void> {
    if (busy || !canProvision) return
    setBusy(true)
    setErr(null)
    const res = await runPinProvision(pinVal)
    setBusy(false)
    if (res.ok) {
      setBound(true)
      setErr(null)
    } else {
      setErr(res.reason ?? 'provision-failed')
    }
  }

  function finish(): void {
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
                    value={pinVal}
                    onChange={(e) => setPinVal(digitsOnly(e.target.value))}
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
                {pinVal.length === 0 ? (
                  <p className="apin-check hint">4–8 digits.</p>
                ) : !lenOk ? (
                  <p className="apin-check hint">
                    {4 - pinVal.length} more digit{4 - pinVal.length === 1 ? '' : 's'} to reach the
                    4-digit minimum.
                  </p>
                ) : (
                  <p className="apin-check ok">
                    <Check size={12} aria-hidden /> {pinVal.length}-digit PIN.
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
              {wasSet ? (
                <div className="apin-purpose" role="status">
                  <span className="apin-purpose-icon">
                    <RefreshCw size={16} aria-hidden />
                  </span>
                  <p className="apin-lede">
                    A PIN is already set for this account. <strong>Changing it</strong> re-provisions
                    the committee as a PIN-gated handoff — shares move to fresh seats and the lifetime
                    failure counter carries forward, never back to zero. That handoff flow arrives
                    with committee re-provisioning; your current PIN and committee stay in force.
                  </p>
                </div>
              ) : notReady ? (
                <div className="apin-purpose" role="status">
                  <span className="apin-purpose-icon">
                    <notReady.Icon size={16} aria-hidden />
                  </span>
                  <p className="apin-lede">{notReady.line}</p>
                </div>
              ) : (
                <>
                  <div className="apin-prov-head">
                    <p className="apin-lede">
                      Binding a{' '}
                      <strong>
                        {t}-of-{n}
                      </strong>{' '}
                      committee by key-distance from the witness fabric…
                    </p>
                    <span className="apin-prov-count num">
                      {pin.seats.filter((s) => s.provisioned).length} / {pin.seats.length}
                    </span>
                  </div>
                  <ul className="apin-seats" aria-busy={busy}>
                    {pin.seats.map((seat) => (
                      <li key={seat.nodeId} className={`apin-seat${seat.provisioned ? ' is-done' : ''}`}>
                        {seat.provisioned ? (
                          <CircleCheck size={16} aria-hidden className="apin-seat-check" />
                        ) : (
                          <span
                            className={`apin-seat-dot${busy ? ' apin-seat-wait' : ''}`}
                            aria-hidden
                          />
                        )}
                        <span className="apin-seat-id">
                          <span className="apin-seat-name mono">{seat.label}</span>
                          <span className="apin-seat-sub num">committee-capable peer</span>
                        </span>
                        <span className="apin-seat-state">
                          {seat.provisioned
                            ? 'share placed · counter replicated'
                            : busy
                              ? 'dealing share…'
                              : 'ready'}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {bound ? (
                    <p className="apin-check ok" role="status">
                      <Check size={12} aria-hidden /> Committee bound — a witnessed, root-signed
                      record fixes these {n} seats.
                    </p>
                  ) : err ? (
                    <p className="apin-check err" role="alert">
                      <AlertCircle size={12} aria-hidden />{' '}
                      {err === 'no-committee'
                        ? `Not enough committee-capable machines online yet (needs ${n}).`
                        : `Provisioning could not complete (${err}).`}
                    </p>
                  ) : (
                    <p className="apin-foot-note">
                      Seats hold threshold shares plus a threshold-replicated failure counter. They
                      can neither learn your PIN nor derive your keys — and any future re-provision
                      is a PIN-gated handoff that carries the counter forward, so a fresh committee
                      never starts at zero.
                    </p>
                  )}
                </>
              )}
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
                    <p className="apin-deal-title">{pin.lifetimeCap} lifetime failures trips the fuse</p>
                    <p className="apin-deal-sub">
                      On failure {pin.lifetimeCap} the committee emits a threshold-signed fuse-tripped
                      record — a 90-day witnessed-zone ban, published as a public fact any verifier
                      can check.
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
                      A served ban refills {pin.refill} failures of headroom
                    </p>
                    <p className="apin-deal-sub">
                      After the 90 days, the count stands where it stood — you get {pin.refill}{' '}
                      further failures before the next trip. Lifetime means lifetime.
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
            disabled={busy}
          >
            <ArrowLeft size={14} aria-hidden /> Back
          </button>
        )}
        {step === 0 && (
          <button type="button" className="btn apin-next" onClick={() => setStep(1)}>
            Continue <ChevronRight size={14} aria-hidden />
          </button>
        )}
        {step === 1 && (
          <button type="button" className="btn apin-next" disabled={!match} onClick={() => setStep(2)}>
            Bind committee <ChevronRight size={14} aria-hidden />
          </button>
        )}
        {step === 2 &&
          (bound ? (
            <button type="button" className="btn apin-next" onClick={() => setStep(3)}>
              Continue <ChevronRight size={14} aria-hidden />
            </button>
          ) : wasSet ? (
            // A PIN is already bound — the change/handoff flow is a follow-up, so
            // there is no provision action to offer here. Give an honest LIVE
            // terminal ("your current PIN stays in force"), never a frozen button.
            <button type="button" className="btn apin-next" onClick={onClose}>
              <Check size={14} aria-hidden /> Keep current PIN
            </button>
          ) : (
            <button
              type="button"
              className="btn apin-next"
              disabled={!canProvision || busy}
              onClick={() => void provision()}
            >
              {busy ? (
                <>
                  <Loader2 size={14} aria-hidden /> Provisioning…
                </>
              ) : (
                <>
                  <KeyRound size={14} aria-hidden /> Provision committee
                </>
              )}
            </button>
          ))}
        {step === 3 && (
          <button type="button" className="btn apin-next" onClick={finish}>
            <Check size={14} aria-hidden /> Done — PIN active
          </button>
        )}
      </div>
    </OverlayDialog>
  )
}
