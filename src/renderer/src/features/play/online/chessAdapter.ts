// The default (and P1-only) OnlineGameAdapter: standard chess via the existing
// chessops helpers. State S = FEN string; move codec = UCI. Extracting the
// store's previous inline chessops usage behind the adapter seam keeps online
// chess byte-for-byte behavioral while letting other games register later.
//
// TODO(P2): builder-kernel's games/registry.ts should become the single source
// of adapters (this file then just wraps the chess GameSpec, or disappears).
// Must stay bare-node clean (scripts/test-mp-store.mjs bundles it).

import type { MpColor } from '@shared/types'
import { applyMove, outcome, turnColor, INITIAL_FEN } from '../../../chess/chess'
import type { OnlineGameAdapter, OnlineMoveMeta } from './gameAdapter'

function uciPromo(uci: string): 'queen' | 'rook' | 'bishop' | 'knight' | undefined {
  switch (uci[4]) {
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

export const chessOnlineAdapter: OnlineGameAdapter<string> = {
  kind: 'chess',

  // Chess has no start options (TODO(P2): chess960 seed etc. would land here).
  init(): string {
    return INITIAL_FEN
  },

  play(fen: string, move: string): string | null {
    const m = applyMove(fen, move.slice(0, 2), move.slice(2, 4), uciPromo(move))
    return m ? m.fen : null
  },

  result(fen: string): { result: '1-0' | '0-1' | '1/2-1/2'; reason: string } | null {
    const out = outcome(fen)
    if (!out.over || !out.result) return null
    return { result: out.result, reason: out.reason ?? 'checkmate' }
  },

  turn(fen: string): MpColor {
    return turnColor(fen)
  },

  positionKey(fen: string): string {
    return fen
  },

  moveMeta(fen: string, move: string): OnlineMoveMeta | null {
    const m = applyMove(fen, move.slice(0, 2), move.slice(2, 4), uciPromo(move))
    return m ? { san: m.san, capture: m.capture, check: m.check } : null
  }
}
