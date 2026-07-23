import { useEffect, useState, type JSX } from 'react'
import {
  Check,
  CircleCheck,
  EyeOff,
  Handshake,
  History,
  Link2,
  Loader2,
  ShieldCheck,
  Signature,
  UserRound
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

/**
 * §3 entanglement receipt — shown after a rated game (mock: Blitz vs
 * mira#T8FQ2, 84 plies, 1-0). A staged checklist ticks through what the
 * protocol just did: per-move signature chaining, opponent countersignature
 * (with witness-adjudicated results, so a loss can't be denied by going
 * silent), witness signature + witnessed timestamp, the segment landing in
 * BOTH chains, and checkpoint progress. Then the §6 rating line (honoring
 * hidden states) and the §6b commendation.
 */

const STAGES: { Icon: LucideIcon; title: string; sub: string }[] = [
  {
    Icon: Signature,
    title: 'Per-move signatures chained',
    sub: '84 plies, each signed by its mover over gameId · ply · move · clock · prevSig'
  },
  {
    Icon: UserRound,
    title: 'Opponent countersigned',
    sub: 'mira#T8FQ2’s replies countersign your moves — and the result is witness-adjudicated, so a loss can’t be denied by withholding the last signature'
  },
  {
    Icon: ShieldCheck,
    title: 'Witness signed',
    sub: 'sable#J6KT9 signed the interleaved stream and stamped the witnessed timestamp'
  },
  {
    Icon: Link2,
    title: 'Segment written into both chains',
    sub: 'Your height 1409 · theirs 1641 — neither player can drop it without breaking their own chain'
  }
]

const CKPT_DONE = 13
const CKPT_OF = 20
/** Checklist rows + the checkpoint meter = 5 mock stages. */
const STAGE_COUNT = STAGES.length + 1
const STAGE_STEP_MS = 460

export function PostGameReceipt(): JSX.Element {
  const [stage, setStage] = useState(0)
  const [sent, setSent] = useState(false)

  // Tick the checklist on mount, one stage at a time.
  useEffect(() => {
    const timers = Array.from({ length: STAGE_COUNT }, (_, i) =>
      window.setTimeout(() => setStage(i + 1), 400 + i * STAGE_STEP_MS)
    )
    return () => timers.forEach((t) => window.clearTimeout(t))
  }, [])

  const complete = stage >= STAGE_COUNT

  return (
    <section className="agc-receipt" aria-label="Entanglement receipt" aria-busy={!complete}>
      <header className="agc-receipt-head">
        <div className="agc-receipt-headmain">
          <span className="agc-receipt-eyebrow">
            <Link2 size={13} aria-hidden /> Entanglement receipt
          </span>
          <h3 className="agc-receipt-title">
            Rated Blitz vs <span className="agc-mono">mira#T8FQ2</span>
          </h3>
        </div>
        <span className="agc-receipt-meta num">84 plies</span>
        <span className="agc-receipt-result num">1-0</span>
      </header>

      <ol className="agc-stages">
        {STAGES.map(({ Icon, title, sub }, i) => {
          const state = stage > i ? 'is-done' : stage === i ? 'is-active' : 'is-pending'
          return (
            <li key={title} className={`agc-stage ${state}`}>
              <span className="agc-stage-icon" aria-hidden>
                {stage > i ? (
                  <CircleCheck size={17} />
                ) : stage === i ? (
                  <Loader2 size={17} className="agc-spin" />
                ) : (
                  <Icon size={17} />
                )}
              </span>
              <span className="agc-stage-copy">
                <span className="agc-stage-title">{title}</span>
                <span className="agc-stage-sub">{sub}</span>
              </span>
            </li>
          )
        })}

        {/* Final stage: checkpoint progress — informational, not a tick. */}
        <li
          className={`agc-stage ${
            complete ? 'is-done' : stage === STAGES.length ? 'is-active' : 'is-pending'
          }`}
        >
          <span className="agc-stage-icon" aria-hidden>
            {stage === STAGES.length ? (
              <Loader2 size={17} className="agc-spin" />
            ) : (
              <History size={17} />
            )}
          </span>
          <span className="agc-stage-copy">
            <span className="agc-stage-title">Checkpoint progress</span>
            <span className="agc-stage-sub">
              {CKPT_DONE} of {CKPT_OF} games to the next M-of-N cosigned checkpoint
            </span>
            <span className="agc-ckpt-meter">
              <span
                className="agc-ckpt-bar"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={CKPT_OF}
                aria-valuenow={CKPT_DONE}
                aria-label="Games toward the next checkpoint"
              >
                <span
                  className="agc-ckpt-fill"
                  style={{ width: complete ? `${(CKPT_DONE / CKPT_OF) * 100}%` : '0%' }}
                />
              </span>
              <span className="agc-ckpt-count num">
                {CKPT_DONE}/{CKPT_OF}
              </span>
            </span>
          </span>
        </li>
      </ol>

      {complete && (
        <div className="agc-receipt-foot">
          {/* §6 — rating delta, honoring hidden display states. */}
          <div className="agc-rating">
            <div className="agc-rating-row">
              <span className="agc-rating-label">Blitz · Ranked</span>
              <span className="agc-rating-value num">
                1478 → 1485
                <span className="agc-rating-delta num">+7</span>
              </span>
            </div>
            <div className="agc-rating-row">
              <span className="agc-rating-label">Provisional ladder (before reveal)</span>
              <span className="agc-rating-hidden">
                <EyeOff size={13} aria-hidden /> recorded in the fold — hidden until 100 games
              </span>
            </div>
          </div>

          {/* §6b — one commendation per opponent per game. */}
          {sent ? (
            <div className="agc-commend-sent" role="status">
              <Check size={15} aria-hidden /> Commendation sent to mira#T8FQ2 — a signed conduct
              event her reputation fold counts once.
            </div>
          ) : (
            <button type="button" className="agc-commend" onClick={() => setSent(true)}>
              <span className="agc-commend-icon" aria-hidden>
                <Handshake size={18} />
              </span>
              <span className="agc-commend-copy">
                <span className="agc-commend-title">Good game — send commendation</span>
                <span className="agc-commend-sub">
                  one per opponent per game, rate-limited by the entanglement
                </span>
              </span>
            </button>
          )}
        </div>
      )}
    </section>
  )
}
