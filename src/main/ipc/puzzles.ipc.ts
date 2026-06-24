import { z } from 'zod'
import { handle } from './util'
import { getPuzzle, listThemes, nextPuzzle } from '../db/puzzles.repo'
import { applyPuzzleResult } from '../db/ratings.repo'
import { getAppDb } from '../db/database'

export function registerPuzzles(): void {
  handle(
    'puzzles:next',
    z
      .object({
        theme: z.string().optional(),
        ratingLo: z.number().int().optional(),
        ratingHi: z.number().int().optional(),
        exclude: z.array(z.string()).optional()
      })
      .strict(),
    ({ theme, ratingLo, ratingHi, exclude }) => ({
      puzzle: nextPuzzle({ theme, ratingLo: ratingLo ?? 600, ratingHi: ratingHi ?? 2200, exclude })
    })
  )

  handle('puzzles:get', z.object({ puzzleId: z.string() }).strict(), ({ puzzleId }) => ({
    puzzle: getPuzzle(puzzleId)
  }))

  handle('puzzles:themes', z.object({}).strict(), () => ({ themes: listThemes() }))

  handle(
    'puzzles:attempt',
    z
      .object({
        puzzleId: z.string(),
        puzzleRating: z.number().int(),
        solved: z.boolean(),
        ms: z.number().int().optional()
      })
      .strict(),
    ({ puzzleId, puzzleRating, solved, ms }) => {
      const res = applyPuzzleResult(puzzleRating, solved)
      getAppDb()
        .prepare(
          'INSERT INTO puzzle_attempt(puzzle_id,solved,ms,rating_before,rating_after,created_at) VALUES (?,?,?,?,?,?)'
        )
        .run(puzzleId, solved ? 1 : 0, ms ?? null, res.before.rating, res.after.rating, Date.now())
      return { ratingAfter: Math.round(res.after.rating), rd: Math.round(res.after.rd), delta: res.delta }
    }
  )
}
