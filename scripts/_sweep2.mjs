import { readFileSync } from 'node:fs'
import { parseFen } from 'chessops/fen'
import { Chess } from 'chessops/chess'
import { parseUci } from 'chessops/util'
import { makeSan } from 'chessops/san'
function pos(fen){ const s=parseFen(fen); if(s.isErr) return null; const p=Chess.fromSetup(s.unwrap()); return p.isErr?null:p.unwrap() }
const VAL={pawn:1,knight:3,bishop:3,rook:5,queen:9,king:0}
const c=JSON.parse(readFileSync('resources/curriculum/chapters/ch08-the-fork.json','utf8'))
// After 'side' (the player) plays uci, compute guaranteed material the player wins:
// min over opponent replies of (max value of an opponent piece the player can capture next move),
// PLUS any piece captured by the uci itself.
function harvest(fen, uci){ const p=pos(fen); if(!p) return {err:'illegal fen'}
  const player=p.turn
  const m=parseUci(uci); if(!m||!p.isLegal(m)) return {err:'illegal '+uci}
  const san=makeSan(p,m); const mover=p.board.get(m.from).role
  const capd=p.board.get(m.to); const immV = capd? VAL[capd.role]:0
  const p1=p.clone(); p1.play(m); const gaveCheck=p1.isCheck()
  // opponent to move now
  let minNext=99
  for(const [bf,bs] of p1.allDests()) for(const bt of bs){ const p2=p1.clone(); p2.play({from:bf,to:bt})
    // player to move: best capture of an opponent (non-player) piece
    let best=0; for(const [wf,ws] of p2.allDests()) for(const wt of ws){const v=p2.board.get(wt); if(v&&v.color!==player) best=Math.max(best,VAL[v.role])}
    minNext=Math.min(minNext,best) }
  return {san,mover,gaveCheck,immV,guaranteedNext:minNext, totalGuaranteed: immV+minNext}
}
console.log('=== play Qs: does the move win material? ===')
c.test.questions.forEach((q,i)=>{ if(q.kind!=='play')return
  const h=harvest(q.fen,q.solutionUci[0])
  console.log(`q${i} ${h.san}: immCap+${h.immV}, guaranteedNext+${h.guaranteedNext} => wins ~${Math.max(h.immV,h.guaranteedNext)} check=${h.gaveCheck}`)
})
console.log('=== judge Qs: confirm the judged move outcome ===')
c.test.questions.forEach((q,i)=>{ if(q.kind!=='judge')return
  // For verdict=correct (a fork was played): the position is AFTER the fork; the player who forked now waits while opp moves.
  // We check: after opp's best reply, can the forker win material? -> confirms 'correct'.
  const p=pos(q.fen); if(!p){console.log(`q${i}: illegal`);return}
  const forker = p.turn==='white'?'black':'white' // the side that JUST moved (lastMove) is opposite of side to move
  // opp (side to move) replies; then forker captures
  let minNext=99
  for(const [bf,bs] of p.allDests()) for(const bt of bs){ const p2=p.clone(); p2.play({from:bf,to:bt})
    let best=0; for(const [wf,ws] of p2.allDests()) for(const wt of ws){const v=p2.board.get(wt); if(v&&v.color!==forker) best=Math.max(best,VAL[v.role])}
    minNext=Math.min(minNext,best) }
  console.log(`q${i} verdict=${q.verdict}: forker=${forker}, after opp reply forker wins ~+${minNext} (correct => >0; blunder => the player who DIDN'T fork)`)
})
