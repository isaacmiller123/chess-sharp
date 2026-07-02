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
// Setup: BK on back rank c8; loose black bishop/knight on the 7th rank far side; white rook reaches c7 (guarded by b6 pawn) -> Rc7+ forks.
// Make it fresh: BK on e8, loose knight on a-file 6th? Let's do a generic search: WR somewhere, WK e1, white pawn guards landing.
// Target: unique winning move that gives check, is a rook move, landing square defended by a white pawn (so king can't take).
const out=[]
const bk='c8'
for(const tgF of 'abcdefgh') for(const tgR of [7]){ const tg=files[files.indexOf(tgF)]+tgR; if(tg===bk) continue
  for(const rF of 'abcdefgh') for(const rR of [1,2,3,4,5,6,7]){ const rk=files[files.indexOf(rF)]+rR
    // white pawn on b6 guards c7
    const pieces={}; pieces[bk]='k'; pieces['e1']='K'; pieces['b6']='P'; pieces['c1']='b'; // placeholder removed below
    delete pieces['c1']
    // loose black piece = bishop on tg
    pieces[tg]='b'; pieces[rk]='R'
    const used=Object.keys(pieces); if(new Set(used).size!==used.length) continue
    const fen=build(pieces); const p=pos(fen); if(!p||p.isCheck()||p.turn!=='white') continue
    let winMoves=[]
    for(const [from,set] of p.allDests()) for(const to of set){ const e=evalMove(p,{from,to}); if(e.win>=3) winMoves.push({from,to,...e}) }
    if(winMoves.length!==1) continue
    const w=winMoves[0]; if(!w.gaveCheck) continue
    if(p.board.get(w.from).role!=='rook') continue
    const land=sq(w.to%8,Math.floor(w.to/8)); if(land!=='c7') continue
    const san=makeSan(p.clone(),{from:w.from,to:w.to})
    out.push({fen,tg,rk,san}) }
}
console.log('unique rook forks landing c7 (b6 guards), winning bishop:',out.length)
for(const r of out.slice(0,12)) console.log(`  ${r.san} Bishop@${r.tg} R@${r.rk}  ${r.fen}`)
