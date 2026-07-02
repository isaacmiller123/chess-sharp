import { DatabaseSync } from 'node:sqlite'
import { fenLegal, applyUci, legalUcis, forcedMateInTwo, isMateInOne } from './chesslib.mjs'

const db = new DatabaseSync('/Users/isaacmiller/chess/chess-sharp/resources/data/puzzles.sqlite')

// Pull candidate puzzles by Themes LIKE filter using the rating index on puzzles.
// Lichess Moves: moves[0] = opponent setup (auto-played), then the solution.
// So the *puzzle position* (what the solver sees) is AFTER moves[0]; the solver
// plays moves[1], opp moves[2], solver moves[3] ... For mateIn2: solver plays
// moves[1] and moves[3]; moves[3] is mate.
const args = process.argv.slice(2)
const want = args[0] || 'backRankMate'   // theme substring
const lo = parseInt(args[1] || '600', 10)
const hi = parseInt(args[2] || '900', 10)
const need = parseInt(args[3] || '8', 10)
const moveCountFilter = args[4] || 'any'  // 'm1' (2 plies), 'm2' (4 plies), 'any'

const rows = db.prepare(`
  SELECT PuzzleId, FEN, Moves, Rating, Popularity, NbPlays, Themes
  FROM puzzles
  WHERE Rating BETWEEN ? AND ? AND Themes LIKE ?
  ORDER BY Popularity DESC, NbPlays DESC
  LIMIT 4000
`).all(lo, hi, '%' + want + '%')

let shown = 0
for (const r of rows) {
  if (shown >= need) break
  const moves = r.Moves.split(' ')
  const plies = moves.length
  if (moveCountFilter === 'm1' && plies !== 2) continue
  if (moveCountFilter === 'm2' && plies !== 4) continue
  // position the solver faces:
  const start = fenLegal(r.FEN)
  if (!start.ok) continue
  const afterSetup = applyUci(start.pos, moves[0])
  if (!afterSetup.ok) continue
  const puzFen = afterSetup.pos // chessops pos; we want its FEN
  // reconstruct FEN string
  // verify solution mates
  let posFenStr = null
  // get FEN via toSetup + makeFen
  // (import makeFen lazily)
  shown++
  // verify forced property for 2-ply solver mate (m1) or 4-ply (m2)
  let verdict = ''
  if (plies === 2) {
    const ok = isMateInOne(reFen(afterSetup.pos), moves[1])
    verdict = 'M1 ' + (ok.ok ? 'forced-mate OK' : 'NOT MATE: ' + ok.reason)
  } else if (plies === 4) {
    const ok = forcedMateInTwo(reFen(afterSetup.pos), moves[1])
    verdict = 'M2 ' + (ok.ok ? 'forced-mate OK' : 'NOT FORCED: ' + ok.reason)
  } else {
    verdict = 'plies=' + plies + ' (skip-verify)'
  }
  console.log(`${r.PuzzleId} R${r.Rating} pop${r.Popularity} | puzFEN: ${reFen(afterSetup.pos)} | sol: ${moves.slice(1).join(' ')} | ${verdict}`)
  console.log(`     themes: ${r.Themes}`)
}
if (shown === 0) console.log('(no rows matched)')

import { fen as F } from 'chessops'
function reFen(pos) { return F.makeFen(pos.toSetup()) }
