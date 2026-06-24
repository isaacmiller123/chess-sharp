// Pure, React-free formatting helpers for the Home dashboard.
// Type-only import from shared is allowed (we never edit shared files).
import type {
  CurriculumBand,
  CurriculumLesson,
  GameRow
} from '../../../../shared/types'

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

export interface BandPick {
  band: CurriculumBand
  /** True when the rating sits below the lowest band's floor (still placed in it). */
  belowFloor: boolean
}

/**
 * Pick the curriculum band a given rating belongs to. Bands are sorted by
 * `order`; we choose the highest band whose `ratingFloor` the rating clears,
 * falling back to the first band when the rating is below every floor. Returns
 * null only for an empty tree. Tolerates unsorted input and NaN ratings.
 */
export function pickBand(bands: CurriculumBand[], rating: number): BandPick | null {
  if (!bands || bands.length === 0) return null
  const sorted = [...bands].sort((a, b) => a.order - b.order)
  const r = Number.isFinite(rating) ? rating : 0
  let chosen = sorted[0]
  let belowFloor = r < sorted[0].ratingFloor
  for (const band of sorted) {
    if (r >= band.ratingFloor) {
      chosen = band
      belowFloor = false
    }
  }
  return { band: chosen, belowFloor }
}

/**
 * Suggest the next lesson within a band for a given rating: the first lesson
 * (by unit order, then lesson position) whose rating range contains the rating,
 * else the first lesson whose range starts at or above the rating, else the
 * band's very first lesson. Returns null if the band has no lessons.
 */
export function suggestNextLesson(
  band: CurriculumBand,
  rating: number
): CurriculumLesson | null {
  const units = [...(band.units ?? [])].sort((a, b) => a.order - b.order)
  const lessons: CurriculumLesson[] = []
  for (const unit of units) lessons.push(...(unit.lessons ?? []))
  if (lessons.length === 0) return null
  const r = Number.isFinite(rating) ? rating : 0

  const inRange = lessons.find((l) => r >= l.ratingRange[0] && r <= l.ratingRange[1])
  if (inRange) return inRange

  const ahead = lessons.find((l) => l.ratingRange[0] >= r)
  if (ahead) return ahead

  return lessons[0]
}

/** Title-case a curriculum lesson kind for display ('endgame' -> 'Endgame'). */
export function lessonKindLabel(kind: string): string {
  if (!kind) return ''
  return kind.charAt(0).toUpperCase() + kind.slice(1)
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
