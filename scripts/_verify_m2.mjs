// Scratch verifier for mate-in-N analysis (chessops). Not part of the build.
import { parseFen, makeFen } from 'chessops/fen'
import { Chess } from 'chessops/chess'
import { parseUci, makeUci } from 'chessops/util'

function pos(fen) {
  const s = parseFen(fen)
  if (s.isErr) throw new Error('bad fen ' + fen)
  const p = Chess.fromSetup(s.unwrap())
  if (p.isErr) throw new Error('illegal pos ' + fen + ' :: ' + p.error)
  return p.unwrap()
}
function legalMoves(p) {
  const out = []
  const dests = p.allDests()
  for (const [from, squares] of dests) {
    for (const to of squares) {
      // handle promotions: just push queen promo if pawn reaching last rank
      const piece = p.board.get(from)
      const isPawn = piece && piece.role === 'pawn'
      const toRank = to >> 3
      if (isPawn && (toRank === 0 || toRank === 7)) {
        for (const role of ['queen', 'rook', 'bishop', 'knight']) out.push({ from, to, promotion: role })
      } else {
        out.push({ from, to })
      }
    }
  }
  return out
}
function isCheckmate(p) { return p.isCheckmate() }
function isStalemate(p) { return p.isStalemate() }

// Can the side to move force mate in <= n plies-of-its-own (mate in n moves)?
// Returns true if side-to-move (attacker) can mate in exactly within `n` full moves.
function attackerMatesIn(p, n) {
  if (n <= 0) return false
  for (const m of legalMoves(p)) {
    const c = p.clone(); c.play(m)
    if (c.isCheckmate()) return true
  }
  if (n === 1) return false
  // need a move such that for EVERY defender reply, attacker mates in n-1
  for (const m of legalMoves(p)) {
    const c = p.clone(); c.play(m)
    if (c.isCheckmate()) return true
    if (c.isStalemate() || c.isInsufficientMaterial()) continue
    const replies = legalMoves(c)
    if (replies.length === 0) continue
    let allLeadToMate = true
    for (const r of replies) {
      const d = c.clone(); d.play(r)
      if (!attackerMatesIn(d, n - 1)) { allLeadToMate = false; break }
    }
    if (allLeadToMate) return true
  }
  return false
}

// List every first move that forces mate-in-2 (i.e. after the move, for every
// reply, attacker mates in 1). Also flag moves that are immediate mate (m1).
function forcingM2FirstMoves(fen) {
  const p = pos(fen)
  const m1 = []
  const m2 = []
  const stalemateMoves = []
  for (const m of legalMoves(p)) {
    const c = p.clone(); c.play(m)
    if (c.isCheckmate()) { m1.push(makeUci(m)); continue }
    if (c.isStalemate()) { stalemateMoves.push(makeUci(m)); continue }
    if (c.isInsufficientMaterial()) continue
    const replies = legalMoves(c)
    if (replies.length === 0) continue
    let all = true
    for (const r of replies) {
      const d = c.clone(); d.play(r)
      // attacker must have a mate-in-1 against this reply
      const canMate = legalMoves(d).some((mm) => { const e = d.clone(); e.play(mm); return e.isCheckmate() })
      if (!canMate) { all = false; break }
    }
    if (all) m2.push(makeUci(m))
  }
  return { m1, m2, stalemateMoves }
}

// For a given first move, list the forced replies and whether each is then mate-able in 1.
function describeLine(fen, firstUci) {
  const p = pos(fen)
  const m = parseUci(firstUci)
  if (!m || !p.isLegal(m)) return { legal: false }
  const c = p.clone(); c.play(m)
  const info = { legal: true, check: c.isCheck(), checkmate: c.isCheckmate(), stalemate: c.isStalemate() }
  if (c.isCheckmate()) { info.replies = []; return info }
  const replies = legalMoves(c).map((r) => {
    const d = c.clone(); d.play(r)
    const mates = legalMoves(d).filter((mm) => { const e = d.clone(); e.play(mm); return e.isCheckmate() }).map(makeUci)
    return { reply: makeUci(r), matedBy: mates }
  })
  info.replies = replies
  return info
}

const cmd = process.argv[2]
const fen = process.argv[3]
if (cmd === 'm2') {
  console.log(JSON.stringify(forcingM2FirstMoves(fen), null, 2))
} else if (cmd === 'line') {
  console.log(JSON.stringify(describeLine(fen, process.argv[4]), null, 2))
} else if (cmd === 'legal') {
  try { pos(fen); console.log('LEGAL') } catch (e) { console.log('ILLEGAL: ' + e.message) }
} else if (cmd === 'matein') {
  const n = parseInt(process.argv[4], 10)
  console.log('attacker mates in <=' + n + ': ' + attackerMatesIn(pos(fen), n))
} else {
  console.log('usage: m2 <fen> | line <fen> <uci> | legal <fen> | matein <fen> <n>')
}
