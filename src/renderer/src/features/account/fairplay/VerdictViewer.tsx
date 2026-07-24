import { useState, type JSX } from 'react'
import { ChevronDown, Eye, FileSearch, ShieldAlert, ShieldCheck, Signature } from 'lucide-react'
import { PARAMS_A5 } from '@shared/accounts/judge/params'
import type { UiVerdict } from '../mock/types'
import { JudgeReceipts } from './JudgeReceipts'

/**
 * Tier-2 verdict records (§8): signed, published under the accused's key,
 * reproducible by anyone. Collapsed rows show the verdict + z-score against
 * the conviction threshold; expanded rows show the full evidence grid and the
 * embedded receipts.
 *
 * WIRED (A6 M5, lane L-ui): the FAKE-hash fixture is gone. Records come from the
 * live judge runner (M5 L-t1/L-t2 — publishVerdictRow / adoptVerdictRowJudge
 * over the overlay); the pinned judge identity in every row is the REAL
 * PARAMS_A5 hash, not an authored string. Until that runner is wired the list
 * is HONESTLY EMPTY — never a fabricated conviction. The `verdicts` prop is the
 * seam the runner plugs into (defaults to the honest-empty state today).
 */

const DAY = 86_400_000
const HOUR = 3_600_000

/** z-scores render on a fixed 0..8 scale so rows are visually comparable. */
const Z_SCALE_MAX = 8

const JUDGE_BINARY = 'stockfish-18-lite-single'

/** Renderer-layer wall clock (Date.now() is allowed here, unlike the pure lib). */
function relTime(ts: number, now: number): string {
  const delta = Math.max(0, now - ts)
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

export function VerdictViewer({ verdicts = [] }: { verdicts?: UiVerdict[] }): JSX.Element {
  // The first record opens by default — the evidence grid is the point.
  const [openId, setOpenId] = useState<string | null>(verdicts[0]?.id ?? null)
  const now = Date.now()

  return (
    <section className="panel afair-verdicts" aria-label="Tier-2 verdict records">
      <header className="panel-head">
        <span className="afair-verdicts-headicon" aria-hidden>
          <Signature size={15} />
        </span>
        <span className="panel-title">Tier-2 verdict records</span>
        <span className="muted small">signed — anyone can recompute the same bits</span>
      </header>

      {verdicts.length === 0 ? (
        <div className="afair-spotnote" style={{ margin: 'var(--space-5)' }} role="status">
          <FileSearch size={14} aria-hidden />
          <span>
            No Tier-2 verdict records for this account yet. A record appears here when a deep
            analysis is published to the overlay under the accused&rsquo;s key — signed, and
            reproducible by anyone from the countersigned transcripts on the pinned judge. Live
            verdicts arrive with the judge runner.
          </span>
        </div>
      ) : (
        <ul className="afair-vlist">
          {verdicts.map((v) => {
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
                    computed by {v.computedBy} · {relTime(v.ts, now)}
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
                        <dd className="afair-mono">
                          {JUDGE_BINARY} · sha256:{PARAMS_A5.judgeWasmSha256}
                        </dd>
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
      )}
    </section>
  )
}
