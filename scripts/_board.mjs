import { parseFen } from 'chessops/fen'
import { Chess } from 'chessops/chess'
import { parseUci } from 'chessops/util'
import { makeSan } from 'chessops/san'
function pos(fen){ const r=Chess.fromSetup(parseFen(fen).unwrap()); return r.isErr?null:r.unwrap() }
// args: fen, then uci moves (moves[0]=opp lead-in, rest=solution). Validate legal-in-sequence, print SAN + check/mate flags.
const [fen,...ucis]=process.argv.slice(2)
let p=pos(fen); if(!p){console.log('ILLEGAL FEN');process.exit(1)}
console.log('start turn:',p.turn,'inCheck:',p.isCheck())
let i=0
for(const u of ucis){ const m=parseUci(u); if(!m||!p.isLegal(m)){console.log(`  move ${i} ${u} -> ILLEGAL`);process.exit(1)}
  const san=makeSan(p,m); p.play(m)
  console.log(`  move ${i} ${u} = ${san} | now ${p.turn} | check ${p.isCheck()} | mate ${p.isCheckmate()}`)
  i++ }
