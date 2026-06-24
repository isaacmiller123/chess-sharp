import { z } from 'zod'
import { handle } from './util'
import { explainMove, positional } from '../coach'

/**
 * LOCAL coaching IPC (architecture §4 — coach domain). No engine call, no LLM,
 * no network: pure functions over a FEN + the engine eval/PV supplied by the
 * caller. Registered via the shared handle() helper (origin + zod gated).
 *
 * Channels:
 *   coach:explainMove  {fenBefore, played, best, pv, evalBefore, evalAfter, ply?}
 *                      -> {verdict, motifs:string[], text}
 *   coach:positional   {fen} -> {terms:string[], text}
 */

const engineEvalSchema = z
  .object({
    cp: z.number().nullable().optional(),
    mate: z.number().int().nullable().optional()
  })
  .strict()

export function registerCoach(): void {
  handle(
    'coach:explainMove',
    z
      .object({
        fenBefore: z.string().min(1),
        played: z.string().min(1),
        best: z.string().min(1),
        pv: z.array(z.string()).default([]),
        evalBefore: engineEvalSchema,
        evalAfter: engineEvalSchema,
        ply: z.number().int().optional()
      })
      .strict(),
    (args) =>
      explainMove({
        fenBefore: args.fenBefore,
        played: args.played,
        best: args.best,
        pv: args.pv,
        evalBefore: args.evalBefore,
        evalAfter: args.evalAfter,
        ply: args.ply
      })
  )

  handle('coach:positional', z.object({ fen: z.string().min(1) }).strict(), ({ fen }) =>
    positional({ fen })
  )
}
