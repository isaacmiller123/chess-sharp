import { useState, type JSX } from 'react'
import {
  CircleCheck,
  Infinity as InfinityIcon,
  ShieldAlert,
  Signature,
  Timer,
  X
} from 'lucide-react'
import { OverlayDialog } from '../../../components/OverlayDialog'
import { DEV_FIXTURE, MOCK_NOW, VERDICTS, fakeB64u, shortB64u } from '../mock/fixtures'
import { FixturePreviewBadge } from '../mock/FixturePreviewBadge'

/**
 * The compliant-client moment (§8 self-ban rule, A5-21): the deterministic
 * Tier-2 5σ CONVICTION has fired on the user's own chain, and the client must
 * append a signed self-ban before any further witnessed-lane event. Only the
 * conviction obliges a ban — the 3σ escalation obliges deeper analysis and
 * nothing else. There is deliberately no dismiss-forever option — the
 * conviction is a pure function of the chain that every compliant client can
 * see. DEV_FIXTURE preview flow: renders sample verdict data and says so.
 */

const DAY = 86_400_000
const BAN_DAYS = 90

export function SelfBanDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const [appended, setAppended] = useState(false)

  // Trigger data mirrors the convicted fixture so the numbers stay spec-honest.
  const trigger = VERDICTS.find((v) => v.verdict === 'convicted') ?? VERDICTS[0]
  const banEnds = new Date(MOCK_NOW + BAN_DAYS * DAY).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
  const recordId = shortB64u(fakeB64u('self-ban-preview'))

  return (
    <OverlayDialog
      onClose={onClose}
      placement="center"
      className="shell-modal afair-selfban-modal"
      labelledBy="afair-selfban-title"
    >
      <div className="shell-modal-head">
        <span className="afair-selfban-headicon" aria-hidden>
          <ShieldAlert size={18} />
        </span>
        <h2 id="afair-selfban-title">Tier-2 conviction on your chain</h2>
        {DEV_FIXTURE && <FixturePreviewBadge label="Preview — sample verdict data" />}
        <button type="button" className="shell-modal-close" aria-label="Close" onClick={onClose}>
          <X size={18} aria-hidden />
        </button>
      </div>

      <div className="shell-modal-body afair-selfban-body">
        {appended ? (
          <div className="afair-selfban-appended" role="status">
            <p className="afair-selfban-appended-title">
              <CircleCheck size={16} aria-hidden /> Self-ban appended and signed
            </p>
            <p className="afair-selfban-appended-copy">
              Record <span className="afair-mono">self-ban {recordId}</span> is now part of your
              chain — public, citing the trigger, and timely. Anyone who replays the chain can
              verify both.
            </p>
            <p className="afair-selfban-appended-copy">
              The witnessed zone reopens {banEnds}. Serving the sentence is the lenient path —
              suppression would have been permanent.
            </p>
          </div>
        ) : (
          <>
            <p className="afair-selfban-lead">
              The deterministic Tier-2 conviction (z past the 5σ line) has fired on your chain.
            </p>

            <div className="afair-selfban-facts" aria-label="Trigger data">
              <span className="afair-selfban-fact">
                window complete · games {trigger.window.fromGame}–{trigger.window.toGame} (
                {trigger.window.games})
              </span>
              <span className="afair-selfban-fact">
                z = {trigger.z.toFixed(2)} ≥ threshold {trigger.threshold.toFixed(2)}
              </span>
              <span className="afair-selfban-fact">
                {trigger.nodesPerMove.toLocaleString('en-US')} nodes/move · {trigger.judgeHash}
              </span>
            </div>

            <p className="afair-selfban-oblig">
              <Signature size={15} aria-hidden />
              A compliant client must append a signed self-ban before any further witnessed-lane
              event. This client is compliant.
            </p>

            <div className="afair-selfban-paths">
              <div className="afair-selfban-path">
                <span className="afair-selfban-path-icon" aria-hidden>
                  <Timer size={16} />
                </span>
                <span className="afair-selfban-path-body">
                  <strong>What happens now — the lenient path</strong>
                  <span>
                    A 90-day witnessed-zone ban, ending {banEnds}. Expiry runs on diversity-bound
                    witnessed time, so it cannot be waited out on a forged clock. Your name,
                    history, and chain survive; when the ban ends, you simply play again.
                  </span>
                </span>
              </div>
              <div className="afair-selfban-path is-warning">
                <span className="afair-selfban-path-icon" aria-hidden>
                  <InfinityIcon size={16} />
                </span>
                <span className="afair-selfban-path-body">
                  <strong>What suppression means</strong>
                  <span>
                    A 5σ conviction with no timely self-ban is permanent distrust — provable
                    by anyone who replays your chain, today or in ten years. There is no version
                    of events where the trigger fired and no one can tell.
                  </span>
                </span>
              </div>
            </div>

            <p className="afair-selfban-note">
              There is no dismiss option: the conviction is a pure function of your public chain,
              and every compliant client can already see it has fired. (A 3σ escalation alone
              never reaches this dialog — it obliges deeper analysis, not a ban.)
            </p>
          </>
        )}
      </div>

      <div className="shell-modal-foot">
        {appended ? (
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        ) : (
          <>
            <button type="button" className="btn ghost" onClick={onClose}>
              Review the evidence first
            </button>
            <button
              type="button"
              className="btn danger solid afair-selfban-append"
              onClick={() => setAppended(true)}
            >
              <Signature size={15} aria-hidden /> Append self-ban to my chain
            </button>
          </>
        )}
      </div>
    </OverlayDialog>
  )
}
