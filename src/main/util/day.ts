// Local-day helpers for School streaks + daily lesson.
//
// Both the School streak/daily-lesson AND the puzzle daily (src/main/db/daily.repo.ts,
// which mirrors these helpers) key on the user's LOCAL calendar day — "did I study
// today" / "today's puzzle" flip at the user's own midnight, Wordle-style, not UTC's.
// This module is the single source of truth for the local 'YYYY-MM-DD' key on the
// School side; School code must use it rather than re-deriving day boundaries.

/** 'YYYY-MM-DD' for a given epoch-ms in the user's LOCAL timezone. */
export function ymd(ms: number): string {
  const d = new Date(ms)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Today's LOCAL day key. */
export function localDay(): string {
  return ymd(Date.now())
}

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/

/** True for a well-formed 'YYYY-MM-DD' string. */
export function isYmd(s: string): boolean {
  return YMD_RE.test(s)
}

/** Validate + normalise a caller-supplied ymd; falls back to today() when absent
 *  or malformed. Use at trust boundaries (IPC) where a string is only guaranteed
 *  to be a string. */
export function normalizeLocalYmd(s?: string): string {
  return s && YMD_RE.test(s) ? s : localDay()
}

/** The LOCAL day immediately before `s` (both 'YYYY-MM-DD'). Parsed as local
 *  midnight so the walk-back respects the user's calendar (incl. DST shifts). */
export function prevYmd(s: string): string {
  const [y, m, d] = s.split('-').map((n) => parseInt(n, 10))
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() - 1)
  return ymd(dt.getTime())
}

/** Whole-day difference a - b (both 'YYYY-MM-DD'), in LOCAL calendar days.
 *  Positive when a is after b. Anchored at local noon to avoid DST edge slips. */
export function dayDiff(a: string, b: string): number {
  const toNoon = (s: string): number => {
    const [y, m, d] = s.split('-').map((n) => parseInt(n, 10))
    return new Date(y, m - 1, d, 12, 0, 0, 0).getTime()
  }
  return Math.round((toNoon(a) - toNoon(b)) / 86_400_000)
}
