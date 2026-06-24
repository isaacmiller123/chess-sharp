import type { JSX } from 'react'
import { ChevronRight } from 'lucide-react'
import type { GameRow } from '../../../../shared/types'
import type { HomeNavTarget } from './HomeView'
import { formatRelativeDate, opponentLabelOf, resultChipLabel, resultKind } from './format'

export interface RecentGamesCardProps {
  games: GameRow[]
  onNavigate: (view: HomeNavTarget) => void
}

export default function RecentGamesCard({ games, onNavigate }: RecentGamesCardProps): JSX.Element {
  const rows = games.slice(0, 5)

  return (
    <section className="card home-card recent-card">
      <div className="card-title-row">
        <h3 className="card-title">Recent games</h3>
        {rows.length > 0 && (
          <button className="link-btn" onClick={() => onNavigate('progress')}>
            View all <ChevronRight size={14} aria-hidden />
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="recent-empty">
          <p className="muted small">No games yet.</p>
          <button className="btn" onClick={() => onNavigate('play')}>
            Play your first game
          </button>
        </div>
      ) : (
        <ul className="game-list">
          {rows.map((g) => {
            const kind = resultKind(g)
            const when = formatRelativeDate(g.created_at)
            return (
              <li key={g.id}>
                <button
                  className="game-row"
                  onClick={() => onNavigate('analysis')}
                  aria-label={`Review game vs ${opponentLabelOf(g)}`}
                >
                  <span className={`result-chip ${kind}`}>{resultChipLabel(kind)}</span>
                  <span className="game-opp">{opponentLabelOf(g)}</span>
                  <span className="game-date small muted">{when || ''}</span>
                  <ChevronRight size={16} aria-hidden className="game-go" />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
