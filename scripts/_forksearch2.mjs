import { parseFen } from 'chessops/fen'
import { Chess } from 'chessops/chess'
import { parseUci } from 'chessops/util'
import { makeSan } from 'chessops/san'
function pos(fen){ const r=Chess.fromSetup(parseFen(fen).unwrap()); return r.isErr?null:r.unwrap() }
const VAL={pawn:1,knight:3,bishop:3,rook:5,queen:9,king:0}
const files='abcdefgh'; const sq=(f,r)=>files[f]+(r+1)
const targets=['c8','g8','c6','g6','d5','f5']
function build(pieces){ let rows=[]
  for(let r=7;r>=0;r--){let row='',e=0; for(let f=0;f<8;f++){const s=sq(f,r),pc=pieces[s]; if(pc){if(e){row+=e;e=0}row+=pc}else e++} if(e)row+=e; rows.push(row)}
  return rows.join('/')+' w - - 0 1' }
function tryBoard(qSq,rSq,launch,bk,wk,wp,bp){
  const pieces={}; pieces[bk]='k';pieces[wk]='K';pieces[launch]='N';pieces[qSq]='q';pieces[rSq]='r'
  for(const p of wp)pieces[p]='P'; for(const p of bp)pieces[p]='p'
  const used=Object.keys(pieces); if(new Set(used).size!==used.length) return null
  const fen=build(pieces); const p=pos(fen); if(!p||p.isCheck()) return null
  const fm=parseUci(launch+'e7'); if(!p.isLegal(fm)) return null
  const after=p.clone(); after.play(fm); if(after.isCheck()) return null
  // best play for black: choose reply that MAXIMIZES the value black retains (minimizes white harvest),
  // and require no black check anywhere.
  let minHarvest=99
  for(const [from,set] of after.allDests()) for(const to of set){
    const p2=after.clone(); p2.play({from,to}); if(p2.isCheck()) return null
    let best=0; for(const [wf,ws] of p2.allDests()) for(const wt of ws){const v=p2.board.get(wt); if(v&&v.color==='black') best=Math.max(best,VAL[v.role])}
    minHarvest=Math.min(minHarvest,best)
  }
  return {fen,minHarvest}
}
// Want minHarvest == 9 (queen always falls) -> queen can't be saved while saving rook either.
const launchSquares=['c6','c8','d5','f5','g6','g8']
const out=[]
for(const qSq of targets) for(const rSq of targets){ if(qSq===rSq) continue
  for(const launch of launchSquares){ if(launch===qSq||launch===rSq) continue
    for(const bk of ['a8','h8','a7','h7','b8','g7','a6','h6','a5','h5']){
      if([qSq,rSq,launch].includes(bk)) continue
      for(const ws of [
        {wk:'b1',wp:['a2','b2','c2']},{wk:'g1',wp:['f2','g2','h3']},{wk:'g1',wp:['f2','g3','h2']},
        {wk:'h2',wp:['g2','h3','f3']},{wk:'a1',wp:['a2','b2','b3']},{wk:'h1',wp:['f2','g2','h2']},
        {wk:'g2',wp:['f2','g3','h2']},
      ]){
        const r=tryBoard(qSq,rSq,launch,bk,ws.wk,ws.wp,[])
        if(r && r.minHarvest===9) out.push({...r,qSq,rSq,launch,bk,wk:ws.wk})
      }
    }
  }
}
console.log('QUEEN-winning quiet forks (minHarvest=9):', out.length)
for(const r of out.slice(0,10)) console.log(`  q@${r.qSq} r@${r.rSq} N@${r.launch} bk@${r.bk} wk@${r.wk}  FEN: ${r.fen}`)
