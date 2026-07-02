import { DatabaseSync } from 'node:sqlite'
const db = new DatabaseSync('resources/data/puzzles.sqlite', { readOnly: true })
// schema
const cols = db.prepare("PRAGMA table_info(puzzle_themes)").all()
console.log('puzzle_themes cols:', cols.map(c=>c.name).join(','))
const tabs = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()
console.log('tables:', tabs.map(t=>t.name).join(','))
// count fork puzzles in each cool-down window
for (const [lo,hi] of [[800,950],[820,980],[860,1000],[900,1040],[760,900]]) {
  const r = db.prepare("SELECT COUNT(DISTINCT PuzzleId) c FROM puzzle_themes WHERE Rating BETWEEN ? AND ? AND Theme='fork'").get(lo,hi)
  console.log(`fork @${lo}-${hi}: ${r.c}`)
}
