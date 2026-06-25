import { type WebContents } from 'electron'
import { z } from 'zod'
import { handle } from './util'
import {
  DATASET_ITEMS,
  datasetStatus,
  runImport,
  cancelImport
} from '../datasets/datasets.service'

// datasets:status   -> which datasets are installed.
// datasets:items    -> metadata for the UI (label + download size).
// datasets:import   -> downloads the missing datasets, streaming datasets:progress
//                      to the caller, then resolves with the final status.
// datasets:cancel   -> aborts an in-flight import.
export function registerDatasets(): void {
  handle('datasets:status', z.object({}).strict(), () => datasetStatus())

  handle('datasets:items', z.object({}).strict(), () => ({
    items: DATASET_ITEMS.map((it) => ({
      key: it.key,
      label: it.label,
      bytes: it.bytes,
      installedBytes: it.installedBytes
    }))
  }))

  handle('datasets:import', z.object({}).strict(), async (_arg, e) => {
    const sender: WebContents = e.sender
    return runImport((p) => {
      if (!sender.isDestroyed()) sender.send('datasets:progress', p)
    })
  })

  handle('datasets:cancel', z.object({}).strict(), () => {
    cancelImport()
    return { ok: true }
  })
}
