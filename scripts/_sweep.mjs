import { readFileSync } from 'node:fs'
import { parseFen } from 'chessops/fen'
import { Chess } from 'chessops/chess'
import { parseUci } from 'chessops/util'
import { makeSan } from 'chessops/san'
function pos(fen){ const s=parseFen(fen); if(s.isErr) return null; const p=Chess.fromSetup(s.unwrap()); return p.isErr?null:p.unwrap() }
const VAL={pawn:1,knight:3,bishop:3,rook:5,queen:9,king:0}
const c=JSON.parse(readFileSync('resources/curriculum/chapters/ch08-the-fork.json','utf8'))
// guaranteed-win helper (incl direct capture), returns {win, gaveCheck, mover, san}
function analyze(fen, uci){ const p=pos(fen); if(!p) return {err:'illegal fen'}
  const m=parseUci(uci); if(!m||!p.isLegal(m)) return {err:'illegal move '+uci}
  const mover=p.board.get(m.from).role; const san=makeSan(p,m)
  const imm=p.board.get(m.to); const immV=imm&&imm.color!==p.turn? VAL[imm.role] : (imm? VAL[imm.role] : 0)
  const p1=p.clone(); p1.play(m); const gaveCheck=p1.isCheck()
  let minH=99
  for(const [bf,bs] of p1.allDests()) for(const bt of bs){ const p2=p1.clone(); p2.play({from:bf,to:bt})
    let best=0; for(const [wf,ws] of p2.allDests()) for(const wt of ws){const v=p2.board.get(wt); if(v&&v.color!==p1.turn) best=Math.max(best,VAL[v.role])}
    minH=Math.min(minH,best) }
  return {win:Math.max(immV,minH), gaveCheck, mover, san}
}
console.log('=== TEST play questions ===')
c.test.questions.forEach((q,i)=>{ if(q.kind!=='play') return
  for(const u of q.solutionUci){ const a=analyze(q.fen,u); console.log(`q${i} ${u}: ${a.err||(a.san+' mover='+a.mover+' win+'+a.win+' check='+a.gaveCheck)}`) }
})
console.log('=== TEST judge questions (verdict + structure) ===')
c.test.questions.forEach((q,i)=>{ if(q.kind!=='judge') return
  const p=pos(q.fen); const m=parseUci(q.lastMoveUci)
  const fromEmpty=p&&!p.board.get(m.from); const toOcc=p&&!!p.board.get(m.to)
  console.log(`q${i} verdict=${q.verdict} lastMove=${q.lastMoveUci} fromEmpty=${fromEmpty} toOcc=${toOcc} turn=${p?p.turn:'?'} inCheck=${p?p.isCheck():'?'}`)
})
