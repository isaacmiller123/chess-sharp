import { z } from 'zod'
import { handle } from './util'
import { get, list } from '../famous/famous.repo'

// Famous-games IPC: a read-only library of public-domain game records. The
// renderer browses metadata via `famous:list` (optionally filtered by era/theme
// group) and loads a single game's expanded move list via `famous:get`.

export function registerFamous(): void {
  handle(
    'famous:list',
    z.object({ group: z.string().optional() }).strict(),
    ({ group }) => ({ games: list({ group }) })
  )

  handle('famous:get', z.object({ id: z.string() }).strict(), ({ id }) => ({
    game: get(id)
  }))
}
