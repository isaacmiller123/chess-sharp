import { fenLegal, isMateInOne, forcedMateInTwo, applyUci, legalUcis, isMate, isStalemate } from './chesslib.mjs'

let pass = 0, fail = 0
function check(label, cond) {
  if (cond) { pass++; console.log('  OK  ', label) }
  else { fail++; console.log('  FAIL', label) }
}

// 1. legal FEN
check('startpos legal', fenLegal('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1').ok)
// 2. illegal FEN (two white kings) should be rejected
check('two white kings illegal', !fenLegal('4k3/8/8/8/8/8/8/K3K3 w - - 0 1').ok)
// 3. mate-in-1: Qa8# back rank
check('Qa8# is mate-in-1', isMateInOne('6k1/5ppp/8/8/8/8/8/Q5K1 w - - 0 1', 'a1a8').ok)
// 4. NOT mate-in-1: Ra4 quiet
check('Ra4 is NOT mate', !isMateInOne('6k1/5ppp/8/8/8/8/R7/6K1 w - - 0 1', 'a2a4').ok)
// 5. promotion mate e8=Q#
check('e8=Q# mate-in-1', isMateInOne('6k1/4P3/6K1/8/8/8/8/8 w - - 0 1', 'e7e8q').ok)
// 6. A classic mate-in-2: White Qb6 then mate. Position: black Ka8, white Kc6, Qd1.
//    1.Qd5+? not forced. Use a clean known M2:
//    White: Kg6, Rf1, vs Kg8.  1.Rf8+ Kxf8?? no... let's use a proper one.
//    Known M2: "8/8/8/8/8/5K1k/8/7R w" -> 1.Rh... Actually let me use Anderssen-style.
//    Simpler verified M2: White Kf6, Qg7+? that's M1.
//    Use: black king h8, white Kf7, Qa1. 1.Qa8+? Kh7 2.?? no.
//    Reliable M2: White: Ka1, Qh7, Rg1; black Kh8? messy. Trust the engine instead:
const m2fen = '7k/8/5K2/8/8/8/8/5R2 w - - 0 1' // Kf6, Rf1 vs Kh8: 1.Rf8+? Kh7 escapes -> not M2 with f8
// instead test a guaranteed M2 where first is a quiet/king move forcing zugzwang+mate:
// White Kg6, Qf7? M1. We'll validate real M2s later from the DB; here just test the logic:
// Construct: White to move, 1.Qg6+ Kh8 2.Qg7# . Position before: Bk h8/g8?
// Use: black Kh8, pawns g7 h7; white Qa1, Kf6? Then 1.Qa8+ Kxa8 no.
// Logic test with a 2-move forced mate built by hand:
//   White: Kf6, Qb2; black: Kh8.  1.Qh2+ Kg8 2.Qh7#? Kg8->? Qh7+ Kf8 escapes. not forced.
// Let me just assert forcedMateInTwo correctly REJECTS a mate-in-1 dressed up:
check('Qa8# rejected as M2 (it is M1)', !forcedMateInTwo('6k1/5ppp/8/8/8/8/8/Q5K1 w - - 0 1', 'a1a8').ok)

console.log(`\nself-test: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
