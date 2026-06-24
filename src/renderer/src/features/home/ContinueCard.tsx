import type { JSX } from 'react'
import { Cpu, History, Swords } from 'lucide-react'
import type { GameRow } from '../../../../shared/types'
import type { HomeNavTarget } from './HomeView'
import { formatRelativeDate, opponentLabelOf } from './format'

export interface ContinueCardProps {
  lastGame: GameRow | null
  onNavigate: (view: HomeNavTarget) => void
}

export default function ContinueCard({ lastGame, onNavigate }: ContinueCardProps): JSX.Element {
  const when = lastGame ? formatRelativeDate(lastGame.created_at) : ''
  const subtitle = lastGame ? [opponentLabelOf(lastGame), when].filter(Boolean).join(' · ') : ''

  return (
    <section className="card home-card continue-card">
      <h3 className="card-title">Continue</h3>
      {lastGame ? (
        <p className="continue-sub small muted">vs {subtitle}</p>
      ) : (
        <p className="continue-sub small muted">Start a new game or open the board.</p>
      )}
      <div className="continue-actions">
        <button className="btn continue-primary" onClick={() => onNavigate('analysis')}>
          <Cpu size={16} aria-hidden /> Resume analysis
        </button>
        {lastGame && (
          <div className="continue-secondary">
            <button className="btn ghost" onClick={() => onNavigate('analysis')}>
              <History size={14} aria-hidden /> Review last game
            </button>
            <button className="btn ghost" onClick={() => onNavigate('play')}>
              <Swords size={14} aria-hidden /> Play again
            </button>
          </div>
        )}
      </div>
    </section>
  )
}
