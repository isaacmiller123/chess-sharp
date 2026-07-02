import { parseFen } from 'chessops/fen'
import { Chess } from 'chessops/chess'
import { parseUci, makeSquare, parseSquare } from 'chessops/util'
import { attacks } from 'chessops/attacks'
import { makeSan } from 'chessops/san'
function pos(fen){const s=parseFen(fen);if(s.isErr)return null;const p=Chess.fromSetup(s.unwrap());return p.isErr?null:p.unwrap()}
// After White plays `push`, report the knight's flight squares and which are covered by White.
const [fen, push, knightSq] = process.argv.slice(2)
let p=pos(fen)
if(!p){console.log('ILLEGAL FEN');process.exit(1)}
const m=parseUci(push)
if(!m||!p.isLegal(m)){console.log('ILLEGAL push',push);process.exit(1)}
const san=makeSan(p,m)
p.play(m)  // now Black to move
// knight legal destinations
const ksq=parseSquare(knightSq)
const dests=p.dests(ksq)
const flights=[]
for(const to of dests) flights.push(makeSquare(to))
// for each flight (and the knight square itself), is it attacked by a White piece?
function whiteAttacks(sq){
  const t=parseSquare(sq); const out=[]
  for(const s of p.board.white){ const pc=p.board.get(s); if(!pc)continue; if(attacks(pc,s,p.board.occupied).has(t)) out.push(pc.role[0].toUpperCase()+makeSquare(s)) }
  return out
}
console.log('push:',san)
console.log('knight on',knightSq,'attacked by White?', whiteAttacks(knightSq))
console.log('flight squares:', flights)
for(const f of flights) console.log('   ',f,'covered by White:', whiteAttacks(f))
console.log('knight has', flights.length, 'flights; trapped iff every flight covered AND knight attacked')
