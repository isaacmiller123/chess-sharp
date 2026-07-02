import { parseFen } from 'chessops/fen'
import { Chess } from 'chessops/chess'
import { makeUci, parseUci } from 'chessops/util'
function pos(fen){ const s=parseFen(fen); if(s.isErr) return null; const p=Chess.fromSetup(s.unwrap()); return p.isErr?null:p.unwrap() }
function legalMoves(p){ const out=[]; for(const [from,dests] of p.allDests()) for(const to of dests){ const pc=p.board.get(from); const tr=to>>3; if(pc&&pc.role==='pawn'&&(tr===7||tr===0)){for(const r of ['queen','rook','bishop','knight'])out.push({from,to,promotion:r})} else out.push({from,to}) } return out }
function after(p,m){const c=p.clone();c.play(m);return c}
const FILES='abcdefgh'
function placeFen(map){const board=Array.from({length:8},()=>Array(8).fill(null));for(const[s,c]of Object.entries(map)){const f=FILES.indexOf(s[0]);const r=parseInt(s[1])-1;board[r][f]=c}let rows=[];for(let r=7;r>=0;r--){let row='';let e=0;for(let f=0;f<8;f++){const c=board[r][f];if(c){if(e){row+=e;e=0}row+=c}else e++}if(e)row+=e;rows.push(row)}return rows.join('/')+' w - - 0 1'}
function classify(p){const res=[];for(const mv of legalMoves(p)){const np=after(p,mv);const u=makeUci(mv);if(np.isCheckmate()){res.push({u,kind:'M1'});continue}if(np.isStalemate()){res.push({u,kind:'STALE'});continue}const replies=legalMoves(np);if(replies.length===0)continue;let all=true;for(const r of replies){const rp=after(np,r);let f=false;for(const wm of legalMoves(rp)){if(after(rp,wm).isCheckmate()){f=true;break}}if(!f){all=false;break}}if(all)res.push({u,kind:np.isCheck()?'M2C':'M2Q',replies:replies.length})}return res}
// Want clean teachable: 0 M1, exactly 1 M2 (quiet), and >=1 STALEMATE move present (the trap), king on an EDGE/corner, first move is the WHITE KING move.
let hits=[]
for(let bkf=0;bkf<8;bkf++)for(let bkr=1;bkr<=8;bkr++){const bk=FILES[bkf]+bkr
 // black king on edge only
 if(!(bkf===0||bkf===7||bkr===1||bkr===8))continue
 for(let wkf=0;wkf<8;wkf++)for(let wkr=1;wkr<=8;wkr++){const wk=FILES[wkf]+wkr;if(wk===bk)continue;if(Math.max(Math.abs(wkf-bkf),Math.abs(wkr-bkr))<=1)continue
  for(let rf=0;rf<8;rf++)for(let rr=1;rr<=8;rr++){const rs=FILES[rf]+rr;if(rs===bk||rs===wk)continue
   const fen=placeFen({[bk]:'k',[wk]:'K',[rs]:'R'});const p=pos(fen);if(!p)continue
   const res=classify(p);const m1=res.filter(x=>x.kind==='M1');const m2=res.filter(x=>x.kind==='M2C'||x.kind==='M2Q');const stale=res.filter(x=>x.kind==='STALE')
   if(m1.length===0&&m2.length===1&&m2[0].kind==='M2Q'&&stale.length>=1){
     const fm=m2[0].u; const isKingMove=fm[0]==='a'||true; // just record
     hits.push({fen,first:fm,stale:stale.map(s=>s.u).join(','),replies:m2[0].replies})
   }
  }}}
console.log('clean K+R quiet mate-in-2 WITH a live stalemate trap (BK on edge):',hits.length)
hits.slice(0,30).forEach(h=>console.log('  ',h.fen,'first=',h.first,'replies=',h.replies,'stalemoves=',h.stale))
