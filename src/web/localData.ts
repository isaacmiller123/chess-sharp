// The logged-out local data layer (web port W3 — build contract AGENT-CLIENT).
//
// Everything the browser persists for a signed-OUT user lives here, in
// localStorage with an in-memory fallback (private-mode / quota failures must
// degrade to session-lifetime storage, never crash):
//   - the game archive        (W1 behavior, moved verbatim from webApi.ts)
//   - custom variants         (W1 behavior, moved verbatim from webApi.ts)
//   - settings                (key prefix only; logic stays in webApi.ts)
//   - LOCAL Glicko-2 ratings  (new in W3): puzzle + vs-bot, seeded 1200/350/
//     0.06 and updated with the SAME pure math as the desktop
//     (src/main/db/ratings.repo.ts → src/main/rating/glicko2.ts).
//
// Signed-in users never touch these: webApi routes their calls to the server
// bridge, and auth-state changes reload the page onto the other layer.

import type { CustomVariantRow, GameRow, PuzzleMode } from '@shared/types'
import { glicko2Update, type Glicko } from '../main/rating/glicko2'

// ---- storage primitives ---------------------------------------------------------

const memoryFallback = new Map<string, string>()

export function storageGet(key: string): string | null {
  try {
    const v = window.localStorage.getItem(key)
    // A value written to memoryFallback (setItem threw on quota) still reads
    // back as null from localStorage — fall through to memory so those writes
    // are never invisible (the signup import enumerates memory keys too).
    if (v !== null) return v
    return memoryFallback.get(key) ?? null
  } catch {
    return memoryFallback.get(key) ?? null
  }
}

export function storageSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    memoryFallback.set(key, value)
  }
}

export function storageRemove(key: string): void {
  memoryFallback.delete(key)
  try {
    window.localStorage.removeItem(key)
  } catch {
    // memory copy already gone
  }
}

export const SETTING_PREFIX = 'chess-sharp.setting.'
const VARIANTS_KEY = 'chess-sharp.customVariants'
const GAMES_KEY = 'chess-sharp.games'
const RATING_PREFIX = 'chess-sharp.rating.'

/** Setting keys (without the prefix) present in local storage — the signup
 *  import (migrate.ts) enumerates these to copy them into a fresh account. */
export function listLocalSettingKeys(): string[] {
  const keys = new Set<string>()
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i)
      if (k && k.startsWith(SETTING_PREFIX)) keys.add(k.slice(SETTING_PREFIX.length))
    }
  } catch {
    // storage unavailable — the memory fallback below still answers
  }
  for (const k of memoryFallback.keys()) {
    if (k.startsWith(SETTING_PREFIX)) keys.add(k.slice(SETTING_PREFIX.length))
  }
  return [...keys]
}

// ---- Local game archive (W1, unchanged semantics) --------------------------------
// Browser-resident stand-in for the desktop `game` table: finished OTB/online
// games land in the Library/Home lists instead of silently vanishing.
// Newest-first, capped so localStorage quota can't overflow (~2 KB/game).

export const GAMES_CAP = 500

export interface StoredGames {
  seq: number
  rows: GameRow[]
}

export function readGames(): StoredGames {
  const raw = storageGet(GAMES_KEY)
  if (!raw) return { seq: 0, rows: [] }
  try {
    const parsed = JSON.parse(raw) as StoredGames
    return { seq: parsed.seq ?? 0, rows: Array.isArray(parsed.rows) ? parsed.rows : [] }
  } catch {
    return { seq: 0, rows: [] }
  }
}

export function writeGames(store: StoredGames): void {
  storageSet(GAMES_KEY, JSON.stringify(store))
}

/** Mirror of desktop games.repo.setGameAccuracy: persist per-side review
 *  accuracy onto the archived row (Progress "accuracy" column). No-op when the
 *  row is gone (evicted past the cap). */
export function setLocalGameAccuracy(gameId: number, white: number, black: number): void {
  const store = readGames()
  const row = store.rows.find((g) => g.id === gameId)
  if (!row) return
  row.accuracy_white = white
  row.accuracy_black = black
  writeGames(store)
}

export function clearLocalGames(): void {
  storageRemove(GAMES_KEY)
}

// ---- Custom variants (W1, unchanged semantics) ------------------------------------

export function readVariants(): Record<string, CustomVariantRow> {
  const raw = storageGet(VARIANTS_KEY)
  if (!raw) return {}
  try {
    return JSON.parse(raw) as Record<string, CustomVariantRow>
  } catch {
    return {}
  }
}

export function writeVariants(map: Record<string, CustomVariantRow>): void {
  storageSet(VARIANTS_KEY, JSON.stringify(map))
}

// ---- Local Glicko-2 ratings (new in W3) --------------------------------------------
// Byte-for-byte the desktop math: db/ratings.repo.ts applies glicko2Update with
// opponent rd 50 / tau 0.3 for puzzles and rd 60 / tau 0.5 for vs-bot games,
// from the migration seed 1200/350/0.06. Attempt/solve counters ride along so
// the logged-out progress summary reports real local numbers.

export type LocalRatingKind = 'puzzle' | 'vs-bot'

export interface LocalRatingRecord extends Glicko {
  attempts: number
  solved: number
  lastAt: number | null
}

/** Desktop parity: getRating's unseeded default (db/ratings.repo.ts). */
export const RATING_SEED: Glicko = { rating: 1200, rd: 350, vol: 0.06 }

const num = (v: unknown, dflt: number): number => (typeof v === 'number' ? v : dflt)

export function readLocalRating(kind: LocalRatingKind): LocalRatingRecord {
  const raw = storageGet(RATING_PREFIX + kind)
  const seed: LocalRatingRecord = { ...RATING_SEED, attempts: 0, solved: 0, lastAt: null }
  if (!raw) return seed
  try {
    const p = JSON.parse(raw) as Partial<LocalRatingRecord>
    return {
      rating: num(p.rating, seed.rating),
      rd: num(p.rd, seed.rd),
      vol: num(p.vol, seed.vol),
      attempts: num(p.attempts, 0),
      solved: num(p.solved, 0),
      lastAt: typeof p.lastAt === 'number' ? p.lastAt : null
    }
  } catch {
    return seed
  }
}

function writeLocalRating(kind: LocalRatingKind, rec: LocalRatingRecord): void {
  storageSet(RATING_PREFIX + kind, JSON.stringify(rec))
}

export function resetLocalRating(kind: LocalRatingKind): void {
  storageRemove(RATING_PREFIX + kind)
}

/** Mirror of the desktop puzzles:attempt handler (ipc/puzzles.ipc.ts): only
 *  'train'/'daily' move the Glicko ladder; 'rush'/'custom' record the attempt
 *  but echo the puzzle rating with rd/delta 0. Returns the exact
 *  PuzzleAttemptResult shape (rounded like the desktop). */
export function recordLocalPuzzleAttempt(
  puzzleRating: number,
  solved: boolean,
  mode: PuzzleMode
): { ratingAfter: number; rd: number; delta: number } {
  const rec = readLocalRating('puzzle')
  const affectsRating = mode === 'train' || mode === 'daily'
  const after = affectsRating
    ? glicko2Update(rec, [{ rating: puzzleRating, rd: 50, score: solved ? 1 : 0 }], 0.3)
    : null
  writeLocalRating('puzzle', {
    rating: after?.rating ?? rec.rating,
    rd: after?.rd ?? rec.rd,
    vol: after?.vol ?? rec.vol,
    attempts: rec.attempts + 1,
    solved: rec.solved + (solved ? 1 : 0),
    lastAt: Date.now()
  })
  if (after) {
    return {
      ratingAfter: Math.round(after.rating),
      rd: Math.round(after.rd),
      delta: Math.round(after.rating - rec.rating)
    }
  }
  return { ratingAfter: puzzleRating, rd: 0, delta: 0 }
}

/** Mirror of desktop ratings.repo.applyGameResult (called by games:reportResult
 *  AFTER the nominal→measured Elo mapping, which the caller performs). */
export function recordLocalGameResult(
  ratedElo: number,
  score: number
): { ratingAfter: number; delta: number } {
  const rec = readLocalRating('vs-bot')
  const after = glicko2Update(rec, [{ rating: ratedElo, rd: 60, score }], 0.5)
  writeLocalRating('vs-bot', {
    rating: after.rating,
    rd: after.rd,
    vol: after.vol,
    attempts: rec.attempts + 1,
    solved: rec.solved,
    lastAt: Date.now()
  })
  return { ratingAfter: Math.round(after.rating), delta: Math.round(after.rating - rec.rating) }
}
