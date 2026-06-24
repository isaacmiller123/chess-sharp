import type { GameResult } from '../../chess/chess'

export interface ResultBannerProps {
  result: GameResult
  reason: string
  outcomeForUser: 'win' | 'loss' | 'draw'
  /** vs-bot rating change (signed). */
  delta?: number
  newRating?: number
  onNewGame: () => void
}

const TITLE: Record<ResultBannerProps['outcomeForUser'], string> = {
  win: 'You won',
  loss: 'You lost',
  draw: 'Draw'
}

function formatDelta(delta: number): string {
  const rounded = Math.round(delta)
  return rounded > 0 ? `+${rounded}` : `${rounded}`
}

export function ResultBanner({ result, reason, outcomeForUser, delta, newRating, onNewGame }: ResultBannerProps) {
  return (
    <div className="result-banner card">
      <div className="banner-text">
        <span className="banner-title">{TITLE[outcomeForUser]}</span>
        <span className="banner-reason muted small">
          {result} &middot; by {reason}
        </span>
      </div>
      {delta !== undefined && (
        <div className="banner-delta">
          <span className={`eval-chip ${delta >= 0 ? 'pos' : 'neg'}`}>{formatDelta(delta)}</span>
          <span className="muted small">
            vs-bot rating{newRating !== undefined ? ` ${Math.round(newRating)}` : ''}
          </span>
        </div>
      )}
      <button className="btn banner-new" onClick={onNewGame}>
        New game
      </button>
    </div>
  )
}
