import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { Chess } from 'chessops/chess'
import { makeFen } from 'chessops/fen'
import { makeSan, parseSan } from 'chessops/san'
import { makeUci } from 'chessops/util'

// Famous-games library backed by the committed resources/famous/games.json.
// The file holds only public-domain move records (SAN movetext); no copyrighted
// annotations are bundled. Coaching/commentary for a famous game is produced at
// view time by the existing review engine, not stored here.
//
// Loaded lazily and cached for the process, mirroring openings.repo.ts. The JSON
// is the single source of truth; ids are stable, human-readable slugs. The
// movetext is validated offline by scripts/build-famous.mjs.

/** Era / theme bucket used for grouping in the UI. */
export type FamousGroup = 'romantic' | 'classical' | 'modern'

/** Result of a famous game in PGN tag form. */
export type FamousResult = '1-0' | '0-1' | '1/2-1/2' | '*'

/** Metadata for one famous game (no moves) — what `list` returns per game. */
export interface FamousGameMeta {
  id: string
  white: string
  black: string
  event: string
  year: number
  result: FamousResult
  eco?: string
  group: FamousGroup
  /** Number of half-moves (plies) in the game. */
  plies: number
}

/** A single move of a famous game, pre-expanded for the renderer/board. */
export interface FamousMove {
  /** 1-based ply index. */
  ply: number
  /** Side that played this move. */
  color: 'white' | 'black'
  /** Standard Algebraic Notation, e.g. "Nf3", "O-O", "Rd8#". */
  san: string
  /** Long algebraic / UCI move, e.g. "g1f3", "e7e8q". */
  uci: string
  /** FEN of the position *before* the move was played. */
  fenBefore: string
  /** FEN of the position *after* the move was played. */
  fenAfter: string
}

/** Full payload for one game — metadata plus the expanded move list. */
export interface FamousGameDetail {
  game: FamousGameMeta
  moves: FamousMove[]
}

interface RawGame {
  id: string
  white: string
  black: string
  event: string
  year: number
  result: string
  eco?: string
  group: string
  pgnMoves: string | string[]
}

interface RawFile {
  version?: number
  note?: string
  games: RawGame[]
}

const VALID_GROUPS: ReadonlySet<string> = new Set<FamousGroup>(['romantic', 'classical', 'modern'])
const VALID_RESULTS: ReadonlySet<string> = new Set<FamousResult>(['1-0', '0-1', '1/2-1/2', '*'])

let cache: RawGame[] | null = null

function famousPath(): string {
  // Dev: the main bundle is out/main/index.js, so __dirname is <root>/out/main
  // and ../../resources resolves to the repo's resources dir (mirrors
  // src/main/db/database.ts and openings.repo.ts). Packaged: ships under
  // process.resourcesPath/famous (electron-builder extraResources).
  return app.isPackaged
    ? path.join(process.resourcesPath, 'famous', 'games.json')
    : path.join(__dirname, '../../resources/famous/games.json')
}

function load(): RawGame[] {
  if (cache) return cache
  try {
    const raw = fs.readFileSync(famousPath(), 'utf-8')
    const parsed = JSON.parse(raw) as RawFile
    cache = Array.isArray(parsed.games) ? parsed.games : []
  } catch {
    // Missing/corrupt data must not crash the app — treat as an empty library.
    cache = []
  }
  return cache
}

/** Split a SAN movetext string into bare SAN tokens (numbers/results stripped). */
function tokenizeMoves(pgnMoves: string | string[]): string[] {
  if (Array.isArray(pgnMoves)) return pgnMoves.filter(Boolean)
  return pgnMoves
    .replace(/\d+\.(\.\.)?/g, ' ') // move numbers "12." / "12..."
    .replace(/\b(?:1-0|0-1|1\/2-1\/2|\*)\b/g, ' ') // result token
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}

function toGroup(g: string): FamousGroup {
  return VALID_GROUPS.has(g) ? (g as FamousGroup) : 'classical'
}

function toResult(r: string): FamousResult {
  return VALID_RESULTS.has(r) ? (r as FamousResult) : '*'
}

function toMeta(g: RawGame): FamousGameMeta {
  return {
    id: g.id,
    white: g.white,
    black: g.black,
    event: g.event,
    year: g.year,
    result: toResult(g.result),
    eco: g.eco,
    group: toGroup(g.group),
    plies: tokenizeMoves(g.pgnMoves).length
  }
}

/**
 * List famous-game metadata, optionally filtered by era/theme group. Results are
 * ordered by year then id so the UI is stable across calls.
 */
export function list(opts?: { group?: string }): FamousGameMeta[] {
  const wanted = opts?.group
  return load()
    .filter((g) => !wanted || g.group === wanted)
    .map(toMeta)
    .sort((a, b) => a.year - b.year || a.id.localeCompare(b.id))
}

/**
 * Fetch one famous game by id, expanding its SAN movetext into a per-ply move
 * list with before/after FENs and UCI strings. Returns null if the id is
 * unknown or the stored movetext is not fully legal (should never happen — the
 * dataset is validated offline by scripts/build-famous.mjs).
 */
export function get(id: string): FamousGameDetail | null {
  const raw = load().find((g) => g.id === id)
  if (!raw) return null

  const sans = tokenizeMoves(raw.pgnMoves)
  const pos = Chess.default()
  const moves: FamousMove[] = []

  for (let i = 0; i < sans.length; i++) {
    const move = parseSan(pos, sans[i])
    if (!move) return null // illegal/ambiguous SAN — bail rather than emit garbage

    const fenBefore = makeFen(pos.toSetup())
    const color: 'white' | 'black' = pos.turn
    // Canonicalise the SAN we expose (handles +/# and disambiguation cleanly).
    const san = makeSan(pos, move)
    const uci = makeUci(move)
    pos.play(move)

    moves.push({ ply: i + 1, color, san, uci, fenBefore, fenAfter: makeFen(pos.toSetup()) })
  }

  return { game: toMeta(raw), moves }
}
