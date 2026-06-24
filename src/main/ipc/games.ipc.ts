import { z } from 'zod'
import { handle } from './util'
import { getGame, listGames, saveGame } from '../db/games.repo'
import { applyGameResult } from '../db/ratings.repo'

export function registerGames(): void {
  handle(
    'games:save',
    z
      .object({
        pgn: z.string(),
        whiteName: z.string().optional(),
        blackName: z.string().optional(),
        userColor: z.enum(['white', 'black']).optional(),
        result: z.string().optional(),
        opponentKind: z.string().optional(),
        opponentLabel: z.string().optional(),
        opponentElo: z.number().int().optional(),
        source: z.string().optional()
      })
      .strict(),
    (g) => ({ gameId: saveGame(g) })
  )

  handle(
    'games:list',
    z.object({ limit: z.number().int().optional(), offset: z.number().int().optional() }).strict(),
    ({ limit, offset }) => ({ games: listGames(limit ?? 25, offset ?? 0) })
  )

  handle('games:get', z.object({ gameId: z.number().int() }).strict(), ({ gameId }) => ({
    game: getGame(gameId)
  }))

  handle(
    'games:reportResult',
    z.object({ botElo: z.number().int(), score: z.number() }).strict(),
    ({ botElo, score }) => {
      const r = applyGameResult(botElo, score)
      return { ratingAfter: Math.round(r.after.rating), delta: r.delta }
    }
  )
}
