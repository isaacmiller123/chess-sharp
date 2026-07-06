import { z } from 'zod'
import { handle } from './util'
import { getGame, listGames, saveGame } from '../db/games.repo'
import { applyGameResult } from '../db/ratings.repo'
import { measuredElo } from '../ratings/botStrength'

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
    z.object({
      limit: z.number().int().min(1).max(200).optional(),
      offset: z.number().int().min(0).optional()
    }).strict(),
    ({ limit, offset }) => ({ games: listGames(limit ?? 25, offset ?? 0) })
  )

  handle('games:get', z.object({ gameId: z.number().int() }).strict(), ({ gameId }) => ({
    game: getGame(gameId)
  }))

  handle(
    'games:reportResult',
    z
      .object({
        botElo: z.number().int(),
        score: z.number(),
        // The renderer reports the NOMINAL label (UI-selected level / persona
        // modernElo) plus the kind; MAIN owns the nominal→measured mapping so a
        // stale renderer can never rate against an uncorrected label again.
        opponentKind: z.enum(['engine', 'persona']).optional()
      })
      .strict(),
    ({ botElo, score, opponentKind }) => {
      const rated = measuredElo({ kind: opponentKind ?? 'engine', elo: botElo })
      const r = applyGameResult(rated, score)
      return { ratingAfter: Math.round(r.after.rating), delta: r.delta }
    }
  )
}
