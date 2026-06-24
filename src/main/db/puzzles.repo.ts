import { getPuzzlesDb } from './database'

export interface Puzzle {
  id: string
  fen: string
  moves: string[]
  rating: number
  popularity?: number
  themes: string[]
  gameUrl?: string
  openingTags: string[]
}

interface Row {
  PuzzleId: string
  FEN: string
  Moves: string
  Rating: number
  RatingDeviation: number | null
  Popularity: number | null
  NbPlays: number | null
  Themes: string | null
  GameUrl: string | null
  OpeningTags: string | null
}

function toPuzzle(r: Row): Puzzle {
  return {
    id: r.PuzzleId,
    fen: r.FEN,
    moves: r.Moves.split(' ').filter(Boolean),
    rating: r.Rating,
    popularity: r.Popularity ?? undefined,
    themes: (r.Themes ?? '').split(' ').filter(Boolean),
    gameUrl: r.GameUrl ?? undefined,
    openingTags: (r.OpeningTags ?? '').split(' ').filter(Boolean)
  }
}

export function getPuzzle(id: string): Puzzle | null {
  const r = getPuzzlesDb().prepare('SELECT * FROM puzzles WHERE PuzzleId=?').get(id) as Row | undefined
  return r ? toPuzzle(r) : null
}

export function listThemes(): { key: string; count: number }[] {
  return getPuzzlesDb()
    .prepare('SELECT Theme AS key, COUNT(*) AS count FROM puzzle_themes GROUP BY Theme ORDER BY count DESC')
    .all() as { key: string; count: number }[]
}

// Fast, indexed, randomized selection (no ORDER BY RANDOM): seek a small window
// near a random target rating and pick one, skipping recently-seen ids.
export function nextPuzzle(opts: {
  theme?: string
  ratingLo: number
  ratingHi: number
  exclude?: string[]
}): Puzzle | null {
  const db = getPuzzlesDb()
  const { theme, ratingLo, ratingHi } = opts
  const exclude = new Set(opts.exclude ?? [])
  const target = ratingLo + Math.floor(Math.random() * Math.max(1, ratingHi - ratingLo))

  const pickId = (ids: string[]): string | null => {
    const f = ids.filter((i) => !exclude.has(i))
    const pool = f.length ? f : ids
    return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null
  }

  if (theme) {
    let ids = (
      db
        .prepare('SELECT PuzzleId FROM puzzle_themes WHERE Theme=? AND Rating>=? AND Rating<=? ORDER BY Rating LIMIT 24')
        .all(theme, target, ratingHi) as { PuzzleId: string }[]
    ).map((r) => r.PuzzleId)
    if (ids.length === 0) {
      ids = (
        db
          .prepare('SELECT PuzzleId FROM puzzle_themes WHERE Theme=? AND Rating<=? AND Rating>=? ORDER BY Rating DESC LIMIT 24')
          .all(theme, target, ratingLo) as { PuzzleId: string }[]
      ).map((r) => r.PuzzleId)
    }
    const id = pickId(ids)
    return id ? getPuzzle(id) : null
  }

  let rows = db
    .prepare('SELECT * FROM puzzles WHERE Rating>=? AND Rating<=? ORDER BY Rating LIMIT 24')
    .all(target, ratingHi) as unknown as Row[]
  if (rows.length === 0) {
    rows = db
      .prepare('SELECT * FROM puzzles WHERE Rating<=? AND Rating>=? ORDER BY Rating DESC LIMIT 24')
      .all(target, ratingLo) as unknown as Row[]
  }
  const id = pickId(rows.map((r) => r.PuzzleId))
  const row = rows.find((r) => r.PuzzleId === id)
  return row ? toPuzzle(row) : null
}
