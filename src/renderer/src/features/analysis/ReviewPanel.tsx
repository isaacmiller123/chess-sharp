import { Sparkles } from 'lucide-react'
import type { EloBand, GameReview, ReviewSideSummary } from '@shared/types'
import { EvalGraph } from '../../panels/EvalGraph'

export interface ReviewPanelProps {
  review: GameReview | null
  running: boolean
  /** 0..1 progress while a review is in flight. */
  progress: number
  /** Disabled when there are no mainline moves to review. */
  canReview: boolean
  error: string | null
  currentPly: number
  onRun: () => void
  onSeek: (ply: number) => void
}

export function ReviewPanel({
  review,
  running,
  progress,
  canReview,
  error,
  currentPly,
  onRun,
  onSeek
}: ReviewPanelProps) {
  return (
    <div className="panel review-panel">
      <div className="panel-head">
        <span className="panel-title">Game review</span>
        {review && <span className="muted small num">depth {review.depth}</span>}
      </div>

      <div className="review-body">
        {!review && !running && (
          <>
            <p className="muted small review-intro">
              Analyze every move with the engine — accuracy, classifications, and an estimated
              playing strength for the game.
            </p>
            <button className="btn review-run" onClick={onRun} disabled={!canReview}>
              <Sparkles size={15} /> Review game
            </button>
            {!canReview && <p className="muted small">Play through some moves first.</p>}
            {error && <p className="review-error small">{error}</p>}
          </>
        )}

        {running && (
          <div className="review-progress">
            <div className="review-progress-head small">
              <span>Analyzing…</span>
              <span className="num">{Math.round(progress * 100)}%</span>
            </div>
            <div className="review-bar">
              <span className="review-bar-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
          </div>
        )}

        {review && !running && (
          <>
            <div className="review-grid">
              <SideStat label="White" side={review.white} />
              <SideStat label="Black" side={review.black} />
            </div>

            <div className="review-elo">
              <EloReadout label="White" band={review.whiteElo} />
              <EloReadout label="Black" band={review.blackElo} />
              <p className="review-elo-note muted small">
                Performance estimate for this game — separate from your Glicko rating.
              </p>
            </div>

            <div className="review-graph-wrap">
              <EvalGraph moveEvals={review.moveEvals} currentPly={currentPly} onSeek={onSeek} />
            </div>

            <button className="btn ghost review-rerun" onClick={onRun} disabled={!canReview}>
              Re-run review
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function SideStat({ label, side }: { label: string; side: ReviewSideSummary }) {
  return (
    <div className="review-side">
      <div className="review-side-head small muted">{label}</div>
      <div className="review-accuracy num">{side.accuracy.toFixed(1)}%</div>
      <div className="review-accuracy-cap small muted">accuracy</div>
      <div className="review-acpl small">
        <span className="muted">ACPL</span> <span className="num">{side.acpl}</span>
      </div>
      <div className="review-counts small muted num">
        <span className="tone-inaccuracy" title="Inaccuracies">{side.inaccuracies} ?!</span>
        <span className="tone-mistake" title="Mistakes">{side.mistakes} ?</span>
        <span className="tone-blunder" title="Blunders">{side.blunders} ??</span>
      </div>
    </div>
  )
}

function EloReadout({ label, band }: { label: string; band: EloBand }) {
  return (
    <div className="elo-readout">
      <span className="elo-label small muted">{label} est. Elo</span>
      <span className="elo-value num">{Math.round(band.est)}</span>
      <span className="elo-range small muted num">
        {Math.round(band.low)}–{Math.round(band.high)}
      </span>
    </div>
  )
}
