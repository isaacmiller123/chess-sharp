import type { JSX } from 'react'
import {
  CircleCheck,
  Infinity as InfinityIcon,
  ShieldAlert,
  Signature,
  Timer,
  X
} from 'lucide-react'
import { OverlayDialog } from '../../../components/OverlayDialog'
import { PARAMS_A5 } from '@shared/accounts/judge/params'

/**
 * The compliant-client self-ban record (§8 self-ban rule, A5-21): a
 * deterministic Tier-2 5σ conviction fired on THIS account's chain, so a signed
 * self-ban was appended before any further witnessed-lane event. Only the
 * conviction obliges a ban — the 3σ escalation obliges deeper analysis and
 * nothing else.
 *
 * WIRED (A6 M5, lane L-ui): the old fixture preview (a fabricated convicted
 * verdict + a mock "append" toggle) is gone. This dialog renders ONLY when the
 * real chain fold reports an active self-ban standing (FairPlayTab gates it),
 * so `record` and `expiresWts` are real signed facts from the chain — never
 * authored. Appending the self-ban is the judge runner's job (M5 L-t2); this
 * surface displays the standing, it does not mutate the chain.
 */

const JUDGE_BINARY = 'stockfish-18-lite-single'

/** First 10 chars of a b64u record id + ellipsis, for display. */
function shortId(v: string): string {
  return v.length > 10 ? `${v.slice(0, 10)}…` : v
}

export function SelfBanDialog({
  onClose,
  record,
  expiresWts
}: {
  onClose: () => void
  record: string
  expiresWts: number
}): JSX.Element {
  const banEnds = new Date(expiresWts).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })

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
        <button type="button" className="shell-modal-close" aria-label="Close" onClick={onClose}>
          <X size={18} aria-hidden />
        </button>
      </div>

      <div className="shell-modal-body afair-selfban-body">
        <div className="afair-selfban-appended" role="status">
          <p className="afair-selfban-appended-title">
            <CircleCheck size={16} aria-hidden /> Self-ban recorded and signed
          </p>
          <p className="afair-selfban-appended-copy">
            Record <span className="afair-mono">self-ban {shortId(record)}</span> is part of your
            chain — public, citing the trigger, and timely. Anyone who replays the chain can verify
            both the conviction and the ban.
          </p>
          <p className="afair-selfban-appended-copy">
            The witnessed zone reopens {banEnds}. Serving the sentence is the lenient path —
            suppression would have been permanent.
          </p>
        </div>

        <div className="afair-selfban-facts" aria-label="Ban terms">
          <span className="afair-selfban-fact">
            {PARAMS_A5.selfBanDays}-day witnessed-zone ban
          </span>
          <span className="afair-selfban-fact">reopens {banEnds}</span>
          <span className="afair-selfban-fact">judge {JUDGE_BINARY}</span>
        </div>

        <p className="afair-selfban-oblig">
          <Signature size={15} aria-hidden />
          A compliant client appends a signed self-ban before any further witnessed-lane event.
          This client is compliant.
        </p>

        <div className="afair-selfban-paths">
          <div className="afair-selfban-path">
            <span className="afair-selfban-path-icon" aria-hidden>
              <Timer size={16} />
            </span>
            <span className="afair-selfban-path-body">
              <strong>What this ban is — the lenient path</strong>
              <span>
                A 90-day witnessed-zone ban, ending {banEnds}. Expiry runs on diversity-bound
                witnessed time, so it cannot be waited out on a forged clock. Your name, history,
                and chain survive; when the ban ends, you simply play again.
              </span>
            </span>
          </div>
          <div className="afair-selfban-path is-warning">
            <span className="afair-selfban-path-icon" aria-hidden>
              <InfinityIcon size={16} />
            </span>
            <span className="afair-selfban-path-body">
              <strong>What suppression would have meant</strong>
              <span>
                A 5σ conviction with no timely self-ban is permanent distrust — provable by anyone
                who replays your chain, today or in ten years. There is no version of events where
                the trigger fired and no one can tell.
              </span>
            </span>
          </div>
        </div>

        <p className="afair-selfban-note">
          There is no dismiss option: the conviction is a pure function of your public chain, and
          every compliant client can already see it has fired. (A 3σ escalation alone never reaches
          this state — it obliges deeper analysis, not a ban.)
        </p>
      </div>

      <div className="shell-modal-foot">
        <button type="button" className="btn" onClick={onClose}>
          Close
        </button>
      </div>
    </OverlayDialog>
  )
}
