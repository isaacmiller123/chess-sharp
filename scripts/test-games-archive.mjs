#!/usr/bin/env node
// Games-archive migration + filter suite (audit fix: non-chess online games
// polluted the chess Analysis/Progress/Home lists).
//
//   node scripts/test-games-archive.mjs
//
// Verifies, against a real node:sqlite temp DB, the exact SQL the v10 migration
// and games.repo use:
//   1. The v10 ALTER (game_kind TEXT NOT NULL DEFAULT 'chess') is accepted and
//      backfills every pre-existing row to 'chess' (no data loss).
//   2. The listGames filter (WHERE game_kind='chess') surfaces chess games and
//      hides non-chess ones (go/othello/…), which the chess PGN parser + review
//      engine cannot render.
// Exit 1 on any failure.

import { DatabaseSync } from 'node:sqlite'

let failures = 0
const check = (name, ok, detail = '') => {
  if (ok) console.log(`  ok   ${name}`)
  else {
    failures++
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

// Pre-v10 game table (game_kind column absent), matching database.ts's CREATE.
const db = new DatabaseSync(':memory:')
db.exec(`
  CREATE TABLE game(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at INTEGER NOT NULL,
    white_name TEXT, black_name TEXT, user_color TEXT, result TEXT,
    opponent_kind TEXT, opponent_label TEXT, opponent_elo INTEGER,
    source TEXT, pgn TEXT NOT NULL DEFAULT ''
  );
`)
let t = 1000
const ins = (source, pgn) =>
  db.prepare('INSERT INTO game(created_at,source,pgn) VALUES (?,?,?)').run(t++, source, pgn)
ins('play', '1. e4 e5')
ins('online', '1. d4 d5')

// ---- 1. the exact v10 ALTER ----------------------------------------------------
console.log('v10 migration ALTER')
db.exec(`ALTER TABLE game ADD COLUMN game_kind TEXT NOT NULL DEFAULT 'chess';`)
const backfilled = db.prepare("SELECT COUNT(*) c FROM game WHERE game_kind='chess'").get()
check('ALTER accepted; existing rows backfilled to chess', backfilled.c === 2, `got ${backfilled.c}`)

// ---- 2. new saves stamp their kind; filter hides non-chess ----------------------
console.log('game_kind stamping + list filter')
const insK = (kind, pgn) =>
  db.prepare('INSERT INTO game(created_at,source,pgn,game_kind) VALUES (?,?,?,?)').run(t++, 'online', pgn, kind)
insK('chess', '1. c4') // an online chess game — must still appear
insK('go', 'B[pd];W[dd]') // a go game — must be hidden
insK('othello', 'f5 d6') // othello — hidden

// The exact listGames query.
const listed = db
  .prepare("SELECT game_kind FROM game WHERE game_kind = 'chess' ORDER BY created_at DESC")
  .all()
check('chess-only filter returns all 3 chess games', listed.length === 3, `got ${listed.length}`)
check('no non-chess kind leaks into the list', listed.every((r) => r.game_kind === 'chess'))
const total = db.prepare('SELECT COUNT(*) c FROM game').get()
check('non-chess games are stored, not dropped', total.c === 5, `got ${total.c}`)

db.close()
if (failures) {
  console.error(`\n${failures} FAILED`)
  process.exit(1)
}
console.log('\nALL GREEN — games-archive migration + filter')
