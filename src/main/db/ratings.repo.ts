import { getAppDb } from './database'
import { glicko2Update, type Glicko } from '../rating/glicko2'

export type RatingKind = 'puzzle' | 'vs-bot'

export function getRating(kind: RatingKind): Glicko {
  const r = getAppDb().prepare('SELECT rating,rd,vol FROM rating WHERE kind=?').get(kind) as Glicko | undefined
  return r ?? { rating: 1200, rd: 350, vol: 0.06 }
}

function setRating(kind: RatingKind, g: Glicko): void {
  getAppDb()
    .prepare('UPDATE rating SET rating=?,rd=?,vol=?,updated_at=? WHERE kind=?')
    .run(g.rating, g.rd, g.vol, Date.now(), kind)
}

export interface RatingChange {
  before: Glicko
  after: Glicko
  delta: number
}

export function applyPuzzleResult(puzzleRating: number, solved: boolean): RatingChange {
  const before = getRating('puzzle')
  const after = glicko2Update(before, [{ rating: puzzleRating, rd: 50, score: solved ? 1 : 0 }], 0.3)
  setRating('puzzle', after)
  return { before, after, delta: Math.round(after.rating - before.rating) }
}

export function applyGameResult(botElo: number, score: number): RatingChange {
  const before = getRating('vs-bot')
  const after = glicko2Update(before, [{ rating: botElo, rd: 60, score }], 0.5)
  setRating('vs-bot', after)
  return { before, after, delta: Math.round(after.rating - before.rating) }
}
