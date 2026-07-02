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
// Rook fork winning a loose knight/bishop, with a white pawn guarding the landing (so king can't take), UNIQUE incl direct.
const out=[]
for(const bk of ['c8','b8','g8','h8','a8','e8','c7','f7']){
 for(const tF of 'abcdefgh') for(const tR of [1,2,3,4,5,6,7,8]){ const tg=files[files.indexOf(tF)]+tR
  for(const rF of 'abcdefgh') for(const rR of [1,2,3,4,5,6,7,8]){ const rk=files[files.indexOf(rF)]+rR
   for(const gp of ['b6','b7','d6','d7','f6','h6']){ // a white guard pawn near landing
    const pieces={}; pieces[bk]='k'; pieces['e1']='K'; pieces[tg]='n'; pieces[rk]='R'; pieces[gp]='P'
    const used=Object.keys(pieces); if(new Set(used).size!==used.length) continue
    const fen=build(pieces); const p=pos(fen); if(!p||p.isCheck()||p.turn!=='white') continue
    let winMoves=[]
    for(const [from,set] of p.allDests()) for(const to of set){ const e=evalMove(p,{from,to}); if(e.win>=3) winMoves.push({from,to,...e}) }
    if(winMoves.length!==1) continue
    const w=winMoves[0]; if(!w.gaveCheck||w.immCap>=3) continue
    if(p.board.get(w.from).role!=='rook') continue
    const land=sq(w.to%8,Math.floor(w.to/8))
    const san=makeSan(p.clone(),{from:w.from,to:w.to})
    out.push({fen,bk,tg,rk,gp,san,land}) }
  }
 }
}
console.log('UNIQUE rook forks (pawn-guarded, no direct grab):',out.length)
for(const r of out.slice(0,10)) console.log(`  ${r.san} land ${r.land}  BK@${r.bk} N@${r.tg} R@${r.rk} guard@${r.gp}  ${r.fen}`)
