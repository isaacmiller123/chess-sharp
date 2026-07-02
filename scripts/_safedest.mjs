import { parseFen } from 'chessops/fen'
import { Chess } from 'chessops/chess'
import { parseUci, makeSquare, parseSquare } from 'chessops/util'
import { attacks } from 'chessops/attacks'
import { makeSan } from 'chessops/san'
function pos(fen){const s=parseFen(fen);if(s.isErr)return null;const p=Chess.fromSetup(s.unwrap());return p.isErr?null:p.unwrap()}
const [fen, fromSq] = process.argv.slice(2)
const p=pos(fen)
const from=parseSquare(fromSq)
const dests=p.dests(from)
for(const to of dests){
  const m={from,to}
  const san=makeSan(p,m)
  // play it, then check if the destination square is attacked by the opponent (piece can be recaptured)
  const p2=pos(fen); p2.play(m)
  // now opponent to move; is `to` attacked by opponent?
  const opp=p2.turn
  let attackedBy=[]
  const set = opp==='white'?p2.board.white:p2.board.black
  for(const s of set){ const pc=p2.board.get(s); if(!pc)continue; if(attacks(pc,s,p2.board.occupied).has(to)) attackedBy.push(pc.role[0].toUpperCase()+makeSquare(s)) }
  console.log(san, makeSquare(to), 'attacked by opp:', attackedBy.length?attackedBy.join(','):'SAFE')
}
