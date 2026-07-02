import { parseFen } from 'chessops/fen'
import { Chess } from 'chessops/chess'
import { parseUci } from 'chessops/util'
import { makeSan } from 'chessops/san'
function pos(fen){ const r=Chess.fromSetup(parseFen(fen).unwrap()); return r.isErr?null:r.unwrap() }
const VAL={pawn:1,knight:3,bishop:3,rook:5,queen:9,king:0}
const files='abcdefgh'; const sq=(f,r)=>files[f]+(r+1)
const targets=['c8','g8','c6','g6','d5','f5']
function build(pieces){let rows=[]; for(let r=7;r>=0;r--){let row='',e=0; for(let f=0;f<8;f++){const s=sq(f,r),pc=pieces[s]; if(pc){if(e){row+=e;e=0}row+=pc}else e++} if(e)row+=e; rows.push(row)} return rows.join('/')+' w - - 0 1'}
function evalBoard(pieces){
  const fen=build(pieces); const p=pos(fen); if(!p||p.isCheck()) return null
  // find the knight launch automatically (the N square)
  let launch=null; for(const s in pieces) if(pieces[s]==='N') launch=s
  const fm=parseUci(launch+'e7'); if(!fm||!p.isLegal(fm)) return null
  const after=p.clone(); after.play(fm); if(after.isCheck()) return null
  let minH=99
  for(const [from,set] of after.allDests()) for(const to of set){
    const p2=after.clone(); p2.play({from,to}); if(p2.isCheck()) return null
    let best=0; for(const [wf,ws] of p2.allDests()) for(const wt of ws){const v=p2.board.get(wt); if(v&&v.color==='black') best=Math.max(best,VAL[v.role])}
    minH=Math.min(minH,best)
  }
  if(minH<5) return null
  return {fen,minH,launch}
}
const launchSquares=['c6','c8','d5','f5','g6','g8']
const out=[]
for(const qSq of targets) for(const rSq of targets){ if(qSq===rSq) continue
  for(const launch of launchSquares){ if(launch===qSq||launch===rSq) continue
    for(const bk of ['a8','h8','a7','h7','b8','g7','a6','h6']){ if([qSq,rSq,launch].includes(bk)) continue
      // kingside walled king and queenside walled king, with optional black king pawns
      for(const ws of [
        {wk:'g1',wp:['f2','g2','h2']},{wk:'h1',wp:['f2','g2','h2']},{wk:'b1',wp:['a2','b2','c2']},
        {wk:'a1',wp:['a2','b2','c2']},{wk:'g1',wp:['e2','f2','g2','h2']},
      ]) for(const bp of [[],['g7','h7'],['f7','g7','h7'],['a7','b7'],['a7','b7','c7']]){
        const pieces={}; pieces[bk]='k';pieces[ws.wk]='K';pieces[launch]='N';pieces[qSq]='q';pieces[rSq]='r'
        let ok=true
        for(const p of ws.wp){if(pieces[p]){ok=false}pieces[p]='P'}
        for(const p of bp){if(pieces[p]){ok=false}pieces[p]='p'}
        if(!ok) continue
        const used=Object.keys(pieces); if(new Set(used).size!==used.length) continue
        const r=evalBoard(pieces)
        if(r) out.push({...r,qSq,rSq,bk,wk:ws.wk,nwp:ws.wp.length,nbp:bp.length})
      }
    }
  }
}
// dedupe by FEN, prefer ones with black king-pawns (natural) and distinct geometry
const seen=new Set(); const uniq=[]
for(const r of out){ if(seen.has(r.fen))continue; seen.add(r.fen); uniq.push(r) }
console.log('total valid (rook-winning quiet forks):', uniq.length)
// show a spread of distinct (qSq,rSq,launch) shapes
const byShape={}
for(const r of uniq){ const k=`${r.qSq}/${r.rSq}/${r.launch}`; (byShape[k]=byShape[k]||[]).push(r) }
console.log('distinct q/r/launch shapes:', Object.keys(byShape).length)
for(const k of Object.keys(byShape)){ const r=byShape[k].find(x=>x.nbp>=2)||byShape[k][0]
  console.log(`  shape ${k}: q@${r.qSq} r@${r.rSq} N@${r.launch} bk@${r.bk} wk@${r.wk} bp${r.nbp} -> ${r.fen}`) }
