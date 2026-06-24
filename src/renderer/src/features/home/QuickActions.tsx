import type { JSX } from 'react'
import { Swords, Puzzle, Cpu, GraduationCap, type LucideIcon } from 'lucide-react'
import type { HomeNavTarget } from './HomeView'

export interface QuickActionsProps {
  onNavigate: (view: HomeNavTarget) => void
}

const TILES: { key: HomeNavTarget; label: string; Icon: LucideIcon }[] = [
  { key: 'play', label: 'Play', Icon: Swords },
  { key: 'puzzles', label: 'Train', Icon: Puzzle },
  { key: 'analysis', label: 'Analyze', Icon: Cpu },
  { key: 'lessons', label: 'Learn', Icon: GraduationCap }
]

export default function QuickActions({ onNavigate }: QuickActionsProps): JSX.Element {
  return (
    <section className="card home-card quick-actions-card">
      <div className="quick-actions">
        {TILES.map(({ key, label, Icon }) => (
          <button key={key} className="quick-tile" onClick={() => onNavigate(key)}>
            <span className="quick-tile-icon">
              <Icon size={22} aria-hidden />
            </span>
            <span className="quick-tile-label">{label}</span>
          </button>
        ))}
      </div>
    </section>
  )
}
