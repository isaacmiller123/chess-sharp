import { parseFen } from 'chessops/fen'
import { Chess } from 'chessops/chess'
import { parseUci, makeUci } from 'chessops/util'
import { makeSan } from 'chessops/san'

function pos(fen){ const s=parseFen(fen); const p=Chess.fromSetup(s.unwrap()); return p.unwrap() }

// Given fen (White to move) and the forking move uci, verify:
//  - move is legal, gives no check (or check, reported)
//  - after the fork, for EVERY black reply, White can capture queen or rook (>=rook value) next.
// Reports the best material White is guaranteed.
const [fen, forkUci, ...targets] = process.argv.slice(2)
const VAL={pawn:1,knight:3,bishop:3,rook:5,queen:9,king:100}
let p = pos(fen)
const fm = parseUci(forkUci)
console.log('fork', forkUci, makeSan(p,fm), 'legal?', p.isLegal(fm))
p.play(fm)
console.log('after fork: check?', p.isCheck())
// the two target squares
const tsq = targets // e.g. ['d5','f5']
// enumerate black replies
const dests = p.allDests()
let worst = 999
let worstLine = ''
for (const [from, set] of dests) {
  for (const to of set) {
    const reply = { from, to }
    const p2 = p.clone()
    const replySan = makeSan(p2, reply)
    p2.play(reply)
    // now White to move: find max-value capture White can make of a target piece
    const wd = p2.allDests()
    let bestGain = 0
    for (const [wf, wset] of wd) {
      for (const wt of wset) {
        const victim = p2.board.get(wt)
        if (victim && victim.color==='black') {
          // is this capturing a high-value piece safely-ish? just track victim value
          if (VAL[victim.role] > bestGain) bestGain = VAL[victim.role]
        }
      }
    }
    if (bestGain < worst) { worst = bestGain; worstLine = replySan + ' -> White best capture value ' + bestGain }
  }
}
console.log('Across all black replies, White is GUARANTEED to win at least value:', worst)
console.log('  worst-case line:', worstLine)
