import { Clock as ClockIcon } from 'lucide-react'
import { formatClock, LOW_TIME_MS } from './timeControl'

export interface ClockProps {
  /** Remaining time for this side, in milliseconds. */
  ms: number
  /** Whether this side's clock is currently counting down. */
  active: boolean
  /** Whether the game has ended (freezes the urgency styling). */
  over: boolean
  /** Accessible label prefix, e.g. "White" / "Black" / a player name. */
  label: string
}

/**
 * A single side's countdown clock. Reads as mm:ss, switching to tenths under 10s.
 * The active side is highlighted; a low clock turns urgent. Purely presentational
 * — all timing lives in useChessClock.
 */
export function Clock({ ms, active, over, label }: ClockProps) {
  const low = ms < LOW_TIME_MS
  const flagged = ms <= 0
  const className = [
    'play-clock',
    active && !over ? 'is-active' : '',
    low && !over ? 'is-low' : '',
    flagged ? 'is-flagged' : ''
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <span
      className={className}
      role="timer"
      aria-label={`${label} clock`}
      aria-live={active && !over ? 'off' : 'polite'}
    >
      <ClockIcon className="play-clock-icon" size={14} aria-hidden />
      <span className="play-clock-time num">{formatClock(ms)}</span>
    </span>
  )
}
