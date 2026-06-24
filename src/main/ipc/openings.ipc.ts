import { z } from 'zod'
import { handle } from './util'
import { lookupByFen } from '../openings/openings.repo'

export function registerOpenings(): void {
  handle('openings:lookup', z.object({ fen: z.string() }).strict(), ({ fen }) => ({
    opening: lookupByFen(fen)
  }))
}
