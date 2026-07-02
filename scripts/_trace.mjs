import { parseFen } from 'chessops/fen'
import { Chess } from 'chessops/chess'
import { makeUci, parseUci } from 'chessops/util'
function pos(fen){ return Chess.fromSetup(parseFen(fen).unwrap()).unwrap() }
function legalMoves(p){ const out=[]; for(const [from,dests] of p.allDests()) for(const to of dests){ const pc=p.board.get(from); const tr=to>>3; if(pc&&pc.role==='pawn'&&(tr===7||tr===0)){for(const r of ['queen','rook','bishop','knight'])out.push({from,to,promotion:r})} else out.push({from,to}) } return out }
function after(p,m){const c=p.clone();c.play(m);return c}
function fullLine(fen, firstUci){
  const p=pos(fen); const p1=after(p, parseUci(firstUci))
  console.log('FEN', fen, ' first=', firstUci, ' check?', p1.isCheck(), ' mate?', p1.isCheckmate(), ' stale?', p1.isStalemate())
  const replies=legalMoves(p1)
  console.log('  black legal replies:', replies.map(makeUci).join(',')||'(none)')
  for(const r of replies){
    const rp=after(p1,r)
    const mates=legalMoves(rp).filter(wm=>after(rp,wm).isCheckmate()).map(makeUci)
    console.log('    after', makeUci(r), '-> white mates:', mates.join(',')||'(NONE!)')
  }
}
const [fen, first]=process.argv.slice(2)
fullLine(fen, first)
