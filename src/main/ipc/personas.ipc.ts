import { z } from 'zod'
import { handle } from './util'
import { PERSONAS } from '../personas/personas'
import { selectMove } from '../personas/select'

// GM-style persona backend (docs/feature-addendum.md §2b). Two channels:
//   personas:list -> the static catalog (renderer builds the opponent gallery).
//   personas:move -> a style-weighted move for {fen, personaId}.
//
// No DB tables are needed for this unit: personas are a static catalog and games
// against them are persisted by the existing `games` domain (opponent_kind='persona',
// opponent_label / opponent_elo). Real per-player opening books are a later add.

export function registerPersonas(): void {
  handle('personas:list', z.object({}).strict(), () => ({ personas: PERSONAS }))

  handle(
    'personas:move',
    z
      .object({
        fen: z.string().min(1),
        personaId: z.string().min(1),
        depth: z.number().int().min(1).max(30).optional(),
        movetimeMs: z.number().int().min(50).max(10000).optional()
      })
      .strict(),
    async ({ fen, personaId, depth, movetimeMs }) => {
      const res = await selectMove({ fen, personaId, depth, movetimeMs })
      return { bestmove: res.bestmove, lineEval: res.lineEval }
    }
  )
}
