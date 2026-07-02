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
 * A single side's countdown, rendered as a chess.com-style digit block docked
 * to the right edge of its player card. Reads mm:ss, switching to tenths under
 * 10s. The ticking side is highlighted; a low clock turns urgent and blinks.
 * Purely presentational — all timing lives in useChessClock.
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
      <span className="play-clock-time num">{formatClock(ms)}</span>
    </span>
  )
}
