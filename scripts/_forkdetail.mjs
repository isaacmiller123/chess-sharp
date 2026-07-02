import { parseFen } from 'chessops/fen'
import { Chess } from 'chessops/chess'
import { parseUci } from 'chessops/util'
import { makeSan } from 'chessops/san'
function pos(fen){ return Chess.fromSetup(parseFen(fen).unwrap()).unwrap() }
const VAL={pawn:1,knight:3,bishop:3,rook:5,queen:9,king:0}
const [fen,forkUci,t1,t2]=process.argv.slice(2)
let p=pos(fen); const fm=parseUci(forkUci); p.play(fm)
let anyCheck=false, savedBoth=null
for(const [from,set] of p.allDests()) for(const to of set){
  const p2=p.clone(); const rsan=makeSan(p2,{from,to}); p2.play({from,to})
  if(p2.isCheck()) anyCheck=true
  // after black reply, can White capture a target? find max target value capturable
  let best=0
  for(const [wf,ws] of p2.allDests()) for(const wt of ws){const v=p2.board.get(wt); if(v&&v.color==='black') best=Math.max(best,VAL[v.role])}
  if(best<5 && !p2.isCheck()) savedBoth=rsan // black saved both without check (bad)
}
console.log('any black reply gives check?', anyCheck, '| black able to save both quietly?', savedBoth||'no')
