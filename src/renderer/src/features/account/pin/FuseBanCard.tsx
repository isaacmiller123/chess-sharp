import { useSyncExternalStore, type JSX } from 'react'
import { Check, Radio, RefreshCw, ShieldAlert, ShieldCheck, Signature, Swords } from 'lucide-react'
import {
  getPinClientState,
  subscribePinClient,
  type PinClientState,
  type PinFuseView
} from '../net/pinClient'
import './pin.css'

/**
 * §1 fuse-tripped state, rendered as what it is: a public, threshold-signed
 * record any verifier checks independently — not a notification, so there is no
 * dismiss. LIVE: it renders the account's REAL fuse record from the PIN client
 * when the fuse is active; when it is not, it says so honestly (the witnessed
 * zone is open) rather than fabricating a ban. The ban clock runs on
 * diversity-bound witnessed time (§4/C-7); staleness is shown against this
 * device's clock only as a rough remaining-days readout.
 */

const DAY_MS = 86_400_000
const DATE_FMT: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' }

function usePinClient(): PinClientState {
  return useSyncExternalStore(subscribePinClient, getPinClientState, getPinClientState)
}

export function FuseBanCard(): JSX.Element {
  const pin = usePinClient()
  const fuse = pin.fuse

  // No active fuse: the honest open-zone state — never a fabricated ban record.
  if (!fuse) return <FuseOpenState cap={pin.lifetimeCap} />

  return <FuseTrippedCard fuse={fuse} />
}

/** The witnessed zone is open — no fuse record under this account's key. */
function FuseOpenState({ cap }: { cap: number }): JSX.Element {
  return (
    <section className="apin-fuse" aria-labelledby="apin-fuse-title">
      <header className="apin-fuse-head">
        <ShieldCheck size={20} aria-hidden className="apin-fuse-head-icon" />
        <div className="apin-fuse-headcopy">
          <h3 className="apin-fuse-title" id="apin-fuse-title">
            Witnessed zone open — no fuse record
          </h3>
          <p className="apin-fuse-sub">
            No threshold-signed fuse-tripped record exists under this account&rsquo;s key. If your
            committee ever records {cap} lifetime PIN failures, it emits one here — a public signed
            fact any verifier checks on its own, gating a 90-day witnessed-zone ban.
          </p>
        </div>
      </header>
    </section>
  )
}

function FuseTrippedCard({ fuse }: { fuse: PinFuseView }): JSX.Element {
  const now = Date.now()
  const banDays = Math.max(1, Math.round((fuse.expiryWts - fuse.trippedWts) / DAY_MS))
  const served = Math.min(banDays, Math.max(0, Math.floor((now - fuse.trippedWts) / DAY_MS)))
  const remaining = Math.max(0, Math.ceil((fuse.expiryWts - now) / DAY_MS))
  const trippedDate = new Date(fuse.trippedWts).toLocaleDateString(undefined, DATE_FMT)
  const expiryDate = new Date(fuse.expiryWts).toLocaleDateString(undefined, DATE_FMT)

  return (
    <section className="apin-fuse" aria-labelledby="apin-fuse-title">
      <header className="apin-fuse-head">
        <ShieldAlert size={20} aria-hidden className="apin-fuse-head-icon" />
        <div className="apin-fuse-headcopy">
          <h3 className="apin-fuse-title" id="apin-fuse-title">
            PIN fuse tripped — witnessed zone locked
          </h3>
          <p className="apin-fuse-sub">
            Failure {fuse.fails} of {fuse.lifetimeCap} hit the lifetime cap, and the committee
            emitted a threshold-signed fuse-tripped record under this account&rsquo;s key. It is a
            public signed fact any verifier checks on its own — it expires, it doesn&rsquo;t delete.
          </p>
        </div>
        <span className="apin-fuse-pill">
          <Signature size={12} aria-hidden /> Threshold-signed record
        </span>
      </header>

      <div className="apin-fuse-body">
        <div className="apin-fuse-facts">
          <div className="apin-fact">
            <span className="apin-fact-k">Tripped</span>
            <span className="apin-fact-v">{trippedDate}</span>
          </div>
          <div className="apin-fact">
            <span className="apin-fact-k">Lifetime failures</span>
            <span className="apin-fact-v">
              {fuse.fails} of {fuse.lifetimeCap}
            </span>
          </div>
          <div className="apin-fact">
            <span className="apin-fact-k">Signed by</span>
            <span className="apin-fact-v">
              {fuse.signers} of {fuse.committeeN} committee
            </span>
          </div>
          <div className="apin-fact">
            <span className="apin-fact-k">Record</span>
            <span className="apin-fact-v mono">{fuse.recordId}</span>
          </div>
        </div>

        <div className="apin-fuse-count">
          <div className="apin-fuse-days">
            <span className="apin-fuse-daysnum">{remaining}</span>
            <span className="apin-fuse-dayslabel">days remaining</span>
          </div>
          <div className="apin-fuse-track">
            <div
              className="apin-fuse-bar"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={banDays}
              aria-valuenow={served}
              aria-label={`${served} of ${banDays} ban days served`}
            >
              <div className="apin-fuse-bar-fill" style={{ width: `${(served / banDays) * 100}%` }} />
            </div>
            <p className="apin-fuse-track-copy num">
              {served} of {banDays} days served · expires {expiryDate} in{' '}
              <strong>witnessed time</strong> — the clock runs on diversity-bound witness
              attestations, not this device&rsquo;s clock.
            </p>
          </div>
        </div>

        <div className="apin-fuse-section">
          <h4 className="apin-fuse-h">While the record is live</h4>
          <ul className="apin-fuse-blocks">
            <li>
              <Swords size={15} aria-hidden className="apin-block-icon" />
              <span>
                <strong>Rated play is refused.</strong> Write-lease grants must check the fuse
                record — no lease, no witnessed session.
              </span>
            </li>
            <li>
              <Radio size={15} aria-hidden className="apin-block-icon" />
              <span>
                <strong>No game witnessing.</strong> Witnessing for a fuse-banned root inside the
                window is witness misbehavior — honest nodes refuse.
              </span>
            </li>
            <li className="is-ok">
              <Check size={15} aria-hidden className="apin-block-icon" />
              <span>
                <strong>Everything unwitnessed still works.</strong> Password sign-in, local and
                offline play, and unrated link-play are untouched — the record covers the witnessed
                zone only.
              </span>
            </li>
          </ul>
        </div>

        <p className="apin-fuse-refill">
          <RefreshCw size={15} aria-hidden />
          <span>
            When the ban expires the counter stays at {fuse.fails} — it refills{' '}
            <strong>{fuse.refill} failures of headroom</strong>, and the next trip needs {fuse.refill}{' '}
            further failures. <strong>Lifetime means lifetime.</strong>
          </span>
        </p>
      </div>
    </section>
  )
}
