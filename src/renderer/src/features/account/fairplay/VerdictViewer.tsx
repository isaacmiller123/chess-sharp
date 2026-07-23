import { useState, type JSX } from 'react'
import { ChevronDown, Eye, ShieldAlert, ShieldCheck, Signature } from 'lucide-react'
import { DEV_FIXTURE, MOCK_NOW, VERDICTS } from '../mock/fixtures'
import { FixturePreviewBadge } from '../mock/FixturePreviewBadge'
import type { UiVerdict } from '../mock/types'
import { JudgeReceipts } from './JudgeReceipts'

/**
 * Tier-2 verdict records (§8): signed, published under the accused's key,
 * reproducible by anyone. Collapsed rows show the verdict + z-score against
 * the conviction threshold; expanded rows show the full evidence grid and the
 * embedded receipts re-run.
 */

const DAY = 86_400_000
const HOUR = 3_600_000

/** z-scores render on a fixed 0..8 scale so rows are visually comparable. */
const Z_SCALE_MAX = 8

/** Relative to MOCK_NOW (never Date.now()) so the preview stays stable. */
function relTime(ts: number): string {
  const delta = Math.max(0, MOCK_NOW - ts)
  if (delta < HOUR) return 'just now'
  if (delta < DAY) {
    const h = Math.round(delta / HOUR)
    return `${h} hour${h === 1 ? '' : 's'} ago`
  }
  const d = Math.round(delta / DAY)
  return `${d} day${d === 1 ? '' : 's'} ago`
}

function ZBar({ v }: { v: UiVerdict }): JSX.Element {
  const fillPct = Math.min(v.z / Z_SCALE_MAX, 1) * 100
  const threshPct = Math.min(v.threshold / Z_SCALE_MAX, 1) * 100
  return (
    <span
      className="afair-zbar"
      title={`z = ${v.z.toFixed(2)} against a conviction threshold of ${v.threshold.toFixed(1)}`}
    >
      <span className="afair-zbar-track" aria-hidden>
        <span
          className={`afair-zbar-fill${v.z >= v.threshold ? ' is-over' : ''}`}
          style={{ width: `${fillPct}%` }}
        />
        <span className="afair-zbar-thresh" style={{ left: `${threshPct}%` }} />
      </span>
      <span className="afair-zbar-num">z {v.z.toFixed(2)}</span>
    </span>
  )
}

export function VerdictViewer(): JSX.Element {
  // The convicted record opens by default — the evidence grid is the point.
  const [openId, setOpenId] = useState<string | null>(VERDICTS[0]?.id ?? null)

  return (
    <section className="panel afair-verdicts" aria-label="Tier-2 verdict records">
      <header className="panel-head">
        <span className="afair-verdicts-headicon" aria-hidden>
          <Signature size={15} />
        </span>
        <span className="panel-title">Tier-2 verdict records</span>
        {DEV_FIXTURE && <FixturePreviewBadge />}
        <span className="muted small">signed — anyone can recompute the same bits</span>
      </header>

      <ul className="afair-vlist">
        {VERDICTS.map((v) => {
          const open = openId === v.id
          const convicted = v.verdict === 'convicted'
          return (
            <li key={v.id} className="afair-vrow">
              <button
                type="button"
                className="afair-vrow-head"
                aria-expanded={open}
                aria-controls={`afair-vbody-${v.id}`}
                onClick={() => setOpenId(open ? null : v.id)}
              >
                <span className={`afair-chip ${convicted ? 'is-convicted' : 'is-clean'}`}>
                  {convicted ? (
                    <ShieldAlert size={12} aria-hidden />
                  ) : (
                    <ShieldCheck size={12} aria-hidden />
                  )}
                  {convicted ? 'Convicted' : 'Clean'}
                </span>
                <span className="afair-vrow-id">
                  <span className="afair-vrow-handle">{v.accused}</span>
                  <span className="afair-vrow-window num">
                    games {v.window.fromGame}–{v.window.toGame} ({v.window.games})
                  </span>
                </span>
                <ZBar v={v} />
                <span className="afair-vrow-meta">
                  computed by {v.computedBy} · {relTime(v.ts)}
                </span>
                <ChevronDown
                  size={15}
                  aria-hidden
                  className={`afair-vrow-chev${open ? ' is-open' : ''}`}
                />
              </button>

              {open && (
                <div id={`afair-vbody-${v.id}`} className="afair-vbody">
                  <dl className="afair-evidence">
                    <div className="afair-evidence-item">
                      <dt>Engine match</dt>
                      <dd>
                        <b className="num">{v.engineMatchPct.toFixed(1)}%</b> against a MultiPV
                        score-equivalence window — never exact-move matching
                      </dd>
                    </div>
                    <div className="afair-evidence-item">
                      <dt>Accuracy vs strength</dt>
                      <dd>{v.acplVsStrength}</dd>
                    </div>
                    <div className="afair-evidence-item">
                      <dt>Judge</dt>
                      <dd className="afair-mono">{v.judgeHash}</dd>
                    </div>
                    <div className="afair-evidence-item">
                      <dt>Search</dt>
                      <dd className="num">
                        {v.nodesPerMove.toLocaleString('en-US')} nodes/move · single-thread
                      </dd>
                    </div>
                    <div className="afair-evidence-item is-wide">
                      <dt>Aggregation</dt>
                      <dd>
                        Regan-style accumulated evidence over the {v.window.games}-game window;
                        thresholds set for astronomically-low false positives. No single game
                        convicts.
                      </dd>
                    </div>
                    <div className="afair-evidence-item is-wide">
                      <dt>The record</dt>
                      <dd>
                        Signed by {v.computedBy} and published under {v.accused}&rsquo;s key —
                        anyone can re-run the judge on the countersigned transcripts and
                        recompute the same bits.
                      </dd>
                    </div>
                  </dl>

                  {!convicted && (
                    <p className="afair-spotnote">
                      <Eye size={14} aria-hidden />
                      Spot-checks of honest accounts are routine — they cost nothing but compute,
                      and this is what one looks like.
                    </p>
                  )}

                  <JudgeReceipts verdict={v} />
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
