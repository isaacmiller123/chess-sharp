import { readFileSync } from 'node:fs'
import { parseFen } from 'chessops/fen'
import { Chess } from 'chessops/chess'
import { parseUci } from 'chessops/util'
import { makeSan } from 'chessops/san'
function pos(fen){ const s=parseFen(fen); if(s.isErr) return null; const p=Chess.fromSetup(s.unwrap()); return p.isErr?null:p.unwrap() }
const VAL={pawn:1,knight:3,bishop:3,rook:5,queen:9,king:0}
const c=JSON.parse(readFileSync('resources/curriculum/chapters/ch08-the-fork.json','utf8'))
function harvest(fen, uci){ const p=pos(fen); if(!p) return {err:'illegal fen'}
  const player=p.turn; const m=parseUci(uci); if(!m||!p.isLegal(m)) return {err:'illegal '+uci}
  const san=makeSan(p,m); const capd=p.board.get(m.to); const immV=capd?VAL[capd.role]:0
  const p1=p.clone(); p1.play(m); const chk=p1.isCheck(); let minNext=99
  for(const [bf,bs] of p1.allDests()) for(const bt of bs){ const p2=p1.clone(); p2.play({from:bf,to:bt})
    let best=0; for(const [wf,ws] of p2.allDests()) for(const wt of ws){const v=p2.board.get(wt); if(v&&v.color!==player) best=Math.max(best,VAL[v.role])}
    minNext=Math.min(minNext,best) }
  return {san,chk,wins:Math.max(immV,minNext)} }
for(const [li,les] of c.lessons.entries()){
  for(const seg of les.segments){
    if(seg.kind==='guided'){ for(const [si,st] of seg.steps.entries()){
      const h=harvest(st.fen, st.solutionUci[0])
      console.log(`L${li+1} guided#${si} ${st.solutionUci[0]}: ${h.err||h.san+' wins+'+h.wins+' chk='+h.chk}`)
    }}
    if(seg.kind==='puzzle' && seg.puzzle.boards){ for(const b of seg.puzzle.boards){
      // play lead-in then the solution move(s); report harvest of the SOLUTION move (moves[1])
      const p=pos(b.fen); if(!p){console.log(`${b.id}: illegal fen`);continue}
      const lead=parseUci(b.moves[0]); if(!p.isLegal(lead)){console.log(`${b.id}: illegal lead ${b.moves[0]}`);continue}
      const after=b.fen; const p2=p.clone(); p2.play(lead)
      // build fen after lead-in
      const { makeFen } = await import('chessops/fen')
      const fenAfter = makeFen(p2.toSetup())
      const h=harvest(fenAfter, b.moves[1])
      console.log(`${b.id} lead ${b.moves[0]} then ${b.moves[1]}: ${h.err||h.san+' wins+'+h.wins+' chk='+h.chk}`)
    }}
  }
}
