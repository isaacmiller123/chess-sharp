import { z } from 'zod'
import { handle } from './util'

// In-memory settings stub for the scaffold; real persistence arrives with the DB layer.
const settings = new Map<string, unknown>()

export function registerSettings(): void {
  handle('settings:get', z.object({ key: z.string() }).strict(), ({ key }) => ({
    value: settings.get(key) ?? null
  }))

  handle('settings:set', z.object({ key: z.string(), value: z.unknown() }).strict(), ({ key, value }) => {
    settings.set(key, value)
    return { ok: true }
  })
}
