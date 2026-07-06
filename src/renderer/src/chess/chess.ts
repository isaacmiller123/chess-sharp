// Thin wrapper over chessops for the renderer: legality, SAN, dests for chessground.
import { Chess } from 'chessops/chess'
import { parseFen, makeFen, INITIAL_FEN } from 'chessops/fen'
import { makeSan } from 'chessops/san'
import { makeUci, opposite, parseSquare } from 'chessops/util'
import { chessgroundDests } from 'chessops/compat'
import type { Move, Role } from 'chessops/types'
import type { Key } from 'chessground/types'

export { INITIAL_FEN }
export type Color = 'white' | 'black'

export function position(fen: string): Chess {
  return Chess.fromSetup(parseFen(fen).unwrap()).unwrap()
}

export function destsFor(fen: string): Map<Key, Key[]> {
  return chessgroundDests(position(fen))
}

export function turnColor(fen: string): Color {
  return position(fen).turn
}

export function checkColor(fen: string): Color | undefined {
  const pos = position(fen)
  return pos.isCheck() ? pos.turn : undefined
}

/**
 * Whether `color` has insufficient material to force mate in this position
 * (chessops FIDE rule). Used by online timeout adjudication: a flag falls to a
 * DRAW rather than a loss when the side still on the board can never mate.
 */
export function hasInsufficientMaterial(fen: string, color: Color): boolean {
  return position(fen).hasInsufficientMaterial(color)
}

export function isPromotion(fen: string, orig: string, dest: string): boolean {
  const pos = position(fen)
  const from = parseSquare(orig)
  const to = parseSquare(dest)
  if (from === undefined || to === undefined) return false
  const piece = pos.board.get(from)
  if (!piece || piece.role !== 'pawn') return false
  const rank = to >> 3
  return (piece.color === 'white' && rank === 7) || (piece.color === 'black' && rank === 0)
}

export interface AppliedMove {
  san: string
  uci: string
  fen: string
  capture: boolean
  check: boolean
}

export function applyMove(fen: string, orig: string, dest: string, promotion?: Role): AppliedMove | null {
  const pos = position(fen)
  const from = parseSquare(orig)
  const to = parseSquare(dest)
  if (from === undefined || to === undefined) return null
  const move: Move = { from, to, promotion }
  if (!pos.isLegal(move)) return null
  const san = makeSan(pos, move)
  pos.play(move)
  return {
    san,
    uci: makeUci(move),
    fen: makeFen(pos.toSetup()),
    capture: san.includes('x'),
    check: pos.isCheck()
  }
}

export function uciToLastMove(uci: string): [Key, Key] {
  return [uci.slice(0, 2) as Key, uci.slice(2, 4) as Key]
}

export type GameResult = '1-0' | '0-1' | '1/2-1/2'

export interface Outcome {
  over: boolean
  result?: GameResult
  reason?: 'checkmate' | 'stalemate' | 'insufficient material' | 'draw'
}

export function outcome(fen: string): Outcome {
  const pos = position(fen)
  if (!pos.isEnd()) return { over: false }
  if (pos.isCheckmate()) {
    const winner = opposite(pos.turn)
    return { over: true, result: winner === 'white' ? '1-0' : '0-1', reason: 'checkmate' }
  }
  if (pos.isStalemate()) return { over: true, result: '1/2-1/2', reason: 'stalemate' }
  if (pos.isInsufficientMaterial()) return { over: true, result: '1/2-1/2', reason: 'insufficient material' }
  return { over: true, result: '1/2-1/2', reason: 'draw' }
}

// Convert a UCI PV (engine output) into SAN, walking from a FEN. Stops on the
// first illegal move (defensive) and returns what it parsed.
export function pvToSan(fen: string, uciMoves: string[], max = 12): string[] {
  const pos = position(fen)
  const out: string[] = []
  for (const uci of uciMoves.slice(0, max)) {
    const from = parseSquare(uci.slice(0, 2))
    const to = parseSquare(uci.slice(2, 4))
    if (from === undefined || to === undefined) break
    const promotion = uci.length > 4 ? charToRole(uci[4]) : undefined
    const move: Move = { from, to, promotion }
    if (!pos.isLegal(move)) break
    out.push(makeSan(pos, move))
    pos.play(move)
  }
  return out
}

function charToRole(c: string): Role | undefined {
  switch (c) {
    case 'q':
      return 'queen'
    case 'r':
      return 'rook'
    case 'b':
      return 'bishop'
    case 'n':
      return 'knight'
    default:
      return undefined
  }
}
