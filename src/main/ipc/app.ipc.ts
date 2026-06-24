import { app } from 'electron'
import { z } from 'zod'
import { handle } from './util'

export function registerApp(): void {
  handle('app:ping', z.object({}).strict(), () => ({ ok: true, ts: Date.now() }))

  handle('app:dataVersion', z.object({}).strict(), () => ({
    appVersion: app.getVersion(),
    engineVersion: 'Stockfish 18',
    puzzleDbDate: '2026-06-03'
  }))
}
