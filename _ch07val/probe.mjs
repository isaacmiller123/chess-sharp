import { fenLegal, applyUci, isMateInOne, forcedMateInTwo, legalUcis } from './chesslib.mjs'
import { fen as F } from 'chessops'
function reFen(pos) { return F.makeFen(pos.toSetup()) }

let fails = 0
function note(label, ok, extra='') { if(!ok) fails++; console.log((ok?'OK  ':'FAIL')+' '+label+(extra?'  -- '+extra:'')) }

// ---- Hand-authored teaching positions (clean, like ch3) ----
// Back-rank M1 with rook: Black Kg8 + f7g7h7, White Re1 Kg1 => Re8#
note('AUTH Re8# back-rank', isMateInOne('6k1/5ppp/8/8/8/8/8/4R1K1 w - - 0 1', 'e1e8').ok)
// Back-rank M1 with queen far corner: Qa1 -> a8#
note('AUTH Qa8# back-rank', isMateInOne('6k1/5ppp/8/8/8/8/8/Q5K1 w - - 0 1', 'a1a8').ok)

// ---- Hand-authored MATE IN TWO teaching positions ----
// Classic: White Ra1, Kg1; Black Kg8 with f7,g7,h7 and a defending rook on a8 guarding a8.
//   White wants back rank but a8 defends. Use a double-rook battery? Let's craft a clean forced M2.
// M2 #1 (rook ladder push the king to the edge): White Kc1, Ra2, Rb1 vs Black Ke4? open board ladder.
//   1.Ra4+ Ke5 ... not M2. Skip ladder for teach (taught ch6).
// M2 #2 — the "two heavy pieces drive to the back rank":
//   White Qe1?, ... Let's instead VERIFY a clean constructed back-rank M2 with a deflection:
//   White: Kg1, Re1, Rd1; Black: Kg8, f7 g7 h7, Re8 (defends back rank once).
//   White doubles? Position: White Rd1+Re1 already on back rank? They'd be doubled on e? No.
//   Cleaner authored M2: White Qd1, Kg1; Black Kg8, g7 h7 (NO f-pawn so f8 flight via... no, king on g8, f8 open).
//   We want a *forced* M2. Hand-crafting forced M2s is error-prone; PREFER DB positions which are engine-verified.

// ---- DB MODEL LINES I intend to embed (re-verify exact UCI) ----
const models = [
  ['wEerY Qxh7+ Kf8 Qh8#', 'r5k1/1bp2ppp/p1n5/1p1p2q1/3P4/2PQ4/P1B2PPP/4R1K1 w - - 0 18', 'd3h7', ['g8f8'], 'h7h8'],
  ['b84UO Qxc8+ Qd8 Qxd8#', 'rn4k1/pQp2ppp/5q2/8/3p4/8/PPP2PPK/RN3r2 w - - 0 15', 'b7c8', ['f6d8'], 'c8d8'],
  ['TD6y0 ..Rd1 Rxe1 Rxe1#', '3r1rk1/p1p3pp/2p1bQ2/8/2P1R3/1PP5/5PPP/R1B3K1 b - - 0 18', 'd8d1', ['e4e1'], 'd1e1'],
  ['SIbYI Rxd8+ Bxd8 Re8#', '3r2k1/1p3ppp/pb6/8/4R3/1P2P3/P1r2PPP/3R2K1 w - - 2 25', 'd1d8', ['b6d8'], 'e4e8'],
  ['zagKU ..Rxe1 Rxe1 Rxe1#', '4rrk1/1p5p/pBn1q1p1/P2R1p2/1b6/1NP2Q2/1P3PPP/3R2K1 b - - 0 21', 'e6e1', ['d1e1'], 'e8e1'],
]
for (const [label, fen, m1, replies, m2] of models) {
  const r = forcedMateInTwo(fen, m1)
  note('MODEL '+label, r.ok, r.reason||'')
  // confirm the listed main reply leads to the listed mate
  const s = fenLegal(fen); const a = applyUci(s.pos, m1)
  for (const rep of replies) {
    const b = applyUci(a.pos, rep)
    note('   reply '+rep+' legal', b.ok, b.reason||'')
    if (b.ok) note('   '+m2+' mates after '+rep, isMateInOne(reFen(b.pos), m2).ok)
  }
}

console.log(fails? `\n*** ${fails} FAILED ***` : '\nALL PROBE CHECKS PASSED')
process.exit(fails?1:0)
