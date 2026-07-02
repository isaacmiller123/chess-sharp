import { parseFen } from 'chessops/fen'
import { Chess } from 'chessops/chess'
import { makeUci } from 'chessops/util'
function pos(fen){ return Chess.fromSetup(parseFen(fen).unwrap()).unwrap() }
function legalMoves(p){ const out=[]; for(const [from,dests] of p.allDests()) for(const to of dests){ const pc=p.board.get(from); const tr=to>>3; if(pc&&pc.role==='pawn'&&(tr===7||tr===0)){for(const r of ['queen','rook','bishop','knight'])out.push({from,to,promotion:r})} else out.push({from,to}) } return out }
function after(p,m){const c=p.clone();c.play(m);return c}
// classify each mate-in-2 first move: is it a check? how many black replies?
function analyze(fen){
  const p=pos(fen); const res=[]
  for(const mv of legalMoves(p)){
    const np=after(p,mv); const u=makeUci(mv)
    if(np.isCheckmate()) { res.push({u, kind:'MATE1'}); continue }
    if(np.isStalemate()){ res.push({u, kind:'STALEMATE'}); continue }
    const replies=legalMoves(np); if(replies.length===0) continue
    let all=true
    for(const r of replies){ const rp=after(np,r); let f=false; for(const wm of legalMoves(rp)){ if(after(rp,wm).isCheckmate()){f=true;break} } if(!f){all=false;break} }
    if(all){ const gives = np.isCheck(); res.push({u, kind: gives?'M2-CHECK':'M2-QUIET', replies:replies.length}) }
  }
  return res
}
for(const f of process.argv.slice(2)){
  try{ const a=analyze(f); console.log('FEN',f); for(const r of a) console.log('   ',r.kind.padEnd(10), r.u, r.replies!==undefined?('replies='+r.replies):'') }
  catch(e){ console.log('FEN',f,'ERR',e.message) }
}
