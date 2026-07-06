// Minimal chess-variant adapter over chessops for Local OTB play.
//
// TODO(P2): fold this into the real game kernel (GameSpec in
// src/renderer/src/games/kernel.ts) — init/legalMoves/play/result map 1:1
// onto the functions below; this file is intentionally shaped like a
// GameSpec<VariantState> implementation so migration is a rename.
import { makeFen } from 'chessops/fen'
import { defaultPosition, setupPosition } from 'chessops/variant'
import { chessgroundDests } from 'chessops/compat'
import { parseFen } from 'chessops/fen'
import { parseSquare, squareRank } from 'chessops/util'
import type { Position } from 'chessops/chess'
import type { Move, Rules } from 'chessops/types'
import type { Key } from 'chessground/types'
import type { GameResult } from '../../chess/chess'

export interface VariantState {
  pos: Position
  rules: Rules
  chess960: boolean
}

export interface VariantOutcome {
  result: GameResult
  reason: string
}

/** Fisher–Yates shuffle of the 960 back rank (bishops on opposite colors,
 *  king between rooks) → Shredder-FEN start position. */
export function generate960Fen(): string {
  const rank: string[] = new Array<string>(8).fill('')
  const empty = (): number[] => rank.map((p, i) => (p === '' ? i : -1)).filter((i) => i >= 0)
  const pick = (squares: number[]): number => squares[Math.floor(Math.random() * squares.length)]
  // Bishops on opposite colors
  rank[pick([0, 2, 4, 6])] = 'b'
  rank[pick([1, 3, 5, 7])] = 'b'
  // Queen + knights anywhere free
  rank[pick(empty())] = 'q'
  rank[pick(empty())] = 'n'
  rank[pick(empty())] = 'n'
  // Rook–king–rook fill the remaining three squares left-to-right
  const rest = empty()
  rank[rest[0]] = 'r'
  rank[rest[1]] = 'k'
  rank[rest[2]] = 'r'
  const back = rank.join('')
  const rooks = rest.filter((i) => rank[i] === 'r')
  const files = 'abcdefgh'
  const castling =
    rooks.map((i) => files[i].toUpperCase()).join('') + rooks.map((i) => files[i]).join('')
  return `${back}/pppppppp/8/8/8/8/PPPPPPPP/${back.toUpperCase()} w ${castling} - 0 1`
}

/** Fresh game state for a catalog kind. */
export function initVariant(kind: string, rules: Rules): VariantState {
  if (kind === 'chess960') {
    const setup = parseFen(generate960Fen()).unwrap()
    return { pos: setupPosition('chess', setup).unwrap(), rules: 'chess', chess960: true }
  }
  return { pos: defaultPosition(rules), rules, chess960: false }
}

export function variantFen(s: VariantState): string {
  return makeFen(s.pos.toSetup())
}

export function variantDests(s: VariantState): Map<Key, Key[]> {
  return chessgroundDests(s.pos, { chess960: s.chess960 }) as Map<Key, Key[]>
}

export function variantTurn(s: VariantState): 'white' | 'black' {
  return s.pos.turn
}

export function variantCheck(s: VariantState): 'white' | 'black' | undefined {
  return s.pos.isCheck() ? s.pos.turn : undefined
}

/** Play orig→dest (must already be in variantDests). Returns the new state.
 *  TODO(P2): promotion picker — auto-queens for now (antichess king
 *  promotion and underpromotion tricks land with the kernel UI). */
export function variantPlay(s: VariantState, orig: Key, dest: Key): VariantState | null {
  const from = parseSquare(orig)
  const to = parseSquare(dest)
  if (from === undefined || to === undefined) return null
  const piece = s.pos.board.get(from)
  if (!piece) return null
  const promotes = piece.role === 'pawn' && (squareRank(to) === 0 || squareRank(to) === 7)
  const move: Move = promotes ? { from, to, promotion: 'queen' } : { from, to }
  if (!s.pos.isLegal(move, s.pos.ctx())) return null
  const pos = s.pos.clone()
  pos.play(move)
  return { ...s, pos }
}

export function variantOutcome(s: VariantState): VariantOutcome | null {
  if (!s.pos.isEnd()) return null
  const oc = s.pos.outcome()
  const result: GameResult =
    oc?.winner === 'white' ? '1-0' : oc?.winner === 'black' ? '0-1' : '1/2-1/2'
  let reason = 'Game over'
  if (s.pos.isCheckmate()) reason = 'Checkmate'
  else if (s.pos.isStalemate()) reason = 'Stalemate'
  else if (s.pos.isInsufficientMaterial()) reason = 'Insufficient material'
  else if (s.pos.isVariantEnd()) reason = 'Variant win'
  return { result, reason }
}
