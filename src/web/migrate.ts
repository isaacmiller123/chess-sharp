// Signed-out → account import (audit fix WEB-1). Everything a signed-out
// visitor builds up lives in localStorage (localData.ts / reviewStore.ts);
// before this fix, the first sign-in simply switched backends and all of it
// vanished from the UI.
//
// Policy:
//   SIGNUP  → import games (+ their cached reviews), custom variants and
//             settings into the brand-new account. A fresh account is empty by
//             definition, so the import cannot collide with server rows.
//   SIGN-IN → NO import: merging into an account that may already hold server
//             data is undecidable (duplicate games, diverged settings), so the
//             modal shows the "stays on this browser" note instead.
//   Ratings are never imported: the server account has its own Glicko-2 state
//   and there is no defensible way to merge two rating distributions.
//
// Local data is left untouched either way — signing out returns to it exactly
// as it was. Best-effort per item: one bad row (or a flaky request) skips that
// item and keeps going; the account is usable regardless.

import type { GameRow } from '@shared/types'
import { invoke, reviewSaveHttp } from './http'
import {
  listLocalSettingKeys,
  readGames,
  readLocalRating,
  readVariants,
  storageGet,
  SETTING_PREFIX
} from './localData'
import { localReviewStore } from './reviewStore'

export interface LocalProgressSummary {
  games: number
  variants: number
  settings: number
  ratedAttempts: number
  hasAny: boolean
}

/** What a signed-out visitor has accumulated on this browser (drives the
 *  sign-in modal's import/keep copy). */
export function localProgressSummary(): LocalProgressSummary {
  const games = readGames().rows.length
  const variants = Object.keys(readVariants()).length
  const settings = listLocalSettingKeys().length
  const ratedAttempts = readLocalRating('puzzle').attempts + readLocalRating('vs-bot').attempts
  return {
    games,
    variants,
    settings,
    ratedAttempts,
    hasAny: games > 0 || variants > 0 || ratedAttempts > 0
  }
}

export interface ImportResult {
  games: number
  reviews: number
  variants: number
  settings: number
  failures: number
}

/** Map a locally archived row back to the games:save wire shape. The per-side
 *  accuracy columns are intentionally omitted: games:save doesn't accept them
 *  (they're stamped server-side when a review is saved). For a game whose
 *  cached review still exists locally the review-save below restamps accuracy;
 *  for a game whose review was evicted past the 40-review LRU (games are kept
 *  to 500) the account row starts with blank accuracy until it is re-reviewed.
 *  Accepted minor gap — the PGN imports fully and accuracy is recomputable. */
function saveInputOf(g: GameRow): Record<string, unknown> {
  const input: Record<string, unknown> = { pgn: g.pgn }
  if (g.white_name != null) input.whiteName = g.white_name
  if (g.black_name != null) input.blackName = g.black_name
  if (g.user_color != null) input.userColor = g.user_color
  if (g.result != null) input.result = g.result
  if (g.opponent_kind != null) input.opponentKind = g.opponent_kind
  if (g.opponent_label != null) input.opponentLabel = g.opponent_label
  if (g.opponent_elo != null) input.opponentElo = g.opponent_elo
  if (g.source != null) input.source = g.source
  if (g.game_kind != null) input.gameKind = g.game_kind
  return input
}

/** One-time import of this browser's signed-out progress into the (fresh)
 *  account the session cookie now points at. Never rejects — the caller
 *  reloads into the account either way. */
export async function importLocalProgress(): Promise<ImportResult> {
  const result: ImportResult = { games: 0, reviews: 0, variants: 0, settings: 0, failures: 0 }

  // Games oldest-first so the account archive keeps the local ordering
  // (readGames rows are newest-first). Each game's cached review rides along
  // under its NEW server id, which also stamps the row's accuracy columns.
  const rows = [...readGames().rows].reverse()
  for (const g of rows) {
    try {
      const { gameId } = await invoke<{ gameId: number }>('games:save', saveInputOf(g))
      result.games++
      try {
        const { review } = await localReviewStore.load(g.id)
        if (review) {
          await reviewSaveHttp(gameId, { ...review, gameId })
          result.reviews++
        }
      } catch {
        result.failures++
      }
    } catch {
      result.failures++
    }
  }

  for (const v of Object.values(readVariants())) {
    try {
      await invoke('customVariants:save', {
        id: v.id,
        name: v.name,
        description: v.description,
        iniText: v.iniText,
        boardFiles: v.boardFiles,
        boardRanks: v.boardRanks
      })
      result.variants++
    } catch {
      result.failures++
    }
  }

  for (const key of listLocalSettingKeys()) {
    try {
      const raw = storageGet(SETTING_PREFIX + key)
      if (raw === null) continue
      await invoke('settings:set', { key, value: JSON.parse(raw) as unknown })
      result.settings++
    } catch {
      result.failures++
    }
  }

  return result
}
