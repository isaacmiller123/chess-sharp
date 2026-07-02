import { parseFen, makeFen } from 'chessops/fen'
import { Chess } from 'chessops/chess'
import { parseUci, makeUci, parseSquare } from 'chessops/util'

function pos(fen){ return Chess.fromSetup(parseFen(fen).unwrap()).unwrap() }
function legalMoves(p){
  const out=[]
  for (const [from, dests] of p.allDests()) for (const to of dests){
    // expand promotions
    const piece=p.board.get(from)
    const toRank = to >> 3
    if (piece && piece.role==='pawn' && (toRank===7||toRank===0)){
      for(const r of ['queen','rook','bishop','knight']) out.push({from,to,promotion:r})
    } else out.push({from,to})
  }
  return out
}
function isMate(p){ return p.isCheckmate() }
function isStalemate(p){ return p.isStalemate() }
function after(p,m){ const c=p.clone(); c.play(m); return c }

// Returns: {mateIn1:[uci], mateIn2FirstMoves:[uci], details}
// A "mate in 2 first move" = a move that is NOT mate-in-1 but after which EVERY black reply allows white mate-in-1.
function analyze(fen){
  const p=pos(fen)
  const m1=[], m2=[]
  const stalemates1=[]
  for(const mv of legalMoves(p)){
    const np=after(p,mv)
    const u=makeUci(mv)
    if(isMate(np)){ m1.push(u); continue }
    if(isStalemate(np)){ stalemates1.push(u); continue }
    // does every black reply allow white mate in 1?
    const replies=legalMoves(np)
    if(replies.length===0) continue
    let all=true
    for(const r of replies){
      const rp=after(np,r)
      // white to move: is there a mate in 1?
      let found=false
      for(const wm of legalMoves(rp)){ if(isMate(after(rp,wm))){found=true;break} }
      if(!found){ all=false; break }
    }
    if(all) m2.push(u)
  }
  return {mateIn1:m1, mateIn2:m2, stalemates1, sideToMove:p.turn}
}

const fens = process.argv.slice(2)
for(const f of fens){
  try{
    const a=analyze(f)
    console.log('FEN', f)
    console.log('  turn', a.sideToMove)
    console.log('  mateIn1:', a.mateIn1.join(',')||'(none)')
    console.log('  mateIn2 firstmoves (unique-forcing):', a.mateIn2.join(',')||'(none)')
    console.log('  movesThatStalemate:', a.stalemates1.join(',')||'(none)')
  }catch(e){ console.log('FEN', f, 'ERROR', e.message) }
}
