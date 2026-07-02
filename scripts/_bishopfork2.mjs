import { parseFen } from 'chessops/fen'
import { Chess } from 'chessops/chess'
import { makeSan } from 'chessops/san'
function pos(fen){ const r=Chess.fromSetup(parseFen(fen).unwrap()); return r.isErr?null:r.unwrap() }
const VAL={pawn:1,knight:3,bishop:3,rook:5,queen:9,king:0}
const files='abcdefgh'; const sq=(f,r)=>files[f]+(r+1)
function build(pieces){let rows=[]; for(let r=7;r>=0;r--){let row='',e=0; for(let f=0;f<8;f++){const s=sq(f,r),pc=pieces[s]; if(pc){if(e){row+=e;e=0}row+=pc}else e++} if(e)row+=e; rows.push(row)} return rows.join('/')+' w - - 0 1'}
// guaranteed win after move (next-move harvest); also detect immediate capture value
function evalMove(p, mv){ const before=p.board.get(mv.to); const immCap = before&&before.color==='black'?VAL[before.role]:0
  const p1=p.clone(); p1.play(mv); let minH=99
  for(const [bf,bs] of p1.allDests()) for(const bt of bs){ const p2=p1.clone(); p2.play({from:bf,to:bt})
    let best=0; for(const [wf,ws] of p2.allDests()) for(const wt of ws){const v=p2.board.get(wt); if(v&&v.color==='black') best=Math.max(best,VAL[v.role])}
    minH=Math.min(minH,best) }
  return {win: Math.max(immCap, minH), gaveCheck:p1.isCheck(), immCap} }
const out=[]
for(const bkF of 'abcdefgh') for(const bkR of [8,7]){ const bk=files[files.indexOf(bkF)]+bkR
  for(const rF of 'abcdefgh') for(const rR of [8,7,6,5,4,3,2]){ const rk=files[files.indexOf(rF)]+rR
    for(const bF of 'abcdefgh') for(const bR of [1,2,3]){ const b=files[files.indexOf(bF)]+bR
      const pieces={}; pieces[bk]='k'; pieces['g1']='K'; pieces['f2']='P';pieces['g2']='P';pieces['h2']='P'; pieces['g7']='p';pieces['h7']='p'; pieces[rk]='r'; pieces[b]='B'
      const used=Object.keys(pieces); if(new Set(used).size!==used.length) continue
      const fen=build(pieces); const p=pos(fen); if(!p||p.isCheck()||p.turn!=='white') continue
      // find ALL white moves winning >=5
      let winMoves=[]
      for(const [from,set] of p.allDests()) for(const to of set){ const e=evalMove(p,{from,to}); if(e.win>=5) winMoves.push({from,to,...e}) }
      // require EXACTLY ONE winning move, it gives check, it's the bishop, and NO immediate capture of the rook elsewhere
      if(winMoves.length!==1) continue
      const w=winMoves[0]
      if(!w.gaveCheck) continue
      if(w.immCap>=5) continue // the fork move itself must NOT be a direct rook capture
      if(p.board.get(w.from).role!=='bishop') continue
      const san=makeSan(p.clone(),{from:w.from,to:w.to})
      out.push({fen,bk,rk,b,san}) }
  }
}
console.log('clean unique bishop forks (no direct grab):',out.length)
for(const r of out.slice(0,14)) console.log(`  ${r.san}  BK@${r.bk} R@${r.rk} B@${r.b}  ${r.fen}`)
