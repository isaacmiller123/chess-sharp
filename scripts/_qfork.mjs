import { parseFen } from 'chessops/fen'
import { Chess } from 'chessops/chess'
import { parseUci } from 'chessops/util'
import { makeSan } from 'chessops/san'
function pos(fen){ return Chess.fromSetup(parseFen(fen).unwrap()).unwrap() }
const VAL={pawn:1,knight:3,bishop:3,rook:5,queen:9,king:0}
const [fen,intended]=process.argv.slice(2)
const p=pos(fen)
console.log('turn',p.turn,'inCheck',p.isCheck())
// 1) Is there any ONE-move capture of a black piece that is SAFE (queen lands undefended) winning >=3?
const dests=p.allDests()
console.log('--- one-move captures of black pieces (direct grabs) ---')
for(const [from,set] of dests) for(const to of set){
  const v=p.board.get(to)
  if(v&&v.color==='black'&&VAL[v.role]>=3){
    const p2=p.clone(); const san=makeSan(p2,{from,to}); p2.play({from,to})
    // is the capturing piece now attacked by black?
    const attackers=p2.board.attacksTo ? null : null
    console.log(`  ${san} captures ${v.role} on ${to}; now black to move, black check? ${p2.isCheck()}`)
  }
}
// 2) The intended fork: play it, confirm check, then confirm next move wins the knight
console.log('--- intended:', intended, '---')
const im=parseUci(intended); console.log('legal?',p.isLegal(im),'san',makeSan(p.clone(),im))
const a=p.clone(); a.play(im); console.log('gives check?',a.isCheck())
// across black replies, can white capture the knight next?
let minH=99
for(const [from,set] of a.allDests()) for(const to of set){
  const p2=a.clone(); p2.play({from,to})
  let best=0; for(const [wf,ws] of p2.allDests()) for(const wt of ws){const v=p2.board.get(wt); if(v&&v.color==='black') best=Math.max(best,VAL[v.role])}
  minH=Math.min(minH,best)
}
console.log('guaranteed harvest after intended fork:',minH)
