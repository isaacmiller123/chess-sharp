import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { resolvePuzzlesPath, puzzlesInstalled } from '../datasets/paths'

// We use Node's built-in node:sqlite (Electron 42 / Node 24) — no native module
// build needed. The puzzles.sqlite (imported at runtime, or bundled) is opened
// read-only; the writable app.sqlite lives under userData (in DEV that is the
// contained .devdata dir).

let puzzlesDb: DatabaseSync | null = null
let appDb: DatabaseSync | null = null

/** True once the puzzle DB has been imported (or bundled). */
export function hasPuzzlesDb(): boolean {
  return puzzlesInstalled()
}

export function getPuzzlesDb(): DatabaseSync {
  if (!puzzlesDb) puzzlesDb = new DatabaseSync(resolvePuzzlesPath(), { readOnly: true })
  return puzzlesDb
}

export function getAppDb(): DatabaseSync {
  if (!appDb) {
    const dir = app.getPath('userData')
    fs.mkdirSync(dir, { recursive: true })
    appDb = new DatabaseSync(path.join(dir, 'app.sqlite'))
    appDb.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;')
    migrate(appDb)
  }
  return appDb
}

function migrate(db: DatabaseSync): void {
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number }
  if (row.user_version < 1) {
    db.exec('BEGIN')
    try {
      db.exec(`
      CREATE TABLE game(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at INTEGER NOT NULL,
        white_name TEXT, black_name TEXT,
        user_color TEXT,              -- 'white' | 'black' | null
        result TEXT,                  -- '1-0' | '0-1' | '1/2-1/2' | '*'
        opponent_kind TEXT,           -- 'engine' | 'persona' | 'human' | 'analysis'
        opponent_label TEXT,
        opponent_elo INTEGER,
        source TEXT,                  -- 'play' | 'import' | 'analysis'
        pgn TEXT NOT NULL,
        accuracy_white REAL, accuracy_black REAL,
        est_elo_low INTEGER, est_elo_high INTEGER,
        reviewed INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX idx_game_created ON game(created_at DESC);

      CREATE TABLE puzzle_attempt(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        puzzle_id TEXT NOT NULL,
        solved INTEGER NOT NULL,
        ms INTEGER,
        rating_before REAL, rating_after REAL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX idx_attempt_created ON puzzle_attempt(created_at DESC);
      CREATE INDEX idx_attempt_puzzle ON puzzle_attempt(puzzle_id);

      CREATE TABLE rating(
        kind TEXT PRIMARY KEY,        -- 'puzzle' | 'vs-bot'
        rating REAL NOT NULL, rd REAL NOT NULL, vol REAL NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE srs_card(
        puzzle_id TEXT PRIMARY KEY,
        due INTEGER NOT NULL,
        stability REAL, difficulty REAL,
        reps INTEGER NOT NULL DEFAULT 0,
        lapses INTEGER NOT NULL DEFAULT 0,
        state INTEGER NOT NULL DEFAULT 0,
        last_review INTEGER
      );
      CREATE INDEX idx_srs_due ON srs_card(due);

      CREATE TABLE progress_event(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT NOT NULL,           -- 'puzzle' | 'game' | 'lesson'
        ref TEXT,
        value REAL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX idx_progress_created ON progress_event(created_at DESC);

      CREATE TABLE setting(key TEXT PRIMARY KEY, value TEXT);
    `)
    const now = Date.now()
    const seed = db.prepare(
      'INSERT OR IGNORE INTO rating(kind,rating,rd,vol,updated_at) VALUES (?,?,?,?,?)'
    )
    seed.run('puzzle', 1200, 350, 0.06, now)
    seed.run('vs-bot', 1200, 350, 0.06, now)
      db.exec('PRAGMA user_version = 1')
      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
  }
}

export function closeDbs(): void {
  puzzlesDb?.close()
  appDb?.close()
  puzzlesDb = null
  appDb = null
}
