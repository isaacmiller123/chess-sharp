import { parseFen } from 'chessops/fen'
import { Chess } from 'chessops/chess'
import { makeSan } from 'chessops/san'
function pos(fen){ const r=Chess.fromSetup(parseFen(fen).unwrap()); return r.isErr?null:r.unwrap() }
const VAL={pawn:1,knight:3,bishop:3,rook:5,queen:9,king:0}
const files='abcdefgh'; const sq=(f,r)=>files[f]+(r+1)
function build(pieces){let rows=[]; for(let r=7;r>=0;r--){let row='',e=0; for(let f=0;f<8;f++){const s=sq(f,r),pc=pieces[s]; if(pc){if(e){row+=e;e=0}row+=pc}else e++} if(e)row+=e; rows.push(row)} return rows.join('/')+' w - - 0 1'}
function evalMove(p, mv){ const before=p.board.get(mv.to); const immCap = before&&before.color==='black'?VAL[before.role]:0
  const p1=p.clone(); p1.play(mv); let minH=99
  for(const [bf,bs] of p1.allDests()) for(const bt of bs){ const p2=p1.clone(); p2.play({from:bf,to:bt})
    let best=0; for(const [wf,ws] of p2.allDests()) for(const wt of ws){const v=p2.board.get(wt); if(v&&v.color==='black') best=Math.max(best,VAL[v.role])}
    minH=Math.min(minH,best) }
  return {win: Math.max(immCap, minH), gaveCheck:p1.isCheck(), immCap} }
function fileIdx(s){return files.indexOf(s[0])} function rankIdx(s){return +s[1]}
function dist(a,b){return Math.max(Math.abs(fileIdx(a)-fileIdx(b)),Math.abs(rankIdx(a)-rankIdx(b)))}
const out=[]
// rook forks king (back rank) + loose knight on the SAME rank, far apart; rook arrives up a file in between.
for(const bk of ['a8','b8','g8','h8','c8','f8']){
 for(const tF of 'abcdefgh') for(const tR of [8]){ const tg=files[files.indexOf(tF)]+tR  // loose knight on 8th rank
  if(dist(bk,tg)<4) continue // must be far apart so king can't defend it
  for(const rF of 'abcdefgh') for(const rR of [1,2,3,4,5,6]){ const rk=files[files.indexOf(rF)]+rR
    const pieces={}; pieces[bk]='k'; pieces['e1']='K'; pieces[tg]='n'; pieces[rk]='R'
    const used=Object.keys(pieces); if(new Set(used).size!==used.length) continue
    const fen=build(pieces); const p=pos(fen); if(!p||p.isCheck()||p.turn!=='white') continue
    let winMoves=[]
    for(const [from,set] of p.allDests()) for(const to of set){ const e=evalMove(p,{from,to}); if(e.win>=3) winMoves.push({from,to,...e}) }
    if(winMoves.length!==1) continue
    const w=winMoves[0]; if(!w.gaveCheck||w.immCap>=3) continue
    if(p.board.get(w.from).role!=='rook') continue
    const land=sq(w.to%8,Math.floor(w.to/8))
    const san=makeSan(p.clone(),{from:w.from,to:w.to})
    out.push({fen,bk,tg,rk,san,land}) }
 }
}
console.log('UNIQUE far-apart rook forks (king+knight, 8th rank):',out.length)
for(const r of out.slice(0,10)) console.log(`  ${r.san} land ${r.land}  BK@${r.bk} N@${r.tg} R@${r.rk}  ${r.fen}`)
