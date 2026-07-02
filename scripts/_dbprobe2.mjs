import { DatabaseSync } from 'node:sqlite'
import { parseFen } from 'chessops/fen'
import { Chess } from 'chessops/chess'
import { parseUci } from 'chessops/util'
import { makeSan } from 'chessops/san'
const db = new DatabaseSync('resources/data/puzzles.sqlite', { readOnly: true })
const cols = db.prepare("PRAGMA table_info(puzzles)").all()
console.log('puzzles cols:', cols.map(c=>c.name).join(','))
// Sample some fork puzzles in L3 window 820-980 and see what piece delivers the SECOND move (the solving fork)
const rows = db.prepare(`
  SELECT p.PuzzleId, p.FEN, p.Moves FROM puzzles p
  JOIN puzzle_themes t ON t.PuzzleId=p.PuzzleId
  WHERE t.Theme='fork' AND p.Rating BETWEEN 820 AND 980
  LIMIT 400`).all()
// classify: after playing moves[0] (opp lead-in), moves[1] is solver's forking move. Which piece?
const tally = {}
for (const r of rows) {
  try {
    const s = parseFen(r.FEN); if (s.isErr) continue
    const pp = Chess.fromSetup(s.unwrap()); if (pp.isErr) continue
    const p = pp.unwrap()
    const moves = r.Moves.split(' ')
    const m0 = parseUci(moves[0]); if(!m0||!p.isLegal(m0)) continue
    p.play(m0)
    const m1 = parseUci(moves[1]); if(!m1||!p.isLegal(m1)) continue
    const piece = p.board.get(m1.from)
    const san = makeSan(p, m1)
    tally[piece.role] = (tally[piece.role]||0)+1
  } catch(e){}
}
console.log('solving-move piece role tally (sample of fork@820-980):', JSON.stringify(tally))
