// Pure, React-free formatting helpers for the Home dashboard.
// Type-only import from shared is allowed (we never edit shared files).
import type { GameRow } from '../../../../shared/types'

/**
 * Compact relative date. Returns '' for null/invalid so callers can skip
 * rendering an empty separator. Falls back to a short locale date past 7d.
 */
export function formatRelativeDate(ts: number | null | undefined): string {
  if (ts == null || !Number.isFinite(ts)) return ''
  const now = Date.now()
  const diff = now - ts
  if (diff < 0) return 'just now'
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return 'just now'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d ago`
  try {
    return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}

export interface RatingBand {
  lo: number
  hi: number
  pm: number
}

/**
 * Confidence band around a Glicko-style rating: +/- 2*rd, floored at 0.
 * Guards against negative/NaN rd.
 */
export function ratingBand(rating: number, rd: number): RatingBand {
  const safeRd = Number.isFinite(rd) && rd > 0 ? rd : 0
  const pm = Math.round(2 * safeRd)
  const center = Number.isFinite(rating) ? Math.round(rating) : 0
  return { lo: Math.max(0, center - pm), hi: center + pm, pm }
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
 * Best available human label for the opponent: explicit label, else
 * "Bot {elo}", else the non-user side's name, else 'Opponent'.
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

/**
 * Humanize a puzzle theme key: 'mateIn2' -> 'Mate in 2',
 * 'hangingPiece' -> 'Hanging piece'. Simple camelCase split + capitalize.
 */
export function humanizeTheme(key: string): string {
  if (!key) return ''
  const spaced = key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([a-zA-Z])(\d)/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
  if (!spaced) return ''
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase()
}
