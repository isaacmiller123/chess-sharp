// Full-game review: walk a game's mainline, analyze each position once with a
// single Stockfish at a fixed depth (MultiPV 2), and compute per-move Win% /
// Accuracy / classification, per-side accuracy + ACPL, an estimated-Elo band, and
// a coach hook for each critical move. Results are cached to app.sqlite.
//
// content-coaching.md is authoritative for all formulas/thresholds; architecture.md
// §6 for the engine contract. This module owns its own DB tables (game_review,
// move_eval) created lazily with CREATE TABLE IF NOT EXISTS — it does NOT touch the
// shared migration. It stays decoupled from the coach: it returns enough per-move
// data for the renderer to call coach:explainMove later (or for a coach module to
// consume directly), rather than importing the coach itself.

import { Chess } from 'chessops/chess'
import { parseFen, makeFen, INITIAL_FEN } from 'chessops/fen'
import { makeSan, parseSan } from 'chessops/san'
import { parseUci, makeUci } from 'chessops/util'
import { parsePgn, startingPosition } from 'chessops/pgn'
import type { Move, Role } from 'chessops/types'
import { UciEngine, type InfoLine } from '../engine/UciEngine'
import { stockfishPath } from '../engine/paths'
import { getAppDb } from '../db/database'
import {
  winPercent,
  winChances,
  moveAccuracy,
  gameAccuracy,
  acpl,
  reviewVerdict,
  mateTransition,
  classifyBadge,
  isSacrifice,
  PIECE_VALUE,
  type ReviewVerdict,
  type MoveBadge,
  type EvalScore
} from '../analysis/accuracy'
import { estimateElo, type EloBand } from '../analysis/estElo'

// ---- Public input/output shapes -------------------------------------------------

/** A mainline move as supplied by the renderer (or derived from a PGN). */
export interface ReviewMoveInput {
  san: string
  uci: string
  /** FEN of the position BEFORE this move (the position the mover faced). */
  fen: string
}

export interface RunReviewOptions {
  /** Pre-parsed mainline moves. Provide this OR `pgn`. */
  moves?: ReviewMoveInput[]
  /** A PGN string; the mainline is extracted and analyzed. */
  pgn?: string
  /** Fixed analysis depth (architecture default ~16). */
  depth?: number
  /** Persist under this game id (enables review:get caching). */
  gameId?: number
  /** Progress callback: fired per analyzed ply. */
  onProgress?: (ply: number, total: number) => void
}

/** Engine eval at a position, from the side-to-move POV. */
export interface PovEval {
  cp: number | null
  mate: number | null
}

/** Per-move analysis result (mover POV throughout). */
export interface MoveEval {
  ply: number // 1-based half-move index
  color: 'white' | 'black'
  san: string
  uci: string
  fenBefore: string
  fenAfter: string
  bestUci: string
  bestSan: string
  /** Best line PV (uci moves), from the position before the move. */
  bestPv: string[]
  /** Second-best line first move (uci), if MultiPV>=2 produced one. */
  secondUci: string | null
  /** Engine eval of the best move, mover POV. */
  bestEval: PovEval
  /** Engine eval after the played move, mover POV. */
  playedEval: PovEval
  /** Win% before the move (best line), mover POV, 0..100. */
  winBefore: number
  /** Win% after the played move, mover POV, 0..100. */
  winAfter: number
  /** Per-move accuracy 0..100. */
  accuracy: number
  /** Centipawn loss (mover POV, capped per move). */
  cpLoss: number
  /** Win% drop on the 0..1 chances scale (POV-signed). */
  winChancesDrop: number
  /** Review verdict bucket. */
  verdict: ReviewVerdict
  /** Rich badge label. */
  badge: MoveBadge
  /** Whether the played move was the engine's best. */
  isBest: boolean
  /** Critical = a move worth a coach comment (inaccuracy+, or a notable badge). */
  critical: boolean
}

export interface SideSummary {
  accuracy: number
  acpl: number
  moves: number
  inaccuracies: number
  mistakes: number
  blunders: number
  best: number
}

export interface GameReview {
  gameId: number | null
  depth: number
  totalPlies: number
  white: SideSummary
  black: SideSummary
  whiteElo: EloBand
  blackElo: EloBand
  moveEvals: MoveEval[]
}

// ---- chessops helpers -----------------------------------------------------------

function posFromFen(fen: string): Chess {
  const setup = parseFen(fen).unwrap()
  return Chess.fromSetup(setup).unwrap()
}

function turnColor(pos: Chess): 'white' | 'black' {
  return pos.turn
}

/** Build the mainline move list (san/uci/fenBefore) from a PGN string. */
export function movesFromPgn(pgn: string): ReviewMoveInput[] {
  const games = parsePgn(pgn)
  if (games.length === 0) return []
  const game = games[0]
  const pos = startingPosition(game.headers).unwrap() as Chess
  const out: ReviewMoveInput[] = []
  let node = game.moves
  while (node.children.length > 0) {
    const child = node.children[0]
    const fenBefore = makeFen(pos.toSetup())
    const move = parseSan(pos, child.data.san)
    if (!move) break
    const uci = makeUci(move)
    const san = makeSan(pos, move)
    out.push({ san, uci, fen: fenBefore })
    pos.play(move)
    node = child
  }
  return out
}

// ---- Engine analysis of one position -------------------------------------------

interface MultiPvSnapshot {
  /** latest InfoLine per multipv index (1-based). */
  lines: Map<number, InfoLine>
}

/**
 * Analyze a single FEN to fixed depth with MultiPV 2; resolve once `bestmove`
 * arrives with the latest line per multipv index.
 */
function analyzeFen(engine: UciEngine, fen: string, depth: number, multipv: number): Promise<MultiPvSnapshot> {
  return new Promise((resolve) => {
    const lines = new Map<number, InfoLine>()
    const onInfo = (info: InfoLine): void => {
      const idx = info.multipv ?? 1
      if (info.pv && info.pv.length > 0) lines.set(idx, info)
    }
    const onBest = (): void => {
      engine.off('info', onInfo)
      resolve({ lines })
    }
    engine.on('info', onInfo)
    engine.once('bestmove', onBest)
    void engine.search(fen, { kind: 'depth', value: depth }, multipv)
  })
}

function infoToEval(info: InfoLine | undefined): PovEval {
  if (!info) return { cp: 0, mate: null }
  if (info.mate !== undefined) return { cp: null, mate: info.mate }
  return { cp: info.scoreCp ?? 0, mate: null }
}

/** Negate a side-to-move eval to express it from the opponent's POV. */
function negateEval(e: PovEval): PovEval {
  return {
    cp: e.cp != null ? -e.cp : null,
    mate: e.mate != null ? -e.mate : null
  }
}

function evalToScore(e: PovEval): EvalScore {
  return { cp: e.cp, mate: e.mate }
}

function evalWinPercent(e: PovEval): number {
  return winPercent(e.cp, e.mate)
}

// ---- Sacrifice PV inspection ----------------------------------------------------

/**
 * Walk the engine PV after the played move and collect captures (truncated to even
 * length) tagged by who captured, relative to the mover. Drives the §3.2 detector.
 */
function pvCaptures(
  fenAfterPlayed: string,
  pv: string[]
): { by: 'mover' | 'opp'; role: string }[] {
  const out: { by: 'mover' | 'opp'; role: string }[] = []
  let pos: Chess
  try {
    pos = posFromFen(fenAfterPlayed)
  } catch {
    return out
  }
  // In fenAfterPlayed it's the OPPONENT to move (the mover just moved). So ply 0 of
  // this PV is by 'opp', ply 1 by 'mover', etc.
  const even = pv.slice(0, pv.length - (pv.length % 2))
  for (let i = 0; i < even.length; i++) {
    const move = parseUci(even[i])
    if (!move) break
    const captured = capturedRole(pos, move)
    if (captured) {
      out.push({ by: i % 2 === 0 ? 'opp' : 'mover', role: captured })
    }
    if (!pos.isLegal(move)) break
    pos.play(move)
  }
  return out
}

/** Single-char value key ('p'/'n'/...) of the piece captured by `move`, or null. */
function capturedRole(pos: Chess, move: Move): string | null {
  if (!('to' in move)) return null
  const piece = pos.board.get(move.to)
  if (piece) return roleToValueChar(piece.role)
  // en passant: pawn capture to an empty ep square
  if ('from' in move) {
    const from = pos.board.get(move.from)
    if (from && from.role === 'pawn') {
      const fromFile = move.from & 7
      const toFile = move.to & 7
      if (fromFile !== toFile) return 'p'
    }
  }
  return null
}

function roleToValueChar(role: Role | string): string {
  switch (role) {
    case 'pawn':
      return 'p'
    case 'knight':
      return 'n'
    case 'bishop':
      return 'b'
    case 'rook':
      return 'r'
    case 'queen':
      return 'q'
    default:
      return 'k'
  }
}

/** Is the played move a recapture (it captures on the square the opponent just moved to)? */
function isRecapture(prevFen: string, playedUci: string, prevMoveUci: string | null): boolean {
  if (!prevMoveUci) return false
  const played = parseUci(playedUci)
  const prev = parseUci(prevMoveUci)
  if (!played || !prev || !('to' in played) || !('to' in prev)) return false
  if (played.to !== prev.to) return false
  // and it must actually be a capture
  try {
    const pos = posFromFen(prevFen)
    return capturedRole(pos, played) != null
  } catch {
    return false
  }
}

// ---- Critical-move detection ----------------------------------------------------

const CRITICAL_VERDICTS: ReviewVerdict[] = ['inaccuracy', 'mistake', 'blunder']
const NOTABLE_BADGES: MoveBadge[] = ['Brilliant', 'Great']

function isCritical(verdict: ReviewVerdict, badge: MoveBadge): boolean {
  return CRITICAL_VERDICTS.includes(verdict) || NOTABLE_BADGES.includes(badge)
}

// ---- Main entry -----------------------------------------------------------------

/**
 * Run a full-game review. Starts ONE Stockfish, analyzes every mainline position to
 * fixed depth with MultiPV 2, computes per-move metrics + per-side summaries + an
 * estimated-Elo band, caches to DB (if gameId given), and streams progress.
 */
export async function runReview(opts: RunReviewOptions): Promise<GameReview> {
  initReviewTables()

  const depth = opts.depth ?? 16
  const moves = opts.moves ?? (opts.pgn ? movesFromPgn(opts.pgn) : [])
  const total = moves.length

  const engine = new UciEngine(stockfishPath())
  const moveEvals: MoveEval[] = []

  try {
    await engine.start()
    engine.setOption('UCI_LimitStrength', false)
    engine.setOption('Threads', 1)
    engine.setOption('Hash', 128)
    engine.setOption('MultiPV', 2)
    await engine.newGame()

    let prevMoveUci: string | null = null

    for (let i = 0; i < total; i++) {
      const m = moves[i]
      const fenBefore = m.fen
      const beforePos = posFromFen(fenBefore)
      const color = turnColor(beforePos)

      // 1) Analyze the position the mover faced (mover POV = side-to-move).
      const snap = await analyzeFen(engine, fenBefore, depth, 2)
      const best = snap.lines.get(1)
      const second = snap.lines.get(2)
      const bestEval = infoToEval(best) // mover POV
      const bestPv = best?.pv ?? []
      const bestUci = bestPv[0] ?? m.uci
      const secondUci = second?.pv?.[0] ?? null

      // bestSan / fenAfter (after PLAYED move)
      const playedMove = parseUci(m.uci)
      let fenAfter = fenBefore
      let bestSan = bestUci
      try {
        const tmp = posFromFen(fenBefore)
        const bm = parseUci(bestUci)
        if (bm) bestSan = makeSan(tmp, bm)
      } catch {
        /* keep uci fallback */
      }

      // 2) Eval AFTER the played move. If the played move IS the best move, reuse
      //    bestEval. Otherwise evaluate the resulting position and negate to mover POV.
      let playedEval: PovEval
      let playedPv: string[] = bestPv
      const playedIsBest = bestUci === m.uci
      if (playedMove && beforePos.isLegal(playedMove)) {
        const afterPos = beforePos.clone()
        afterPos.play(playedMove)
        fenAfter = makeFen(afterPos.toSetup())
        if (afterPos.isCheckmate()) {
          // mover delivered mate
          playedEval = { cp: null, mate: 1 }
          playedPv = [m.uci]
        } else if (playedIsBest) {
          playedEval = bestEval
          playedPv = bestPv
        } else {
          const afterSnap = await analyzeFen(engine, fenAfter, depth, 1)
          const afterBest = afterSnap.lines.get(1)
          // afterBest is from the OPPONENT's POV (they are to move) -> negate.
          playedEval = negateEval(infoToEval(afterBest))
          playedPv = [m.uci, ...(afterBest?.pv ?? [])]
        }
      } else {
        // Illegal/unparseable played move: fall back to best (defensive).
        playedEval = bestEval
        fenAfter = fenBefore
      }

      // 3) Win% + accuracy + classification (all mover POV).
      const winBefore = evalWinPercent(bestEval)
      const winAfter = evalWinPercent(playedEval)
      const accuracy = moveAccuracy(winBefore, winAfter)

      const chancesBefore = winChances(bestEval.cp, bestEval.mate)
      const chancesAfter = winChances(playedEval.cp, playedEval.mate)
      const winChancesDrop = chancesBefore - chancesAfter

      // base verdict from chances delta; override with mate transition if any.
      let verdict = reviewVerdict(winChancesDrop)
      const mt = mateTransition(evalToScore(bestEval), evalToScore(playedEval))
      if (mt.severity) verdict = mt.severity

      // cp loss (mover POV), capped per move at 1000.
      const cpBefore = bestEval.mate != null ? Math.sign(bestEval.mate) * 1000 : (bestEval.cp ?? 0)
      const cpAfter = playedEval.mate != null ? Math.sign(playedEval.mate) * 1000 : (playedEval.cp ?? 0)
      const cpLoss = Math.max(0, Math.min(1000, cpBefore - cpAfter))

      // sacrifice + recapture detection for the badge.
      const caps = pvCaptures(fenAfter, playedPv.slice(1))
      const sac = isSacrifice(caps)
      const recap = isRecapture(fenBefore, m.uci, prevMoveUci)
      const secondWinMover = second ? evalWinPercent(infoToEval(second)) : null

      const forced = countLegalMoves(beforePos) <= 1

      const badge = classifyBadge({
        winDiff: winAfter - winBefore,
        winAfterMover: winAfter,
        winBeforeMover: winBefore,
        playedIsBest,
        forced,
        isRecapture: recap,
        isSacrifice: sac,
        secondBestWinMover: secondWinMover
      })

      const me: MoveEval = {
        ply: i + 1,
        color,
        san: m.san,
        uci: m.uci,
        fenBefore,
        fenAfter,
        bestUci,
        bestSan,
        bestPv,
        secondUci,
        bestEval,
        playedEval,
        winBefore,
        winAfter,
        accuracy,
        cpLoss,
        winChancesDrop,
        verdict,
        badge,
        isBest: playedIsBest,
        critical: isCritical(verdict, badge)
      }
      moveEvals.push(me)

      prevMoveUci = m.uci
      opts.onProgress?.(i + 1, total)
    }
  } finally {
    await engine.quit().catch(() => engine.kill())
  }

  const review = summarize(moveEvals, depth, opts.gameId ?? null)
  if (opts.gameId != null) persistReview(opts.gameId, review)
  return review
}

function countLegalMoves(pos: Chess): number {
  let n = 0
  const ctx = pos.ctx()
  for (const [, dests] of pos.allDests(ctx)) {
    n += dests.size()
    if (n > 1) return n
  }
  return n
}

// ---- Summaries ------------------------------------------------------------------

function summarize(moveEvals: MoveEval[], depth: number, gameId: number | null): GameReview {
  const whiteWin: number[] = []
  const blackWin: number[] = []
  // POV-relative Win% for the volatility window: store white-POV Win% per ply.
  const whitePovWin: number[] = []
  const blackPovWin: number[] = []
  const whiteIdx: number[] = []
  const blackIdx: number[] = []

  const whiteAcc: number[] = []
  const blackAcc: number[] = []
  const whiteLoss: number[] = []
  const blackLoss: number[] = []

  moveEvals.forEach((m, i) => {
    // winAfter is mover POV; white-POV value is winAfter (white) or 100-winAfter (black).
    const whitePov = m.color === 'white' ? m.winAfter : 100 - m.winAfter
    whitePovWin.push(whitePov)
    blackPovWin.push(100 - whitePov)
    if (m.color === 'white') {
      whiteAcc.push(m.accuracy)
      whiteLoss.push(m.cpLoss)
      whiteIdx.push(i)
      whiteWin.push(m.winAfter)
    } else {
      blackAcc.push(m.accuracy)
      blackLoss.push(m.cpLoss)
      blackIdx.push(i)
      blackWin.push(m.winAfter)
    }
  })

  const white = sideSummary(moveEvals, 'white', whiteAcc, whiteLoss, whitePovWin, whiteIdx)
  const black = sideSummary(moveEvals, 'black', blackAcc, blackLoss, blackPovWin, blackIdx)

  return {
    gameId,
    depth,
    totalPlies: moveEvals.length,
    white,
    black,
    whiteElo: estimateElo(white.accuracy, white.moves),
    blackElo: estimateElo(black.accuracy, black.moves),
    moveEvals
  }
}

function sideSummary(
  all: MoveEval[],
  color: 'white' | 'black',
  accs: number[],
  losses: number[],
  povWin: number[],
  idx: number[]
): SideSummary {
  const own = all.filter((m) => m.color === color)
  return {
    accuracy: Math.round(gameAccuracy(accs, povWin, idx) * 10) / 10,
    acpl: Math.round(acpl(losses)),
    moves: own.length,
    inaccuracies: own.filter((m) => m.verdict === 'inaccuracy').length,
    mistakes: own.filter((m) => m.verdict === 'mistake').length,
    blunders: own.filter((m) => m.verdict === 'blunder').length,
    best: own.filter((m) => m.isBest).length
  }
}

// ---- DB cache (own tables, CREATE TABLE IF NOT EXISTS) ---------------------------

let tablesReady = false

export function initReviewTables(): void {
  if (tablesReady) return
  getAppDb().exec(`
    CREATE TABLE IF NOT EXISTS game_review(
      game_id INTEGER PRIMARY KEY,
      depth INTEGER NOT NULL,
      total_plies INTEGER NOT NULL,
      accuracy_white REAL, accuracy_black REAL,
      acpl_white INTEGER, acpl_black INTEGER,
      white_inacc INTEGER, white_mist INTEGER, white_blun INTEGER, white_best INTEGER,
      black_inacc INTEGER, black_mist INTEGER, black_blun INTEGER, black_best INTEGER,
      est_elo_white INTEGER, est_elo_white_low INTEGER, est_elo_white_high INTEGER,
      est_elo_black INTEGER, est_elo_black_low INTEGER, est_elo_black_high INTEGER,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS move_eval(
      game_id INTEGER NOT NULL,
      ply INTEGER NOT NULL,
      color TEXT NOT NULL,
      san TEXT NOT NULL,
      uci TEXT NOT NULL,
      fen_before TEXT NOT NULL,
      fen_after TEXT NOT NULL,
      best_uci TEXT, best_san TEXT, best_pv TEXT, second_uci TEXT,
      best_cp INTEGER, best_mate INTEGER,
      played_cp INTEGER, played_mate INTEGER,
      win_before REAL, win_after REAL,
      accuracy REAL, cp_loss INTEGER, win_chances_drop REAL,
      verdict TEXT, badge TEXT, is_best INTEGER, critical INTEGER,
      PRIMARY KEY (game_id, ply)
    );
    CREATE INDEX IF NOT EXISTS idx_move_eval_game ON move_eval(game_id);
  `)
  tablesReady = true
}

function persistReview(gameId: number, r: GameReview): void {
  const db = getAppDb()
  const now = Date.now()
  db.prepare('DELETE FROM game_review WHERE game_id=?').run(gameId)
  db.prepare('DELETE FROM move_eval WHERE game_id=?').run(gameId)

  db.prepare(
    `INSERT INTO game_review(
       game_id,depth,total_plies,accuracy_white,accuracy_black,acpl_white,acpl_black,
       white_inacc,white_mist,white_blun,white_best,
       black_inacc,black_mist,black_blun,black_best,
       est_elo_white,est_elo_white_low,est_elo_white_high,
       est_elo_black,est_elo_black_low,est_elo_black_high,created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    gameId,
    r.depth,
    r.totalPlies,
    r.white.accuracy,
    r.black.accuracy,
    r.white.acpl,
    r.black.acpl,
    r.white.inaccuracies,
    r.white.mistakes,
    r.white.blunders,
    r.white.best,
    r.black.inaccuracies,
    r.black.mistakes,
    r.black.blunders,
    r.black.best,
    r.whiteElo.est,
    r.whiteElo.low,
    r.whiteElo.high,
    r.blackElo.est,
    r.blackElo.low,
    r.blackElo.high,
    now
  )

  const ins = db.prepare(
    `INSERT INTO move_eval(
       game_id,ply,color,san,uci,fen_before,fen_after,best_uci,best_san,best_pv,second_uci,
       best_cp,best_mate,played_cp,played_mate,win_before,win_after,accuracy,cp_loss,
       win_chances_drop,verdict,badge,is_best,critical)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  )
  for (const m of r.moveEvals) {
    ins.run(
      gameId,
      m.ply,
      m.color,
      m.san,
      m.uci,
      m.fenBefore,
      m.fenAfter,
      m.bestUci,
      m.bestSan,
      m.bestPv.join(' '),
      m.secondUci,
      m.bestEval.cp,
      m.bestEval.mate,
      m.playedEval.cp,
      m.playedEval.mate,
      m.winBefore,
      m.winAfter,
      m.accuracy,
      m.cpLoss,
      m.winChancesDrop,
      m.verdict,
      m.badge,
      m.isBest ? 1 : 0,
      m.critical ? 1 : 0
    )
  }
}

interface GameReviewDbRow {
  game_id: number
  depth: number
  total_plies: number
  accuracy_white: number | null
  accuracy_black: number | null
  acpl_white: number | null
  acpl_black: number | null
  white_inacc: number
  white_mist: number
  white_blun: number
  white_best: number
  black_inacc: number
  black_mist: number
  black_blun: number
  black_best: number
  est_elo_white: number
  est_elo_white_low: number
  est_elo_white_high: number
  est_elo_black: number
  est_elo_black_low: number
  est_elo_black_high: number
}

interface MoveEvalDbRow {
  ply: number
  color: string
  san: string
  uci: string
  fen_before: string
  fen_after: string
  best_uci: string | null
  best_san: string | null
  best_pv: string | null
  second_uci: string | null
  best_cp: number | null
  best_mate: number | null
  played_cp: number | null
  played_mate: number | null
  win_before: number | null
  win_after: number | null
  accuracy: number | null
  cp_loss: number | null
  win_chances_drop: number | null
  verdict: string | null
  badge: string | null
  is_best: number
  critical: number
}

/** Load a cached review for a game (review + per-move evals), or null. */
export function getCachedReview(
  gameId: number
): { review: GameReview; moveEvals: MoveEval[] } | null {
  initReviewTables()
  const db = getAppDb()
  const row = db
    .prepare('SELECT * FROM game_review WHERE game_id=?')
    .get(gameId) as unknown as GameReviewDbRow | undefined
  if (!row) return null

  const rows = db
    .prepare('SELECT * FROM move_eval WHERE game_id=? ORDER BY ply')
    .all(gameId) as unknown as MoveEvalDbRow[]

  const moveEvals: MoveEval[] = rows.map((r) => ({
    ply: r.ply,
    color: r.color === 'black' ? 'black' : 'white',
    san: r.san,
    uci: r.uci,
    fenBefore: r.fen_before,
    fenAfter: r.fen_after,
    bestUci: r.best_uci ?? '',
    bestSan: r.best_san ?? '',
    bestPv: r.best_pv ? r.best_pv.split(' ').filter(Boolean) : [],
    secondUci: r.second_uci,
    bestEval: { cp: r.best_cp, mate: r.best_mate },
    playedEval: { cp: r.played_cp, mate: r.played_mate },
    winBefore: r.win_before ?? 0,
    winAfter: r.win_after ?? 0,
    accuracy: r.accuracy ?? 0,
    cpLoss: r.cp_loss ?? 0,
    winChancesDrop: r.win_chances_drop ?? 0,
    verdict: (r.verdict ?? 'ok') as ReviewVerdict,
    badge: (r.badge ?? 'Good') as MoveBadge,
    isBest: r.is_best === 1,
    critical: r.critical === 1
  }))

  const review: GameReview = {
    gameId,
    depth: row.depth,
    totalPlies: row.total_plies,
    white: {
      accuracy: row.accuracy_white ?? 0,
      acpl: row.acpl_white ?? 0,
      moves: moveEvals.filter((m) => m.color === 'white').length,
      inaccuracies: row.white_inacc,
      mistakes: row.white_mist,
      blunders: row.white_blun,
      best: row.white_best
    },
    black: {
      accuracy: row.accuracy_black ?? 0,
      acpl: row.acpl_black ?? 0,
      moves: moveEvals.filter((m) => m.color === 'black').length,
      inaccuracies: row.black_inacc,
      mistakes: row.black_mist,
      blunders: row.black_blun,
      best: row.black_best
    },
    whiteElo: {
      est: row.est_elo_white,
      low: row.est_elo_white_low,
      high: row.est_elo_white_high,
      accuracy: row.accuracy_white ?? 0,
      kind: 'estimate'
    },
    blackElo: {
      est: row.est_elo_black,
      low: row.est_elo_black_low,
      high: row.est_elo_black_high,
      accuracy: row.accuracy_black ?? 0,
      kind: 'estimate'
    },
    moveEvals
  }
  return { review, moveEvals }
}

// Re-export so the IPC layer / lead can use these without reaching into accuracy.ts.
export { INITIAL_FEN, PIECE_VALUE }
