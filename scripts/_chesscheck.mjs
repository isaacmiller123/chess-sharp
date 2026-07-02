import { parseFen } from 'chessops/fen'
import { Chess } from 'chessops/chess'
import { parseUci, makeSquare, parseSquare } from 'chessops/util'
import { makeSan } from 'chessops/san'
import { attacks } from 'chessops/attacks'

function pos(fen){ const s=parseFen(fen); if(s.isErr) return null; const p=Chess.fromSetup(s.unwrap()); return p.isErr?null:p.unwrap() }
function legalMoves(fen){
  const p=pos(fen); if(!p) return 'ILLEGAL FEN'
  const out=[]
  for(const [from, sqs] of p.allDests()){ for(const to of sqs){ out.push(makeSan(p,{from,to})) } }
  return out
}
function legal(fen, uci){ const p=pos(fen); if(!p) return 'ILLEGAL FEN'; const m=parseUci(uci); if(!m) return 'unparseable'; return p.isLegal(m) }
function san(fen, uci){ const p=pos(fen); if(!p) return 'ILLEGAL FEN'; const m=parseUci(uci); if(!m||!p.isLegal(m)) return 'ILLEGAL MOVE'; return makeSan(p,m) }
// Count which pieces (any color) attack `target` square, grouped by color, with piece role.
function count(fen, targetSq){
  const p=pos(fen); if(!p) return 'ILLEGAL'
  const tgt=parseSquare(targetSq)
  const res={white:[],black:[]}
  for(const sq of p.board.occupied){
    const piece=p.board.get(sq)
    if(!piece) continue
    const a=attacks(piece, sq, p.board.occupied)
    if(a.has(tgt)){
      const color = piece.color==='white'?'white':'black'
      res[color].push(piece.role[0].toUpperCase()+makeSquare(sq))
    }
  }
  return res
}
const args=process.argv.slice(2); const cmd=args[0]
if(cmd==='moves') console.log(JSON.stringify(legalMoves(args[1])))
else if(cmd==='legal') console.log(legal(args[1], args[2]))
else if(cmd==='san') console.log(san(args[1], args[2]))
else if(cmd==='fenok'){ console.log(pos(args[1])?'OK':'ILLEGAL') }
else if(cmd==='count'){ console.log(JSON.stringify(count(args[1], args[2]))) }
