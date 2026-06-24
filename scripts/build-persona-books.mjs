// Build per-persona opening books from curated repertoire lines.
// Validates every SAN line with chessops; records ONLY the persona's own moves
// (white-to-move positions from white lines, black-to-move from black lines) as
// an EPD -> [uci] map (transposition-friendly). Drops any line with an illegal move.
// Output: resources/personas/books.json  { [personaId]: { [epd]: string[] } }
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Chess } from 'chessops/chess'
import { parseFen, makeFen, INITIAL_FEN } from 'chessops/fen'
import { parseSan } from 'chessops/san'
import { makeUci } from 'chessops/util'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const reps = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/tmp/persona-rep.json'), 'utf-8'))

const epdOf = (pos) => makeFen(pos.toSetup(), { epd: true })

let totalLines = 0
let dropped = 0
const out = {}

for (const rep of reps) {
  const book = {}
  const add = (epd, uci) => {
    const arr = (book[epd] ||= [])
    if (!arr.includes(uci)) arr.push(uci)
  }
  for (const [color, lines] of [['white', rep.white || []], ['black', rep.black || []]]) {
    for (const line of lines) {
      totalLines++
      const pos = Chess.fromSetup(parseFen(INITIAL_FEN).unwrap()).unwrap()
      const sans = line.trim().split(/\s+/).filter(Boolean)
      let ok = true
      for (const san of sans) {
        const move = parseSan(pos, san)
        if (!move) { ok = false; break }
        if (pos.turn === color) add(epdOf(pos), makeUci(move))
        pos.play(move)
      }
      if (!ok) dropped++
    }
  }
  out[rep.id] = book
}

const OUT_DIR = path.join(ROOT, 'resources', 'personas')
fs.mkdirSync(OUT_DIR, { recursive: true })
fs.writeFileSync(path.join(OUT_DIR, 'books.json'), JSON.stringify(out))
const positions = Object.values(out).reduce((n, b) => n + Object.keys(b).length, 0)
console.log(`personas: ${reps.length} | lines: ${totalLines} | dropped(illegal): ${dropped} | book positions: ${positions}`)
console.log('per persona:', Object.fromEntries(Object.entries(out).map(([k, b]) => [k, Object.keys(b).length])))
