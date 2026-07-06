// Online game-kernel seam (spec §Architecture / §Wire-v4). The onlineStore is
// game-agnostic: it keeps `moves: string[]` + an opaque `gameState` and consults
// a registered OnlineGameAdapter for EVERYTHING rules-shaped (apply a move,
// detect a terminal position, whose turn it is). Chess is the built-in default
// (chessAdapter.ts) so existing online chess is behaviorally untouched.
//
// NOTE: this is the STORE-side seam, kept in features/play/online/ because
// builder-kernel owns src/renderer/src/games/. TODO(P2): once games/kernel.ts +
// games/registry.ts land, re-export this interface from (or replace it with) the
// kernel's GameSpec and have registerOnlineGameAdapter consume the registry, so
// every registered game is automatically playable online.
//
// Like the store, this module must run in BARE NODE (scripts/test-mp-store.mjs):
// no React, no Vite-only imports.

import type { MpColor } from '@shared/types'
import type { GameResult } from '../../../chess/chess'

/** Presentation metadata for one applied move (sound + notation). Games without
 *  SAN-style notation may echo the move string as `san`. */
export interface OnlineMoveMeta {
  san: string
  capture: boolean
  check: boolean
}

/** What the store needs from a game to run it online. `S` is the game's own
 *  immutable state snapshot (chess: a FEN string). All move strings are the
 *  game's canonical codec — the same opaque strings that ride the v4 wire. */
export interface OnlineGameAdapter<S = unknown> {
  /** Registry key; matches MpGameConfig.game.kind ('chess' when absent). */
  kind: string
  /** Fresh initial state for the (game-defined, JSON-round-tripped) options. */
  init(options?: unknown): S
  /** Apply one canonical move string; null = illegal in `s`. */
  play(s: S, move: string): S | null
  /** Terminal check; null = game still ongoing. */
  result(s: S): { result: GameResult; reason: string } | null
  /** Which side is to move in `s` (maps onto the wire's white/black seats). */
  turn(s: S): MpColor
  /** Opaque render/position key the UI board consumes (chess: the FEN). */
  positionKey(s: S): string
  /** Metadata for playing `move` in `s` (assumed legal). null = unknown. */
  moveMeta(s: S, move: string): OnlineMoveMeta | null
}

// Type-erased registry. Adapters are registered by kind; the store resolves the
// adapter for a game config at start. Only 'chess' registers in P1.
const adapters = new Map<string, OnlineGameAdapter<unknown>>()

export function registerOnlineGameAdapter<S>(adapter: OnlineGameAdapter<S>): void {
  adapters.set(adapter.kind, adapter as OnlineGameAdapter<unknown>)
}

/** Resolve the adapter for a game kind (undefined kind = chess). Returns null
 *  when this build has no kernel for it — the store surfaces a friendly error
 *  instead of corrupting state. */
export function resolveOnlineGameAdapter(kind: string | undefined): OnlineGameAdapter<unknown> | null {
  return adapters.get(kind ?? 'chess') ?? null
}
