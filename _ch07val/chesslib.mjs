// Validation helpers built on chessops 0.15.
import { Chess, fen as F, parseUci, makeUci, parseSquare, makeSquare } from 'chessops'

export function parsePos(fenStr) {
  const setup = F.parseFen(fenStr)
  if (setup.isErr) return { err: 'fen-parse: ' + JSON.stringify(setup.error) }
  const pos = Chess.fromSetup(setup.value)
  if (pos.isErr) return { err: 'setup: ' + JSON.stringify(pos.error) }
  return { pos: pos.value }
}

export function fenLegal(fenStr) {
  const { pos, err } = parsePos(fenStr)
  if (err) return { ok: false, reason: err }
  return { ok: true, pos }
}

// all legal moves as UCI strings
export function legalUcis(pos) {
  const out = []
  const dests = pos.allDests()
  for (const [from, set] of dests) {
    for (const to of set) {
      // handle promotions: if a pawn reaches last rank, enumerate promo pieces
      const piece = pos.board.get(from)
      const toRank = to >> 3
      if (piece && piece.role === 'pawn' && (toRank === 7 || toRank === 0)) {
        for (const r of ['queen', 'rook', 'bishop', 'knight']) {
          out.push(makeUci({ from, to, promotion: r }))
        }
      } else {
        out.push(makeUci({ from, to }))
      }
    }
  }
  return out
}

export function moveLegal(pos, uci) {
  const ucis = new Set(legalUcis(pos))
  return ucis.has(uci)
}

// returns { ok, pos } applying uci, or { ok:false }
export function applyUci(pos, uci) {
  const move = parseUci(uci)
  if (!move) return { ok: false, reason: 'parse-uci ' + uci }
  if (!moveLegal(pos, uci)) return { ok: false, reason: 'illegal ' + uci }
  const np = pos.clone()
  np.play(move)
  return { ok: true, pos: np }
}

export function isMate(pos) { return pos.isCheckmate() }
export function isStalemate(pos) { return pos.isStalemate() }
export function isCheck(pos) { return pos.isCheck() }

// Verify that `firstUci` is a forced mate-in-2 (i.e. after firstUci, for EVERY
// legal opponent reply, the side has a mate-in-1). Returns {ok, reason}.
export function forcedMateInTwo(fenStr, firstUci) {
  const start = fenLegal(fenStr)
  if (!start.ok) return { ok: false, reason: 'start ' + start.reason }
  const a = applyUci(start.pos, firstUci)
  if (!a.ok) return { ok: false, reason: 'first move ' + a.reason }
  if (a.pos.isCheckmate()) return { ok: false, reason: 'first move is itself mate (mate-in-1, not 2)' }
  if (a.pos.isStalemate()) return { ok: false, reason: 'first move stalemates' }
  // opponent to move now; for every reply, we must have a mate in 1
  const replies = legalUcis(a.pos)
  if (replies.length === 0) return { ok: false, reason: 'no replies but not mate/stalemate?' }
  for (const r of replies) {
    const b = applyUci(a.pos, r)
    if (!b.ok) return { ok: false, reason: 'reply apply ' + b.reason }
    // now our move: is there a mating move?
    let found = false
    for (const m of legalUcis(b.pos)) {
      const c = applyUci(b.pos, m)
      if (c.ok && c.pos.isCheckmate()) { found = true; break }
    }
    if (!found) return { ok: false, reason: 'no mate-in-1 after reply ' + r }
  }
  return { ok: true }
}

// Verify a move is mate-in-1 (after the move, opponent is checkmated)
export function isMateInOne(fenStr, uci) {
  const start = fenLegal(fenStr)
  if (!start.ok) return { ok: false, reason: 'start ' + start.reason }
  const a = applyUci(start.pos, uci)
  if (!a.ok) return { ok: false, reason: a.reason }
  return { ok: a.pos.isCheckmate(), reason: a.pos.isCheckmate() ? '' : 'not mate after ' + uci }
}

export { makeUci, parseUci, parseSquare, makeSquare }
