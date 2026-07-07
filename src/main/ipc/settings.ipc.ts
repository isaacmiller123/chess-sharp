import { z } from 'zod'
import type { DatabaseSync } from 'node:sqlite'
import { handle } from './util'
import { getAppDb } from '../db/database'

// Settings persist in the v1 `setting` table (key TEXT PRIMARY KEY, value TEXT
// — see db/database.ts migrate()). Values are JSON-encoded on write and decoded
// on read, so any structured value the renderer sends survives an app restart.
// (This replaced an in-memory Map stub that silently lost every setting on
// quit; the table had existed since v1 but was never wired up.)

interface SettingRow {
  value: string | null
}

/** Read one setting (JSON-decoded); null when unset or undecodable. */
export function readSetting(db: DatabaseSync, key: string): unknown {
  const row = db.prepare('SELECT value FROM setting WHERE key=?').get(key) as unknown as
    | SettingRow
    | undefined
  if (!row || row.value == null) return null
  try {
    return JSON.parse(row.value)
  } catch {
    // A corrupt/legacy row behaves like an unset key rather than crashing get.
    return null
  }
}

/** Upsert one setting, JSON-encoded. `undefined` is stored as null. */
export function writeSetting(db: DatabaseSync, key: string, value: unknown): void {
  const json = JSON.stringify(value ?? null)
  db.prepare(
    'INSERT INTO setting(key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value'
  ).run(key, json)
}

export function registerSettings(): void {
  handle('settings:get', z.object({ key: z.string() }).strict(), ({ key }) => ({
    value: readSetting(getAppDb(), key)
  }))

  handle('settings:set', z.object({ key: z.string(), value: z.unknown() }).strict(), ({ key, value }) => {
    writeSetting(getAppDb(), key, value)
    return { ok: true }
  })
}
