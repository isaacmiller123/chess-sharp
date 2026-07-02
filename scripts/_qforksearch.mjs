import { parseFen } from 'chessops/fen'
import { Chess } from 'chessops/chess'
import { parseUci } from 'chessops/util'
import { makeSan } from 'chessops/san'
function pos(fen){ const r=Chess.fromSetup(parseFen(fen).unwrap()); return r.isErr?null:r.unwrap() }
const VAL={pawn:1,knight:3,bishop:3,rook:5,queen:9,king:0}
const files='abcdefgh'; const sq=(f,r)=>files[f]+(r+1)
function build(pieces){let rows=[]; for(let r=7;r>=0;r--){let row='',e=0; for(let f=0;f<8;f++){const s=sq(f,r),pc=pieces[s]; if(pc){if(e){row+=e;e=0}row+=pc}else e++} if(e)row+=e; rows.push(row)} return rows.join('/')+' w - - 0 1'}
// guaranteed harvest for a white move
function harvest(p, mv){
  const p1=p.clone(); p1.play(mv); let minH=99
  for(const [bf,bs] of p1.allDests()) for(const bt of bs){ const p2=p1.clone(); p2.play({from:bf,to:bt})
    let best=0; for(const [wf,ws] of p2.allDests()) for(const wt of ws){const v=p2.board.get(wt); if(v&&v.color==='black') best=Math.max(best,VAL[v.role])}
    minH=Math.min(minH,best) }
  return {minH, gaveCheck:p1.isCheck()}
}
// Place: WK g1 with f2g2h2; BK in a corner; loose black knight; WQ somewhere. Find positions where exactly ONE
// white move guarantees +3 and it gives check (a true forced fork), queen not hanging after.
const results=[]
const bkOpts=['a8','h8','a7','h1?']
for(const bk of ['a8','h8','a7','h7']){
  for(const nf of 'abcdefgh') for(let nr=1;nr<=6;nr++){ const nSq=files[files.indexOf(nf)]+nr
    for(const qf of 'abcdefgh') for(let qr=1;qr<=8;qr++){ const qSq=files[files.indexOf(qf)]+qr
      const pieces={}; pieces[bk]='k'; pieces['g1']='K'; pieces['f2']='P';pieces['g2']='P';pieces['h2']='P'; pieces[nSq]='n'; pieces[qSq]='Q'
      // give black king some pawns away from action for realism on a8/h8
      const used=Object.keys(pieces); if(new Set(used).size!==used.length) continue
      if(['g1','f2','g2','h2'].includes(nSq)||['g1','f2','g2','h2'].includes(qSq)) continue
      const fen=build(pieces); const p=pos(fen); if(!p||p.isCheck()||p.turn!=='white') continue
      // enumerate white moves winning >=3
      const winners=[]
      for(const [from,set] of p.allDests()) for(const to of set){ const h=harvest(p,{from,to}); if(h.minH>=3) winners.push({from,to,...h}) }
      if(winners.length===1 && winners[0].gaveCheck){
        // queen must be the mover and not immediately lost; ensure mover is the queen
        const mv=winners[0]; const moverPiece=p.board.get(mv.from)
        if(moverPiece.role!=='queen') continue
        const san=makeSan(p.clone(),{from:mv.from,to:mv.to})
        results.push({fen,bk,nSq,qSq,san})
      }
    }
  }
}
console.log('unique-fork positions:',results.length)
for(const r of results.slice(0,15)) console.log(`  ${r.san}  BK@${r.bk} N@${r.nSq} Q@${r.qSq}  ${r.fen}`)
