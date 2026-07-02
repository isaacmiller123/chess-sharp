import { fenLegal, applyUci, isMateInOne, forcedMateInTwo, legalUcis, isMate } from './chesslib.mjs'
import { fen as F } from 'chessops'
function reFen(pos){return F.makeFen(pos.toSetup())}
let fails=0
function note(label, ok, extra=''){ if(!ok)fails++; console.log((ok?'OK  ':'FAIL')+' '+label+(extra?'  -- '+extra:'')) }
// helper: list replies + the mating move count, to confirm "forced" & show the line
function dump(fen, m1){
  const r = forcedMateInTwo(fen, m1)
  const s=fenLegal(fen), a=applyUci(s.pos,m1)
  const reps = a.ok? legalUcis(a.pos):[]
  return {r, reps, after:a.ok?reFen(a.pos):null}
}

// === CANDIDATE AUTHORED M2 POSITIONS ===
// A) Two-rook "ladder/box" M2 driving the king from rank 6 to back rank.
//    White: Kg2, Ra1, Rb2; Black: Kg6 (open). 1.Rb6+ Kg5/Kh5/Kg7/Kf5...not forced single line, but
//    must be forced MATE in 2 (every reply mated). Open-board king has too many squares -> not M2.
//    => ladder needs the king already near edge. Try Black Kh6, White Ra6+?  1.Rh1#? no king h6.
// Let me do the cleanest pedagogical M2s: BACK-RANK with a single defender.

// B) Back-rank M2, defender overloaded. White: Kg1, Rd1, Re1 (doubled? no, d & e).
//    Black: Kg8, f7,g7,h7, Rf8 (guards f8 only). White: 1.Re8 Rxe8 2.Rd8#? Rd1-d8 pinned? no.
//    Position: White Rd1, Re1; can't both reach 8th in one. Use Q+R battery.
// B1) White: Kg1, Qe2, Re1; Black: Kg8, f7 g7 h7, Qf8? Let's just test simple ones.

const cands = [
  // 1) Q+K box M2: White Qf6, Kg6? no. Classic: White Kg6, Qd1 vs Kg8. 1.Qd8+ Kh7? no h7 pawn. open.
  //    With Black king g8 and NO pawns: 1.Qd8+ Kh7 2.?? not forced.
  // Real clean authored M2 #1 — "drive to the corner with the rook, king supports":
  //   White: Kf6, Rb7 ; Black: Kf8.  1.Rb8+ ... Kf8->? Kf6 covers e7,f7,g7. King f8 can go e8? Rb8 covers. -> 1.Rb8#?? that's M1 not M2.
  // #1 corrected to be a true M2: White Kf6, Ra1; Black Kh8? 1.Kg6 (waiting) ... not check. then Ra8#. zugzwang M2!
  ['rookbox zugzwang Kf6 Ra1 vs Kh8: 1.Kg6 Kg8 2.Ra8#? ',
   '7k/8/5K2/8/8/8/8/R7 w - - 0 1', 'f6g6'],
  // #2 — back rank, deflect the lone defender with a check:
  //   White: Kg1, Qb3, Rd1 ; Black: Kg8, f7 g7 h7, Rd8 (the only back-rank defender, on d-file vs Rd1).
  //   1.Qxf7+!? Kxf7?? then no. messy. Try: White Qe6 pins?
  ['placeholder', '8/8/8/8/8/8/8/8 w - - 0 1', 'a1a1'],
]
// Only run the real first candidate:
{
  const fen='7k/8/5K2/8/8/8/8/R7 w - - 0 1'
  const m1='f6g6'
  const d=dump(fen,m1)
  note('M2 rook zugzwang 1.Kg6 (forced mate in 2)', d.r.ok, d.r.reason||'')
  // show: after 1.Kg6 the only black move is Kg8/Kh8->? king h8 -> g8 only (h7? Kg6 covers h7,g7,f7; h8->g8 legal). then Ra8#
  console.log('   after 1.Kg6 replies:', d.reps.join(',')||'(none -> would be stalemate!)')
}

// === Construct clean BACK-RANK M2 with a deflection sacrifice (authored, minimal) ===
// White: Kg1, Re1, Bb2(or Qa1) ; Black: Kg8, f7 g7 h7, Re8 defends e8.
// Idea: 1.Qa8 pins/attacks Re8? Let me test: White Qa1,Re1,Kg1 ; Black Kg8 f7g7h7 Re8.
{
  const fen='4r1k1/5ppp/8/8/8/8/8/Q3R1K1 w - - 0 1'
  // 1.Qxe8+? Rxe8?? no black rook is the one on e8. 1.Qa8 Rxa8 2.Re8#  (deflect/pin? Qa8 attacks Re8 along 8th)
  const m1='a1a8'
  const d=dump(fen,m1)
  note('M2 authored 1.Qa8! Rxa8 2.Re8# (deflection)', d.r.ok, d.r.reason||'')
  console.log('   after 1.Qa8 replies:', d.reps.join(','))
  // verify the headline line: Qa8 Rxa8 Re8#
  const s=fenLegal(fen); const a=applyUci(s.pos,m1); const b=applyUci(a.pos,'e8a8')
  note('   ...Rxa8 legal & Re8# mates', b.ok && isMateInOne(reFen(b.pos),'e1e8').ok)
}

// === Box-the-king M2 with queen, the king has flight then sealed ===
// White: Kc6, Qh1; Black: Ka7? Let's do: Black Ka8, White Kc7?? stalemate risk.
// Use: Black Kh8, White Kf7, Qa1: 1.Qa8+ Kh7 2.Qg8#? Qa8-g8? not a queen move from a8 to g8 is along 8th yes.
{
  const fen='7k/5K2/8/8/8/8/8/Q7 w - - 0 1'  // Kf7, Qa1 vs Kh8
  const m1='a1a8'  // Qa8+ Kh7? king h8 in check along 8th from a8; flights: h7 (Kf7 doesn't cover h7) -> Kh7. then Qg8#? Qa8-g8 Kh7->? Qg8+ Kh6 escapes. NOT M2.
  const d=dump(fen,m1)
  note('M2 try Kf7 Qa1 1.Qa8+ (expect NOT forced)', d.r.ok, d.r.reason||'(correctly not forced)')
}
// Better box M2: White Kg6, Qc2 vs Kg8 with NO luft pawns: 1.Qc8+ Kh... wait need to seal.
// White Kg6 covers f7,g7,h7,f8? no g6 covers f7,g7,h7. King g8 flights: f8,h8. 1.Qc8+ -> blocks? Kf8? Qc8 covers f8? c8-f8 yes along 8th. Kh8? covered? c8-h8 yes. So 1.Qc8 is MATE (M1). Not M2.
// To make M2: put the queen where it can't immediately reach the 8th rank with full cover.
// White Kg6, Qa6 vs Kg8: 1.Qe6+? no. 1.Q-> needs 8th. Qa6-a8? Qa8+ then Kg8 already... a8 checks along 8th, covers f8? a8-f8 yes, h8? a8-h8 yes => Qa8# M1 again.
// Lesson: with Kg6 vs Kg8 it's M1. For M2 the king must have an escape that you then seal => use a ROOK that needs two tempi, OR a farther king.

console.log(fails? `\n*** ${fails} FAILED ***`:'\nAUTHORED PROBE PASSED')
process.exit(fails?1:0)
