/**
 * Display formatting for the Data & network surfaces.
 *
 * Relative times take the evaluation instant EXPLICITLY (complete-3): a
 * surface rendering REAL chain data passes Date.now() at render, so a real
 * timestamp is never formatted against the frozen fixture clock; fixture-only
 * surfaces pass MOCK_NOW (mock/fixtures) so preview copy stays stable in
 * tests. No default — every caller states which clock it is on.
 */

/** Relative time vs `nowMs`; falls back to an absolute date for old events. */
export function relTime(ts: number, nowMs: number): string {
  const mins = Math.round((nowMs - ts) / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 15) return `${days}d ago`
  return new Date(ts).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

/** Grouped integer ("1,734") — fixed locale so fixture copy stays stable. */
export function fmtInt(n: number): string {
  return n.toLocaleString('en-US')
}
