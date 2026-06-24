import type { JSX } from 'react'
import type { GameRow } from '../../../../shared/types'
import Sparkline from './Sparkline'
import { resultKind, resultTrend } from './format'

export interface TrendCardProps {
  games: GameRow[]
}

/**
 * Recent results momentum. Counts win/draw/loss across the loaded window and
 * draws a cumulative sparkline (oldest -> newest). Graceful empty state.
 */
export default function TrendCard({ games }: TrendCardProps): JSX.Element {
  const points = resultTrend(games)

  let wins = 0
  let draws = 0
  let losses = 0
  for (const g of games) {
    const k = resultKind(g)
    if (k === 'win') wins += 1
    else if (k === 'draw') draws += 1
    else if (k === 'loss') losses += 1
  }
  const counted = wins + draws + losses

  return (
    <section className="card progress-card trend-card">
      <div className="card-title-row">
        <h3 className="card-title">Recent form</h3>
        {games.length > 0 && (
          <span className="small muted">last {games.length} games</span>
        )}
      </div>

      {points.length === 0 ? (
        <p className="muted small trend-empty">Play some games to see your form over time.</p>
      ) : (
        <>
          <div className="trend-spark">
            <Sparkline points={points} />
          </div>
          {counted > 0 && (
            <div className="trend-legend small">
              <span className="trend-tally win">{wins}W</span>
              <span className="trend-tally draw">{draws}D</span>
              <span className="trend-tally loss">{losses}L</span>
            </div>
          )}
        </>
      )}
    </section>
  )
}
