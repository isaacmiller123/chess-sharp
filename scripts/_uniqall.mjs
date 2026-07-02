import { parseFen } from 'chessops/fen'
import { Chess } from 'chessops/chess'
import { makeSan } from 'chessops/san'
function pos(fen){ return Chess.fromSetup(parseFen(fen).unwrap()).unwrap() }
const VAL={pawn:1,knight:3,bishop:3,rook:5,queen:9,king:0}
const [fen,minWin]=process.argv.slice(2); const need=Number(minWin)
const p=pos(fen); const winners=[]
for(const [from,set] of p.allDests()) for(const to of set){
  const immV = (()=>{const v=p.board.get(to); return v&&v.color==='black'?VAL[v.role]:0})()
  const p1=p.clone(); const san=makeSan(p1,{from,to}); p1.play({from,to})
  let minH=99
  for(const [bf,bs] of p1.allDests()) for(const bt of bs){ const p2=p1.clone(); p2.play({from:bf,to:bt})
    let best=0; for(const [wf,ws] of p2.allDests()) for(const wt of ws){const v=p2.board.get(wt); if(v&&v.color==='black') best=Math.max(best,VAL[v.role])}
    minH=Math.min(minH,best) }
  const guaranteed=Math.max(immV, minH)  // count immediate capture as a way to win
  if(guaranteed>=need) winners.push(`${san} (+${guaranteed}${immV>=need?' [direct]':''})`)
}
console.log('moves winning >= '+need+' (incl direct captures):'); winners.forEach(w=>console.log('  '+w)); console.log('count',winners.length)
