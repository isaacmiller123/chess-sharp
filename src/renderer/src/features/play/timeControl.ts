// Time-control model for Play. Pure data + tiny helpers — no React, no window.api.
//
// A TimeControl is either Unlimited (no clock) or a base/increment pair given in
// the familiar "base+inc" chess notation (minutes base, seconds increment).

import type { Color } from '../../chess/chess'

export interface TimeControl {
  /** Stable id used for the picker + persistence. */
  id: string
  /** Short label shown in the picker, e.g. "5+0". */
  label: string
  /** Initial time per side, in milliseconds. 0 means Unlimited (no clock). */
  baseMs: number
  /** Increment added after each move, in milliseconds. */
  incMs: number
}

const MIN = 60_000
const SEC = 1_000

// Curated presets (matches the unit spec). Unlimited stays the default so the
// no-clock experience is unchanged unless the user opts in.
export const TIME_CONTROLS: TimeControl[] = [
  { id: 'unlimited', label: 'Unlimited', baseMs: 0, incMs: 0 },
  { id: '1+0', label: '1+0', baseMs: 1 * MIN, incMs: 0 },
  { id: '3+2', label: '3+2', baseMs: 3 * MIN, incMs: 2 * SEC },
  { id: '5+0', label: '5+0', baseMs: 5 * MIN, incMs: 0 },
  { id: '10+0', label: '10+0', baseMs: 10 * MIN, incMs: 0 },
  { id: '15+10', label: '15+10', baseMs: 15 * MIN, incMs: 10 * SEC }
]

export const DEFAULT_TIME_CONTROL_ID = 'unlimited'

export function timeControlById(id: string): TimeControl {
  return TIME_CONTROLS.find((t) => t.id === id) ?? TIME_CONTROLS[0]
}

/** Whether this control runs a clock at all. */
export function isTimed(tc: TimeControl): boolean {
  return tc.baseMs > 0
}

/** Threshold (ms) under which a side is considered "low on time". */
export const LOW_TIME_MS = 10_000

/**
 * Format remaining milliseconds for display.
 *   >= 10s  -> "mm:ss"
 *   <  10s  -> "s.t" (seconds with one tenth) for the urgency read.
 * Always clamps at zero; never shows a negative clock.
 */
export function formatClock(ms: number): string {
  const clamped = Math.max(0, ms)
  if (clamped >= LOW_TIME_MS) {
    const totalSec = Math.ceil(clamped / 1000)
    const m = Math.floor(totalSec / 60)
    const s = totalSec % 60
    return `${m}:${String(s).padStart(2, '0')}`
  }
  // Under 10s: show tenths, e.g. "9.4". Floor the tenth so it never reads higher
  // than the real remaining time.
  const tenths = Math.floor(clamped / 100)
  const whole = Math.floor(tenths / 10)
  const frac = tenths % 10
  return `${whole}.${frac}`
}

/** Per-side remaining time. */
export type ClockTimes = Record<Color, number>
