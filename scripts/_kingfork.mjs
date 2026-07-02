import { parseFen } from 'chessops/fen'
import { Chess } from 'chessops/chess'
import { makeSan } from 'chessops/san'
function pos(fen){ const r=Chess.fromSetup(parseFen(fen).unwrap()); return r.isErr?null:r.unwrap() }
const VAL={pawn:1,knight:3,bishop:3,rook:5,queen:9,king:0}
const files='abcdefgh'; const sq=(f,r)=>files[f]+(r+1)
function build(pieces){let rows=[]; for(let r=7;r>=0;r--){let row='',e=0; for(let f=0;f<8;f++){const s=sq(f,r),pc=pieces[s]; if(pc){if(e){row+=e;e=0}row+=pc}else e++} if(e)row+=e; rows.push(row)} return rows.join('/')+' w - - 0 1'}
function evalMove(p, mv){ const before=p.board.get(mv.to); const immCap = before&&before.color==='black'?VAL[before.role]:0
  const p1=p.clone(); if(!p1.isLegal(mv)) return {win:-1}; p1.play(mv); let minH=99
  for(const [bf,bs] of p1.allDests()) for(const bt of bs){ const p2=p1.clone(); p2.play({from:bf,to:bt})
    let best=0; for(const [wf,ws] of p2.allDests()) for(const wt of ws){const v=p2.board.get(wt); if(v&&v.color==='black') best=Math.max(best,VAL[v.role])}
    minH=Math.min(minH,best) }
  return {win: Math.max(immCap, minH), gaveCheck:p1.isCheck()} }
// pawns c5/e5 blocked by c4/e4; white king d5; black king positioned to defend exactly ONE pawn so only Kd6 (double) wins.
const out=[]
for(const bkF of 'abcdefgh') for(const bkR of [3,4,5,6,7,8]){ const bk=files[files.indexOf(bkF)]+bkR
  const pieces={}; pieces['c5']='p';pieces['e5']='p';pieces['c4']='P';pieces['e4']='P';pieces['d5']='K'; pieces[bk]='k'
  const used=Object.keys(pieces); if(new Set(used).size!==used.length) continue
  const fen=build(pieces); const p=pos(fen); if(!p||p.isCheck()||p.turn!=='white') continue
  // enumerate white moves winning >=1
  let winMoves=[]
  for(const [from,set] of p.allDests()) for(const to of set){ const e=evalMove(p,{from,to}); if(e.win>=1) winMoves.push({from,to,...e}) }
  if(winMoves.length===1 && p.board.get(winMoves[0].from).role==='king'){
    const land=sq(winMoves[0].to%8,Math.floor(winMoves[0].to/8))
    if(land==='d6'){ const san=makeSan(p.clone(),{from:winMoves[0].from,to:winMoves[0].to}); out.push({fen,bk,san}) }
  }
}
console.log('unique king-fork (only Kd6 wins) boards:',out.length)
for(const r of out.slice(0,12)) console.log(`  ${r.san}  BK@${r.bk}  ${r.fen}`)
