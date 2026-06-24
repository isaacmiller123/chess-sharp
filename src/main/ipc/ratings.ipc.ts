import { z } from 'zod'
import { handle } from './util'
import { getRating } from '../db/ratings.repo'
import { progressSummary } from '../db/progress.repo'

export function registerRatings(): void {
  handle('ratings:get', z.object({ kind: z.enum(['puzzle', 'vs-bot']) }).strict(), ({ kind }) => {
    const g = getRating(kind)
    return { rating: Math.round(g.rating), rd: Math.round(g.rd), vol: g.vol }
  })

  handle('progress:summary', z.object({}).strict(), () => progressSummary())
}
