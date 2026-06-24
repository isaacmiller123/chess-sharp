/**
 * Registry of available chess piece sets.
 *
 * `cburnett` is the chessground default (loaded in `main.tsx` via
 * `chessground/assets/chessground.cburnett.css`). The other sets are bundled
 * as scoped overrides in `src/renderer/src/styles/pieces.css`: applying the
 * wrapper class `pieces-<id>` on an ancestor of `.cg-wrap` swaps the pieces.
 *
 * All sets are open-licensed and redistributable. SVG sources live under
 * `resources/assets/piece/<id>/` (with per-set `LICENSE.txt`); they originate
 * from lichess-org/lila's `public/piece` directory.
 */

export interface PieceSet {
  /** Stable id; also the CSS wrapper suffix (`pieces-<id>`). */
  readonly id: string
  /** Human-facing label for the picker (no emojis, Title Case). */
  readonly label: string
  /** SPDX-ish license identifier for attribution surfaces. */
  readonly license: string
  /** Original author / attribution. */
  readonly author: string
}

/** All selectable piece sets, default first. */
export const PIECE_SETS: readonly PieceSet[] = [
  {
    id: 'cburnett',
    label: 'Cburnett',
    license: 'GPLv2+',
    author: 'Colin M.L. Burnett'
  },
  {
    id: 'merida',
    label: 'Merida',
    license: 'GPLv2+',
    author: 'Armando Hernandez Marroquin'
  },
  {
    id: 'chessnut',
    label: 'Chessnut',
    license: 'Apache-2.0',
    author: 'Alexis Luengas'
  }
] as const

/** Valid piece-set ids (e.g. for settings validation). */
export type PieceSetId = (typeof PIECE_SETS)[number]['id']

/** The default piece set id (chessground built-in). */
export const DEFAULT_PIECE_SET: PieceSetId = 'cburnett'

/** Set of all known ids, for O(1) membership checks. */
const PIECE_SET_IDS = new Set<string>(PIECE_SETS.map((s) => s.id))

/** Narrow an arbitrary string to a known {@link PieceSetId}, else the default. */
export function normalizePieceSet(id: string | null | undefined): PieceSetId {
  return id && PIECE_SET_IDS.has(id) ? (id as PieceSetId) : DEFAULT_PIECE_SET
}

/** The CSS wrapper class to place on a board ancestor for a given set. */
export function pieceSetClass(id: string | null | undefined): string {
  return `pieces-${normalizePieceSet(id)}`
}

/** Look up a set's metadata (falls back to the default set). */
export function getPieceSet(id: string | null | undefined): PieceSet {
  const wanted = normalizePieceSet(id)
  return PIECE_SETS.find((s) => s.id === wanted) ?? PIECE_SETS[0]
}
