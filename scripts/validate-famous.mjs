// Legality-validate curated famous games (chessops): replay each SAN sequence
// from the start; a game is valid only if EVERY move is legal. Drops bad games.
import fs from 'node:fs'
import { Chess } from 'chessops/chess'
import { parseFen, makeFen, INITIAL_FEN } from 'chessops/fen'
import { parseSan } from 'chessops/san'

const inPath = 'data/tmp/famous-curated.json'
const outPath = 'data/tmp/famous-valid.json'
const games = JSON.parse(fs.readFileSync(inPath, 'utf-8'))

const valid = []
const invalid = []

for (const g of games) {
  const pos = Chess.fromSetup(parseFen(INITIAL_FEN).unwrap()).unwrap()
  const sans = String(g.moves || '').trim().split(/\s+/).filter(Boolean)
  let ok = sans.length > 0
  let badAt = -1
  for (let i = 0; i < sans.length; i++) {
    const mv = parseSan(pos, sans[i])
    if (!mv) {
      ok = false
      badAt = i
      break
    }
    pos.play(mv)
  }
  if (ok) {
    valid.push({ ...g, plies: sans.length, finalFen: makeFen(pos.toSetup()), checkmate: pos.isCheckmate() })
  } else {
    invalid.push({ ...g, _plies: sans.length, _badAt: badAt, _badMove: sans[badAt], _around: sans.slice(Math.max(0, badAt - 3), badAt + 1).join(' ') })
  }
}

fs.writeFileSync(outPath, JSON.stringify(valid))
fs.writeFileSync('data/tmp/famous-invalid.json', JSON.stringify(invalid))
console.log(`VALID ${valid.length} / ${games.length}  (invalid ${invalid.length})`)
console.log('valid ids:', valid.map((g) => `${g.id}[${g.plies}${g.checkmate ? '#' : ''}]`).join(', '))
if (invalid.length) console.log('INVALID:', JSON.stringify(invalid, null, 1))
