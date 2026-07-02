import { parseFen } from 'chessops/fen'
import { Chess } from 'chessops/chess'
import { makeSan } from 'chessops/san'
function pos(fen){ const r=Chess.fromSetup(parseFen(fen).unwrap()); return r.isErr?null:r.unwrap() }
const VAL={pawn:1,knight:3,bishop:3,rook:5,queen:9,king:0}
const files='abcdefgh'; const sq=(f,r)=>files[f]+(r+1)
function build(pieces){let rows=[]; for(let r=7;r>=0;r--){let row='',e=0; for(let f=0;f<8;f++){const s=sq(f,r),pc=pieces[s]; if(pc){if(e){row+=e;e=0}row+=pc}else e++} if(e)row+=e; rows.push(row)} return rows.join('/')+' w - - 0 1'}
function diagPos(s){return files.indexOf(s[0]) - (+s[1]-1)}
function diagNeg(s){return files.indexOf(s[0]) + (+s[1]-1)}
function evalMove(p, mv){ const before=p.board.get(mv.to); const immCap = before&&before.color==='black'?VAL[before.role]:0
  const p1=p.clone(); p1.play(mv); let minH=99
  for(const [bf,bs] of p1.allDests()) for(const bt of bs){ const p2=p1.clone(); p2.play({from:bf,to:bt})
    let best=0; for(const [wf,ws] of p2.allDests()) for(const wt of ws){const v=p2.board.get(wt); if(v&&v.color==='black') best=Math.max(best,VAL[v.role])}
    minH=Math.min(minH,best) }
  return {win: Math.max(immCap, minH), gaveCheck:p1.isCheck(), immCap} }
const out=[]
// vary BK among a8,b8,g8,h8,b7,g7 ; rook on a square; dark or light bishop accordingly ; WK g1 + pawns f2g2h2 + black g7h7 (when king kingside) else minimal
for(const bk of ['a8','b8','g8','h8','a7','h7','b7','g7']){
 for(const rF of 'abcdefgh') for(const rR of [1,2,3,4,5,6,7,8]){ const rk=files[files.indexOf(rF)]+rR
  for(const bF of 'abcdefgh') for(const bR of [1,2,3,4,5,6]){ const b=files[files.indexOf(bF)]+bR
    const pieces={}; pieces[bk]='k'; pieces['g1']='K'; pieces['f2']='P';pieces['g2']='P';pieces['h2']='P'; pieces[rk]='r'; pieces[b]='B'
    const used=Object.keys(pieces); if(new Set(used).size!==used.length) continue
    const fen=build(pieces); const p=pos(fen); if(!p||p.isCheck()||p.turn!=='white') continue
    let winMoves=[]; for(const [from,set] of p.allDests()) for(const to of set){ const e=evalMove(p,{from,to}); if(e.win>=5) winMoves.push({from,to,...e}) }
    if(winMoves.length!==1) continue
    const w=winMoves[0]; if(!w.gaveCheck||w.immCap>=5) continue
    if(p.board.get(w.from).role!=='bishop') continue
    const land=sq(w.to%8,Math.floor(w.to/8))
    // require TWO-diagonal: king on one diag of land, rook on the other
    const dpK=diagPos(bk)===diagPos(land), dnK=diagNeg(bk)===diagNeg(land)
    const dpR=diagPos(rk)===diagPos(land), dnR=diagNeg(rk)===diagNeg(land)
    if(!((dpK&&dnR)||(dnK&&dpR))) continue
    const san=makeSan(p.clone(),{from:w.from,to:w.to})
    out.push({fen,bk,rk,b,san,land}) }
 }
}
// dedupe by FEN, print a spread across distinct BK
const byBk={}
for(const r of out){ (byBk[r.bk]=byBk[r.bk]||[]).push(r) }
for(const bk of Object.keys(byBk)){ console.log(`BK ${bk}: ${byBk[bk].length} boards; e.g. ${byBk[bk][0].san} R@${byBk[bk][0].rk} B@${byBk[bk][0].b} land ${byBk[bk][0].land} -> ${byBk[bk][0].fen}`) }
