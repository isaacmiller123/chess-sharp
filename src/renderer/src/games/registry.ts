// Game registry — docs/GAMES-PLATFORM-SPEC.md §Architecture.
//
// kind → GameSpec + lazy 2D renderer + bot provider id + manual id. Everything
// (library UI, online wire v4, OTB, bots) consumes games through THIS module
// only; nothing else may import per-game rule adapters directly.

import type { ComponentType } from 'react'
import type { GameKind, GameSpec } from './kernel'
import { CHESS_VARIANT_SPECS } from './chessVariants'
import { AMERICAN_CHECKERS_SPEC, INTL_CHECKERS_SPEC } from './checkers'
import { FFISH_VARIANT_SPECS } from './ffishVariants'
import { GO_SPEC } from './go'
import { GOMOKU_SPEC } from './gomoku'
import { OTHELLO_SPEC } from './small/othello'
import { CONNECT4_SPEC } from './small/connect4'
import { HEX_SPEC } from './small/hex'
import { MORRIS_SPEC } from './small/morris'
import { TICTACTOE_SPEC } from './small/tictactoe'

/**
 * Props every game's 2D board component accepts. The renderer is presentation
 * only: it never validates rules — it proposes `onMove(uci)` and the owner
 * (store/session) answers by advancing state through the spec.
 * TODO(P2): extend with lastMove/premove/interactivity flags as the chess
 * board component gets genericized.
 */
export interface GameBoardProps {
  kind: GameKind
  /** Opaque spec state (GameSpec<S>'s S) — the component narrows it. */
  state: unknown
  orientation: 'white' | 'black'
  interactive: boolean
  onMove(move: string): void
}

export type GameRendererLoader = () => Promise<{ default: ComponentType<GameBoardProps> }>

export interface GameEntry<S = unknown> {
  spec: GameSpec<S>
  /** Lazy 2D board renderer (React.lazy-compatible). */
  loadRenderer: GameRendererLoader
  /**
   * Bot backend id, resolved by games/bots.ts (TODO(P2)):
   * 'fairy-stockfish' → engine ipc; 'stockfish' additionally offers Maia
   * styles for kind === 'chess'. Non-chess families get their own providers
   * in P2 ('katago', 'rapid-draughts', 'worker:<game>').
   */
  botProviderId: string
  /** resources/manuals/<manualId>.md (authored in P2 for the full library). */
  manualId: string
  /**
   * True when the spec's rules engine loads asynchronously (ffish WASM):
   * await `spec.preload()` before init/legalMoves/play/result/moveMeta —
   * they throw a clear error until it resolves.
   */
  requiresPreload?: boolean
}

// TODO(P2): real renderers. All chess-family kinds will share one chessgroundx
// component parameterized by kind (drops UI for crazyhouse).
const placeholderRenderer: GameRendererLoader = () => import('./PlaceholderBoard')

function chessFamilyEntry(spec: GameSpec<unknown> | undefined, kind: GameKind): GameEntry {
  if (!spec) throw new Error(`missing chess-variant spec: ${kind}`)
  return {
    spec,
    loadRenderer: placeholderRenderer,
    botProviderId: kind === 'chess' ? 'stockfish' : 'fairy-stockfish',
    manualId: kind
  }
}

const CHESS_FAMILY_KINDS = [
  'chess',
  'chess960',
  'crazyhouse',
  'atomic',
  'antichess',
  'kingofthehill',
  'threecheck',
  'horde',
  'racingkings'
] as const

const REGISTRY: Partial<Record<GameKind, GameEntry>> = Object.fromEntries(
  CHESS_FAMILY_KINDS.map((kind) => [
    kind,
    chessFamilyEntry(CHESS_VARIANT_SPECS[kind] as GameSpec<unknown> | undefined, kind)
  ])
)
REGISTRY.go = {
  spec: GO_SPEC as GameSpec<unknown>,
  loadRenderer: () => import('./boards/GoBoard'),
  botProviderId: 'katago',
  manualId: 'go'
}
REGISTRY.gomoku = {
  spec: GOMOKU_SPEC as GameSpec<unknown>,
  // TODO(P2w2): dedicated gomoku board (Shudan signMap works for it too —
  // see gomokuSignMapOf in games/gomoku.ts).
  loadRenderer: placeholderRenderer,
  botProviderId: 'worker:gomoku',
  manualId: 'gomoku'
}
// ffish family (P2): rules via Fairy-Stockfish WASM — async init, so consumers
// must await entry.spec.preload() before first use (requiresPreload).
const FFISH_FAMILY_KINDS = ['xiangqi', 'shogi', 'janggi', 'makruk', 'placement'] as const
for (const kind of FFISH_FAMILY_KINDS) {
  const spec = FFISH_VARIANT_SPECS[kind] as GameSpec<unknown> | undefined
  if (!spec) throw new Error(`missing ffish-variant spec: ${kind}`)
  REGISTRY[kind] = {
    spec,
    loadRenderer: placeholderRenderer,
    botProviderId: 'fairy-stockfish',
    manualId: kind,
    requiresPreload: true
  }
}
// Small hand-rolled games (games/small/): rules + bots are P2 wave 1, real
// renderers are P2 wave 2 (placeholder for now). Bots resolve in-process via
// games/small/bots.ts SMALL_BOTS ('worker:<kind>' ids — the actual worker
// wrapper is P2w2 if any level needs it).
const SMALL_GAME_SPECS = [OTHELLO_SPEC, CONNECT4_SPEC, HEX_SPEC, MORRIS_SPEC, TICTACTOE_SPEC]
for (const spec of SMALL_GAME_SPECS) {
  REGISTRY[spec.kind] = {
    spec: spec as GameSpec<unknown>,
    loadRenderer: placeholderRenderer,
    botProviderId: `worker:${spec.kind}`,
    manualId: spec.kind
  }
}
// Checkers (P2): American over rapid-draughts (its alphaBeta is the bot
// backend, per spec §Bots), international over @jortvl/draughts (audited —
// see games/checkers.ts header). Draughtsground renderer is P2 wave 2.
REGISTRY.checkers = {
  spec: AMERICAN_CHECKERS_SPEC as GameSpec<unknown>,
  loadRenderer: placeholderRenderer,
  botProviderId: 'rapid-draughts',
  manualId: 'checkers'
}
REGISTRY['checkers-intl'] = {
  spec: INTL_CHECKERS_SPEC as GameSpec<unknown>,
  loadRenderer: placeholderRenderer,
  botProviderId: 'worker:checkers-intl',
  manualId: 'checkers-intl'
}

export function getGame(kind: GameKind): GameEntry | undefined {
  return REGISTRY[kind]
}

/** Registered (playable) games, in library display order. */
export function listGames(): GameEntry[] {
  return Object.values(REGISTRY)
}

export function isRegisteredGame(kind: string): kind is GameKind {
  return kind in REGISTRY
}
