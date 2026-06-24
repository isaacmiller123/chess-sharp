import type { JSX } from 'react'

export interface RatingPanelProps {
  rating: number
  rd: number
  delta: number | null
  ratingAfter: number | null
  /** Increment per attempt so the delta animation replays on each resolve. */
  animateKey: number
}

/** Current puzzle rating with an RD band and an animated rating delta chip. */
export function RatingPanel({ rating, rd, delta, ratingAfter, animateKey }: RatingPanelProps): JSX.Element {
  const shown = ratingAfter ?? rating
  return (
    <div className="panel pad rating-panel">
      <div className="rating-label">Puzzle rating</div>
      <div className="rating-row">
        <span className="rating-num num">{Math.round(shown)}</span>
        {delta != null && (
          <span
            key={animateKey}
            className={`eval-chip delta-chip ${delta >= 0 ? 'pos' : 'neg'}`}
          >
            {delta >= 0 ? `+${Math.round(delta)}` : Math.round(delta)}
          </span>
        )}
      </div>
      <div className="rating-band num">&plusmn; {Math.round(rd)}</div>
    </div>
  )
}
