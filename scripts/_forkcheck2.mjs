import { parseFen } from 'chessops/fen'
import { Chess } from 'chessops/chess'
import { parseUci } from 'chessops/util'
import { makeSan } from 'chessops/san'
function pos(fen){ const s=parseFen(fen); const p=Chess.fromSetup(s.unwrap()); return p.unwrap() }
const VAL={pawn:1,knight:3,bishop:3,rook:5,queen:9,king:0}
const [fen, forkUci, t1, t2] = process.argv.slice(2)
let p = pos(fen)
const fm = parseUci(forkUci)
if(!p.isLegal(fm)){ console.log('FORK ILLEGAL'); process.exit(1) }
const forkSan = makeSan(p,fm)
p.play(fm)
console.log(`Fork: ${forkSan}  | gives check: ${p.isCheck()}  | black legal replies: ${[...p.allDests()].reduce((a,[,s])=>a+[...s].length,0)}`)
// For each black reply, simulate then let White grab the most valuable HANGING target piece.
let worst = {val: 999, line: ''}
const dests = p.allDests()
for (const [from, set] of dests) for (const to of set) {
  const p2 = p.clone(); const rsan = makeSan(p2,{from,to}); p2.play({from,to})
  // White's turn: best capture of a black piece that is currently attacked & not adequately defended is messy;
  // simpler: max value black piece White can capture THIS move (the fork harvest).
  let best=0, bestSan=''
  for (const [wf,ws] of p2.allDests()) for (const wt of ws) {
    const v=p2.board.get(wt); if(v&&v.color==='black'){ if(VAL[v.role]>best){best=VAL[v.role]; const tmp=p2.clone(); bestSan=makeSan(tmp,{from:wf,to:wt})} }
  }
  if (best<worst.val) worst={val:best,line:`...${rsan} then White ${bestSan} (+${best})`}
}
console.log(`Guaranteed harvest (min over black replies): +${worst.val}  via  ${worst.line}`)
