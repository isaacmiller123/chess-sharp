import { parseFen, makeFen } from 'chessops/fen'
import { Chess } from 'chessops/chess'
import { parseUci } from 'chessops/util'
import { makeSan } from 'chessops/san'
import { DatabaseSync } from 'node:sqlite'
const db = new DatabaseSync('resources/data/puzzles.sqlite',{readOnly:true})
const ids = process.argv.slice(2)
for(const id of ids){
  const r=db.prepare('SELECT FEN,Moves,Rating FROM puzzles WHERE PuzzleId=?').get(id)
  if(!r){console.log(id,'NOT FOUND');continue}
  const pos=Chess.fromSetup(parseFen(r.FEN).unwrap()).unwrap()
  const mv=r.Moves.split(' ')
  // apply lead-in moves[0]
  const lead=parseUci(mv[0]); 
  const leadSan=makeSan(pos,lead); pos.play(lead)
  const stepFen=makeFen(pos.toSetup())
  // solver move mv[1]
  const sol=parseUci(mv[1]); const solSan=makeSan(pos,sol)
  // also full line SAN for context
  let p2=Chess.fromSetup(parseFen(stepFen).unwrap()).unwrap(); let sans=[]
  for(const u of mv.slice(1)){const m=parseUci(u);sans.push(makeSan(p2,m));p2.play(m)}
  console.log(id,'R'+r.Rating)
  console.log('  stepFEN:',stepFen)
  console.log('  turn:',stepFen.split(' ')[1],' lead:',leadSan,' SOLVE:',mv[1],'('+solSan+')')
  console.log('  line:',sans.join(' '))
}
