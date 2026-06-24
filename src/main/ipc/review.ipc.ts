import { type WebContents } from 'electron'
import { z } from 'zod'
import { handle } from './util'
import { getGame } from '../db/games.repo'
import { runReview, getCachedReview, movesFromPgn } from '../review/review'
import { estimateElo } from '../analysis/estElo'

// review:run accepts either a stored gameId (PGN pulled from the game row) or a raw
// pgn. It streams review:progress {gameId|null, ply, total} to the calling sender,
// then resolves with the full review. review:get returns the cached review.
// perf:estimate maps a gameId (cached accuracy) or a raw accuracy to an Elo band.

const runSchema = z
  .object({
    gameId: z.number().int().optional(),
    pgn: z.string().min(1).optional(),
    depth: z.number().int().min(6).max(30).optional()
  })
  .strict()
  .refine((v) => v.gameId !== undefined || v.pgn !== undefined, {
    message: 'review:run requires gameId or pgn'
  })

// Only one review at a time (single shared review engine, heavy CPU).
let reviewing = false

export function registerReview(): void {
  handle('review:run', runSchema, async ({ gameId, pgn, depth }, e) => {
    if (reviewing) throw new Error('review:run: a review is already in progress')

    // Resolve the PGN source.
    let pgnText = pgn
    let resolvedGameId: number | null = gameId ?? null
    if (pgnText === undefined && gameId !== undefined) {
      const game = getGame(gameId)
      if (!game) throw new Error(`review:run: game ${gameId} not found`)
      pgnText = game.pgn
    }
    if (pgnText === undefined) throw new Error('review:run: no PGN to review')

    const moves = movesFromPgn(pgnText)
    if (moves.length === 0) throw new Error('review:run: PGN has no mainline moves')

    const sender: WebContents = e.sender
    reviewing = true
    try {
      const review = await runReview({
        moves,
        depth,
        gameId: resolvedGameId ?? undefined,
        onProgress: (ply, total) => {
          if (!sender.isDestroyed()) {
            sender.send('review:progress', { gameId: resolvedGameId, ply, total })
          }
        }
      })
      return { reviewId: resolvedGameId, review }
    } finally {
      reviewing = false
    }
  })

  handle('review:get', z.object({ gameId: z.number().int() }).strict(), ({ gameId }) => {
    const cached = getCachedReview(gameId)
    if (!cached) return { review: null, moveEvals: [] }
    return { review: cached.review, moveEvals: cached.moveEvals }
  })

  handle(
    'perf:estimate',
    z
      .object({
        gameId: z.number().int().optional(),
        accuracy: z.number().min(0).max(100).optional()
      })
      .strict()
      .refine((v) => v.gameId !== undefined || v.accuracy !== undefined, {
        message: 'perf:estimate requires gameId or accuracy'
      }),
    ({ gameId, accuracy }) => {
      // Direct accuracy estimate.
      if (accuracy !== undefined) {
        const band = estimateElo(accuracy)
        return { est: band.est, low: band.low, high: band.high, accuracy: band.accuracy }
      }
      // Cached-game estimate: average the two sides' accuracy as a whole-game proxy,
      // but prefer returning the user's side if a single side is clearly present.
      const cached = getCachedReview(gameId as number)
      if (!cached) throw new Error(`perf:estimate: no cached review for game ${gameId}`)
      const { white, black } = cached.review
      const acc =
        white.moves > 0 && black.moves > 0
          ? (white.accuracy + black.accuracy) / 2
          : white.moves > 0
            ? white.accuracy
            : black.accuracy
      const moves = white.moves + black.moves
      const band = estimateElo(acc, Math.max(1, Math.round(moves / 2)))
      return { est: band.est, low: band.low, high: band.high, accuracy: band.accuracy }
    }
  )
}
