import { getAppDb } from './database'
import { getRating } from './ratings.repo'

export interface ProgressSummary {
  puzzleRating: number
  puzzleRd: number
  vsBotRating: number
  vsBotRd: number
  puzzlesSolved: number
  puzzlesTried: number
  gamesPlayed: number
  lastPuzzleAt: number | null
  lastGameAt: number | null
}

export function progressSummary(): ProgressSummary {
  const db = getAppDb()
  const puzzle = getRating('puzzle')
  const vsBot = getRating('vs-bot')
  const count = (sql: string): number => (db.prepare(sql).get() as { c: number }).c
  const lastAt = (sql: string): number | null =>
    (db.prepare(sql).get() as { t: number } | undefined)?.t ?? null

  return {
    puzzleRating: Math.round(puzzle.rating),
    puzzleRd: Math.round(puzzle.rd),
    vsBotRating: Math.round(vsBot.rating),
    vsBotRd: Math.round(vsBot.rd),
    puzzlesSolved: count('SELECT COUNT(*) AS c FROM puzzle_attempt WHERE solved=1'),
    puzzlesTried: count('SELECT COUNT(*) AS c FROM puzzle_attempt'),
    gamesPlayed: count('SELECT COUNT(*) AS c FROM game'),
    lastPuzzleAt: lastAt('SELECT created_at AS t FROM puzzle_attempt ORDER BY created_at DESC LIMIT 1'),
    lastGameAt: lastAt('SELECT created_at AS t FROM game ORDER BY created_at DESC LIMIT 1')
  }
}
