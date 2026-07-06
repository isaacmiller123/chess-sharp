import { type WebContents } from 'electron'
import { z } from 'zod'
import { handle } from './util'
import { datasetItems, datasetStatus, runImport, cancelImport } from '../datasets/datasets.service'

// datasets:status   -> which dataset groups are installed (engine, puzzles,
//                      maia, katago + the optional Human-SL go net).
// datasets:items    -> row metadata for the UI (label + download size, plus the
//                      katago row's opt-in Human-SL extra).
// datasets:import   -> downloads every missing group, streaming datasets:progress
//                      to the caller, then resolves with the final status.
//                      `includeHuman` also fetches the 94.5 MB Human-SL go net.
// datasets:cancel   -> aborts an in-flight import.
export function registerDatasets(): void {
  handle('datasets:status', z.object({}).strict(), () => datasetStatus())

  handle('datasets:items', z.object({}).strict(), () => ({ items: datasetItems() }))

  handle(
    'datasets:import',
    z.object({ includeHuman: z.boolean().optional() }).strict(),
    async ({ includeHuman }, e) => {
      const sender: WebContents = e.sender
      return runImport(
        (p) => {
          if (!sender.isDestroyed()) sender.send('datasets:progress', p)
        },
        { includeHuman }
      )
    }
  )

  handle('datasets:cancel', z.object({}).strict(), () => {
    cancelImport()
    return { ok: true }
  })
}
