import type { JSX } from 'react'
import { Flame } from 'lucide-react'

export interface StreakBadgeProps {
  streak: number
  best: number
}

/** Compact current-streak / best-streak pill. */
export function StreakBadge({ streak, best }: StreakBadgeProps): JSX.Element {
  const active = streak > 0
  return (
    <div className="streak-badge" title={`Current streak ${streak}, best ${best}`}>
      <span className={`streak-flame${active ? ' is-active' : ''}`}>
        <Flame size={14} aria-hidden />
      </span>
      <span className="streak-main num">{streak}</span>
      <span className="streak-best muted num">Best {best}</span>
    </div>
  )
}
