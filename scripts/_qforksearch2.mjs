import { parseFen } from 'chessops/fen'
import { Chess } from 'chessops/chess'
import { makeSan } from 'chessops/san'
function pos(fen){ const r=Chess.fromSetup(parseFen(fen).unwrap()); return r.isErr?null:r.unwrap() }
const VAL={pawn:1,knight:3,bishop:3,rook:5,queen:9,king:0}
const files='abcdefgh'; const sq=(f,r)=>files[f]+(r+1)
function build(pieces){let rows=[]; for(let r=7;r>=0;r--){let row='',e=0; for(let f=0;f<8;f++){const s=sq(f,r),pc=pieces[s]; if(pc){if(e){row+=e;e=0}row+=pc}else e++} if(e)row+=e; rows.push(row)} return rows.join('/')+' w - - 0 1'}
function harvest(p, mv){ const p1=p.clone(); p1.play(mv); let minH=99
  for(const [bf,bs] of p1.allDests()) for(const bt of bs){ const p2=p1.clone(); p2.play({from:bf,to:bt})
    let best=0; for(const [wf,ws] of p2.allDests()) for(const wt of ws){const v=p2.board.get(wt); if(v&&v.color==='black') best=Math.max(best,VAL[v.role])}
    minH=Math.min(minH,best) }
  return {minH, gaveCheck:p1.isCheck()} }
function fileOf(s){return s[0]} function rankOf(s){return +s[1]}
function sameLine(a,b){ // same rank/file/diagonal
  if(fileOf(a)===fileOf(b)||rankOf(a)===rankOf(b)) return true
  const df=Math.abs(files.indexOf(a[0])-files.indexOf(b[0])); const dr=Math.abs(rankOf(a)-rankOf(b)); return df===dr }
const results=[]
const bk='g8'
for(const nf of 'abcdefgh') for(let nr=2;nr<=5;nr++){ const nSq=files[files.indexOf(nf)]+nr
  for(const qf of 'abcdefgh') for(let qr=1;qr<=7;qr++){ const qSq=files[files.indexOf(qf)]+qr
    const pieces={}; pieces[bk]='k'; pieces['g1']='K'; pieces['f2']='P';pieces['g2']='P';pieces['h2']='P'; pieces['g7']='p';pieces['h7']='p'; pieces[nSq]='n'; pieces[qSq]='Q'
    const used=Object.keys(pieces); if(new Set(used).size!==used.length) continue
    if(['g1','f2','g2','h2','g7','h7','g8'].includes(nSq)||['g1','f2','g2','h2','g7','h7','g8'].includes(qSq)) continue
    const fen=build(pieces); const p=pos(fen); if(!p||p.isCheck()||p.turn!=='white') continue
    const winners=[]
    for(const [from,set] of p.allDests()) for(const to of set){ const h=harvest(p,{from,to}); if(h.minH>=3) winners.push({from,to,...h}) }
    if(winners.length===1 && winners[0].gaveCheck){
      const mv=winners[0]; if(p.board.get(mv.from).role!=='queen') continue
      const forkSq=files[mv.to%8]? null:null
      const fSq=sq(mv.to%8, Math.floor(mv.to/8))
      // require king and knight on DIFFERENT lines from fork square (true two-pronged), and not capturing on the way
      if(sameLine(fSq, bk) && sameLine(fSq,nSq) && sameLine(bk,nSq) && (fileOf(bk)===fileOf(nSq))) continue // both same file => degenerate
      // require knight NOT already on same line as king (so it's a real fork not a line-up)
      if(sameLine(bk,nSq)) continue
      const san=makeSan(p.clone(),{from:mv.from,to:mv.to})
      results.push({fen,nSq,qSq,san,fSq})
    }
  }
}
console.log('clean two-pronged unique forks (BK g8):',results.length)
for(const r of results.slice(0,20)) console.log(`  ${r.san} (fork sq ${r.fSq})  N@${r.nSq} Q@${r.qSq}  ${r.fen}`)
