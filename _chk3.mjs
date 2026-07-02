import { parseFen, makeFen } from 'chessops/fen'
import { Chess } from 'chessops/chess'
import { parseUci, makeUci, parseSquare } from 'chessops/util'

function load(fen){ return Chess.fromSetup(parseFen(fen).unwrap()).unwrap() }
function legal(fen){
  const pos = load(fen); const dests=pos.allDests(); const out=[]
  for(const [from,sqs] of dests) for(const to of sqs) out.push(makeUci({from,to}))
  return out
}
function info(fen){ const pos=load(fen); return {check:pos.isCheck(), turn:pos.turn} }
function play(fen,ucis){ const pos=load(fen); for(const u of ucis) pos.play(parseUci(u)); return pos }
function whoAttacks(fen, sq, byColor){
  const pos=load(fen)
  const s=parseSquare(sq)
  const attackers=pos.kingAttackers ? null : null
  // use board attacks: find pieces of byColor that attack s
  const res=[]
  for(const from of pos.board.occupied){
    const pc=pos.board.get(from)
    if(pc.color!==byColor) continue
    const dests=pos.dests(from) // pseudo-legal incl captures
    if(dests.has(s)) res.push(makeUci({from,to:s})+":"+pc.role)
  }
  return res
}

// Candidate: black bishop on d6 (loose), knight e4 takes Nxd6, white pawn on c5 guards d6.
// Battery: Re1, Ne4 screen, black Qe8. White king somewhere safe (h1/g1 not on diagonal issues).
// Need: no white PAWN attacks d6 (so no pawn alternative capture). c5 pawn guards d6? c5 pawn attacks b6 and d6 -> yes guards d6, but does c5 pawn ATTACK d6 meaning a pawn could capture there? Only if a black piece is on d6 AND pawn is white on c5: cxd6 IS a capture. That's an alternative! So c5 pawn guarding d6 also means cxd6 is possible. Bad.
// Need the guard to be a NON-pawn, OR guard by a pawn that canNOT capture onto that square (i.e. guards from a file such that capturing isn't to that square). A pawn guards diagonally = same squares it captures. So ANY pawn guard implies a pawn capture alternative. 
// Therefore: guard the knight's landing square with a NON-PAWN piece, OR choose a landing square no enemy can punish (knight simply safe because nothing attacks it).
// Simplest: knight captures a piece on a square where, after capture, NOTHING attacks the knight (so it's just safe), and no white pawn could have captured that black piece.
print:;
