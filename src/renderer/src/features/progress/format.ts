// Pure, React-free formatting helpers for the Progress view.
// Type-only import from shared is allowed (we never edit shared files).
import type { GameRow } from '../../../../shared/types'

/**
 * Confidence band around a Glicko-style rating: +/- 2*rd, floored at 0.
 * Guards against negative/NaN rd. `pm` is the half-width (the "±" amount).
 */
export interface RatingBand {
  center: number
  lo: number
  hi: number
  pm: number
}

export function ratingBand(rating: number, rd: number): RatingBand {
  const safeRd = Number.isFinite(rd) && rd > 0 ? rd : 0
  const pm = Math.round(2 * safeRd)
  const center = Number.isFinite(rating) ? Math.round(rating) : 0
  return { center, lo: Math.max(0, center - pm), hi: center + pm, pm }
}

/**
 * Compact, absolute date for table rows. Empty string for null/invalid so the
 * caller can render a neutral placeholder. Recent items get a relative hint.
 */
export function formatGameDate(ts: number | null | undefined): string {
  if (ts == null || !Number.isFinite(ts)) return ''
  const now = Date.now()
  const diff = now - ts
  if (diff >= 0) {
    const min = Math.floor(diff / 60000)
    if (min < 1) return 'just now'
    if (min < 60) return `${min}m ago`
    const hr = Math.floor(min / 60)
    if (hr < 24) return `${hr}h ago`
    const day = Math.floor(hr / 24)
    if (day < 7) return `${day}d ago`
  }
  try {
    const d = new Date(ts)
    const sameYear = d.getFullYear() === new Date().getFullYear()
    return d.toLocaleDateString(
      undefined,
      sameYear
        ? { month: 'short', day: 'numeric' }
        : { year: 'numeric', month: 'short', day: 'numeric' }
    )
  } catch {
    return ''
  }
}

export type GameResultKind = 'win' | 'loss' | 'draw' | 'unknown'

/**
 * Map a stored game result ('1-0' | '0-1' | '1/2-1/2') against the user's color
 * into win/loss/draw. Anything unexpected -> 'unknown' (neutral chip, no crash).
 */
export function resultKind(game: Pick<GameRow, 'result' | 'user_color'>): GameResultKind {
  const r = game.result
  if (r === '1/2-1/2') return 'draw'
  const color = game.user_color
  if ((r === '1-0' || r === '0-1') && (color === 'white' || color === 'black')) {
    const userWon = (r === '1-0' && color === 'white') || (r === '0-1' && color === 'black')
    return userWon ? 'win' : 'loss'
  }
  return 'unknown'
}

/** Short label for a result chip. */
export function resultChipLabel(kind: GameResultKind): string {
  switch (kind) {
    case 'win':
      return 'Win'
    case 'loss':
      return 'Loss'
    case 'draw':
      return 'Draw'
    default:
      return '—'
  }
}

/**
 * Best available human label for the opponent: explicit label, else "Bot {elo}",
 * else the non-user side's name, else 'Opponent'.
 */
export function opponentLabelOf(game: GameRow): string {
  if (game.opponent_label && game.opponent_label.trim()) return game.opponent_label.trim()
  if (game.opponent_elo != null && Number.isFinite(game.opponent_elo)) {
    return `Bot ${Math.round(game.opponent_elo)}`
  }
  const userColor = game.user_color
  const other = userColor === 'white' ? game.black_name : userColor === 'black' ? game.white_name : null
  if (other && other.trim()) return other.trim()
  return 'Opponent'
}

/** Opponent Elo as a string, or '' when unknown. */
export function opponentEloOf(game: GameRow): string {
  if (game.opponent_elo != null && Number.isFinite(game.opponent_elo)) {
    return String(Math.round(game.opponent_elo))
  }
  return ''
}

export type UserColor = 'white' | 'black' | null

/** Normalize the user's color for display ('White' | 'Black' | '—'). */
export function userColorOf(game: GameRow): UserColor {
  return game.user_color === 'white' || game.user_color === 'black' ? game.user_color : null
}

export function userColorLabel(color: UserColor): string {
  if (color === 'white') return 'White'
  if (color === 'black') return 'Black'
  return '—'
}

/**
 * The user's own accuracy for a game, picking the side that matches their color.
 * Returns null when the side is unknown or the value is missing/invalid.
 */
export function userAccuracyOf(game: GameRow): number | null {
  const color = userColorOf(game)
  const raw =
    color === 'white' ? game.accuracy_white : color === 'black' ? game.accuracy_black : null
  if (raw == null || !Number.isFinite(raw)) return null
  return raw
}

/** Format an accuracy percentage compactly (one decimal, no trailing zero). */
export function formatAccuracy(acc: number | null): string {
  if (acc == null || !Number.isFinite(acc)) return ''
  const rounded = Math.round(acc * 10) / 10
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(1)}%`
}

/** Solve percentage from solved/tried, floored at 0, null when nothing tried. */
export function solvePercent(solved: number, tried: number): number | null {
  if (!Number.isFinite(tried) || tried <= 0) return null
  const s = Number.isFinite(solved) && solved > 0 ? solved : 0
  return Math.round((s / tried) * 100)
}

/** Compact integer formatting with grouping (e.g. 1,204). */
export function formatCount(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '0'
  try {
    return Math.round(n).toLocaleString()
  } catch {
    return String(Math.round(n))
  }
}

/**
 * A single point on the results trend. `value` is a running score where
 * win = +1, draw = 0, loss = -1, accumulated oldest -> newest. Used by the
 * sparkline to draw a momentum line without any external state.
 */
export interface TrendPoint {
  value: number
  kind: GameResultKind
}

/**
 * Derive a cumulative win/loss momentum series from a games list. `games` is
 * expected newest-first (as games.list returns); we reverse to oldest-first so
 * the line reads left-to-right through time.
 */
export function resultTrend(games: GameRow[]): TrendPoint[] {
  const ordered = [...games].reverse()
  let running = 0
  const out: TrendPoint[] = []
  for (const g of ordered) {
    const kind = resultKind(g)
    if (kind === 'win') running += 1
    else if (kind === 'loss') running -= 1
    out.push({ value: running, kind })
  }
  return out
}
