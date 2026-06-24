import { useEffect, useState } from 'react'
import type { CoachExplainMoveResult, ReviewMoveEval } from '@shared/types'
import { displaySan } from '../chess/notation'
import { badgeTone } from './moveBadges'

export interface CoachPanelProps {
  /** Review eval for the move that LED to the current board position (null at root). */
  moveEval: ReviewMoveEval | null
  figurineMode: boolean
}

interface CoachState {
  loading: boolean
  result: CoachExplainMoveResult | null
}

export function CoachPanel({ moveEval, figurineMode }: CoachPanelProps) {
  const [state, setState] = useState<CoachState>({ loading: false, result: null })

  useEffect(() => {
    if (!moveEval) {
      setState({ loading: false, result: null })
      return
    }
    const coach = window.api?.coach
    if (!coach) {
      setState({ loading: false, result: null })
      return
    }
    let cancelled = false
    setState({ loading: true, result: null })
    coach
      .explainMove({
        fenBefore: moveEval.fenBefore,
        played: moveEval.uci,
        best: moveEval.bestUci,
        pv: moveEval.bestPv,
        evalBefore: { cp: moveEval.bestEval.cp, mate: moveEval.bestEval.mate },
        evalAfter: { cp: moveEval.playedEval.cp, mate: moveEval.playedEval.mate },
        ply: moveEval.ply
      })
      .then((result) => {
        if (!cancelled) setState({ loading: false, result })
      })
      .catch(() => {
        if (!cancelled) setState({ loading: false, result: null })
      })
    return () => {
      cancelled = true
    }
  }, [moveEval])

  return (
    <div className="panel coach-panel">
      <div className="panel-head">
        <span className="panel-title">Coach</span>
        {moveEval && (
          <span className={`coach-badge tone-${badgeTone(moveEval.badge)}`}>{moveEval.badge}</span>
        )}
      </div>
      <div className="coach-body">
        {!moveEval && (
          <p className="muted small">
            Step to a reviewed move to see why it works — or where it goes wrong.
          </p>
        )}

        {moveEval && (
          <>
            <div className="coach-move">
              <span className="coach-move-san num">{displaySan(moveEval.san, figurineMode)}</span>
              {!moveEval.isBest && (
                <span className="coach-best muted small">
                  best was <span className="num">{displaySan(moveEval.bestSan, figurineMode)}</span>
                </span>
              )}
            </div>

            {state.loading && <p className="muted small">Thinking…</p>}

            {!state.loading && state.result && (
              <>
                <p className="coach-text">{state.result.text}</p>
                {state.result.motifs.length > 0 && (
                  <div className="coach-motifs">
                    {state.result.motifs.map((m) => (
                      <span key={m} className="coach-motif">
                        {m}
                      </span>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Fallback when the coach service is unavailable: review data still
                gives a useful verdict + accuracy readout. */}
            {!state.loading && !state.result && (
              <p className="coach-text">
                {verdictSentence(moveEval)} Accuracy {moveEval.accuracy.toFixed(0)}%.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function verdictSentence(m: ReviewMoveEval): string {
  switch (m.verdict) {
    case 'blunder':
      return 'A blunder — this loses significant winning chances.'
    case 'mistake':
      return 'A mistake that hands the opponent the initiative.'
    case 'inaccuracy':
      return 'An inaccuracy; there was a clearly better continuation.'
    default:
      return m.isBest ? 'The engine agrees — a top move.' : 'A solid, sound choice.'
  }
}
