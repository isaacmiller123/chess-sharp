// Game registry — docs/GAMES-PLATFORM-SPEC.md §Architecture.
//
// kind → GameSpec + lazy 2D renderer + bot provider id + manual id. Everything
// (library UI, online wire v4, OTB, bots) consumes games through THIS module
// only; nothing else may import per-game rule adapters directly.

import type { ComponentType } from 'react'
import type { GameKind, GameSpec } from './kernel'
import { CHESS_VARIANT_SPECS } from './chessVariants'

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
// TODO(P2): register ffish family (xiangqi/shogi/janggi/makruk/placement),
// go, checkers, and the small hand-rolled games here.

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
