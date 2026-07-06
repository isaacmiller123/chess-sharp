import { app, type WebContents } from 'electron'
import { z } from 'zod'
import { parseFen, makeFen } from 'chessops/fen'
import { handle } from './util'
import { ENGINE_ELO_FLOOR } from '../../shared/types'
import { StockfishPool } from '../engine/StockfishPool'
import { MaiaPool } from '../engine/MaiaPool'
import { maiaAvailable } from '../datasets/maia'
import type { BestMove, InfoLine, UciEngine } from '../engine/UciEngine'

const pool = new StockfishPool()
const maiaPool = new MaiaPool()

// Parse + re-serialize any FEN before it reaches the engine, so a malicious
// renderer payload can't smuggle newlines/extra UCI commands into stdin.
function safeFen(fen: string): string {
  const setup = parseFen(fen)
  if (setup.isErr) throw new Error('engine: invalid FEN')
  return makeFen(setup.value)
}

const limitSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('depth'), value: z.number().int().positive() }),
  z.object({ kind: z.literal('movetime'), value: z.number().int().positive() }),
  z.object({ kind: z.literal('nodes'), value: z.number().int().positive() }),
  z.object({ kind: z.literal('infinite') })
])

const analyzeSchema = z
  .object({
    fen: z.string().min(1),
    multipv: z.number().int().min(1).max(10).default(3),
    limit: limitSchema
  })
  .strict()

const playSchema = z
  .object({
    fen: z.string().min(1),
    level: z.object({
      uciElo: z.number().int().min(ENGINE_ELO_FLOOR).max(3190).optional(),
      skill: z.number().int().min(0).max(20).optional(),
      // Target Elo at ANY strength. Takes precedence over the legacy knobs:
      // >= 1320 -> native UCI_Elo; below -> MultiPV-softmax weak play (above).
      elo: z.number().int().min(100).max(3190).optional(),
      // Time-trouble knob from the bot time manager (renderer botStrength.ts
      // BotPlayLevel). Only the sub-floor weak path reads it: shallower search,
      // hotter softmax, doubled blunder chance — strength genuinely collapses
      // in a scramble. At 1320+ the caller's small movetime IS the collapse.
      panic: z.boolean().optional(),
      // "Human" style: play the maia-<level> lc0 net at nodes=1. Wins over every
      // other knob (shared/types.ts PlayLevel contract). The literal union keeps
      // the value inside MAIA_LEVELS with no runtime lookup.
      maia: z
        .union([
          z.literal(1100),
          z.literal(1300),
          z.literal(1500),
          z.literal(1700),
          z.literal(1900)
        ])
        .optional()
    }),
    limit: limitSchema
  })
  .strict()

// ---- Sub-floor ("weak play") model -----------------------------------------------
//
// Stockfish's own weakening (UCI_LimitStrength/UCI_Elo, Skill Level) bottoms out
// around 1320. Below that we weaken the CHOICE, not the search: run a short
// full-strength MultiPV search, then pick among the engine's own candidate moves
// with an Elo-scaled softmax over their centipawn scores, plus a small Elo-scaled
// chance of a "human blunder" (a pick from the bottom half of the candidates).
// Every move a weak bot plays is therefore a move the engine actually considered —
// misplaced pieces and missed tactics, not the old uniform-random shuffles that
// hung the queen one move and found a GM move the next.

// NOTE: the pick model below (weakDepth/weakMultiPv/weakTemperature/
// weakBlunderChance/blunderGapWindow/gapKnee/opening boost/pickWeakMove) is
// mirrored in scripts/calibrate-weak.mjs — the calibration harness that
// measured these constants. Keep the two in sync when tuning.
// TODO(P2): extract the pure pick model to src/main/engine/weakModel.ts and
// import it from the harness via tsx so there is a single source of truth.

/** Linear interpolation over an Elo interval, clamped at both ends. */
function lerpByElo(elo: number, e0: number, v0: number, e1: number, v1: number): number {
  const t = Math.max(0, Math.min(1, (elo - e0) / (e1 - e0)))
  return v0 + t * (v1 - v0)
}

/** Piecewise-linear curve over (elo, value) points, clamped at both ends. */
function curveByElo(elo: number, points: ReadonlyArray<readonly [number, number]>): number {
  if (elo <= points[0][0]) return points[0][1]
  for (let i = 1; i < points.length; i++) {
    if (elo <= points[i][0]) {
      return lerpByElo(elo, points[i - 1][0], points[i - 1][1], points[i][0], points[i][1])
    }
  }
  return points[points.length - 1][1]
}

/** Search depth for a sub-floor bot: 4 (Elo ~100) up to 7 (~1250+).
 *  Calibrated: depth 8 + cold softmax measured ~1500-1600 implied at band 1200
 *  vs the 1320 anchor; 7 plies still sees every short tactic. */
function weakDepth(elo: number): number {
  return Math.round(lerpByElo(elo, 100, 4, 1250, 7))
}

/** Candidate-line count: weaker bots consider more (and worse) options. */
function weakMultiPv(elo: number): number {
  return elo < 600 ? 8 : elo < 1000 ? 7 : 6
}

/**
 * Softmax base temperature in centipawns: ~650 at Elo 100 (near-uniform over
 * the candidates, real mistakes included) tapering to ~60 by 1250 (mostly
 * top-2). The eval-gap knee (below) does the rest of the strength shaping.
 */
function weakTemperature(elo: number): number {
  // Calibration (scripts/calibrate-weak.mjs, 2026-07-06): 60cp at the top end
  // measured ~1600 implied vs the 1320 anchor (83% score at band 1200); 110cp
  // measured ~1511; 170cp (+ depth 7) brings the 1200 band toward its label.
  return lerpByElo(elo, 100, 650, 1250, 170)
}

/**
 * Eval-gap knee (cp): softmax weight is exp(-(gap/T) * (1 + gap/knee)), so a
 * candidate that hangs material (large gap) is punished QUADRATICALLY, and the
 * knee shrinks with Elo — an 800 bot still drifts into -150cp moves but almost
 * never plays the -600cp free-piece line the flat softmax used to allow, while
 * a 200 bot (huge knee) barely notices the difference.
 */
function gapKnee(elo: number): number {
  return curveByElo(elo, [
    [100, 4000],
    [600, 1200],
    [1000, 500],
    [1300, 250]
  ])
}

/**
 * Per-band blunder-rate targets: the chance per move of an INTENTIONAL mistake
 * pick (see blunderGapWindow for how bad it is allowed to be). Calibrated so
 * 400 hangs something most games while 1200 only rarely gifts a tactic.
 */
function weakBlunderChance(elo: number): number {
  return curveByElo(elo, [
    [100, 0.3],
    [400, 0.22],
    [600, 0.15],
    [800, 0.1],
    [1000, 0.06],
    [1200, 0.04],
    [1319, 0.025]
  ])
}

/**
 * Blunder severity window [minGap, maxGap] in cp below the best candidate.
 * A blunder pick is drawn uniformly from candidates inside the window:
 *  - low bands: window is wide open upward (hanging the queen / mate-in-1 is in
 *    character for 400);
 *  - high bands: a "blunder" is a real mistake (~1-2 pawns / a tactic missed),
 *    not a free queen — 1200s lose games to pressure, not to q-hangs each game.
 */
function blunderGapWindow(elo: number): [number, number] {
  const min = lerpByElo(elo, 100, 60, 1300, 150)
  const max = elo < 700 ? Number.POSITIVE_INFINITY : lerpByElo(elo, 700, 1200, 1300, 400)
  return [min, max]
}

/** Opening phase length (fullmoves) during which choice is deliberately varied. */
function openingFullmoves(elo: number): number {
  return Math.round(lerpByElo(elo, 100, 8, 1300, 4))
}

/** Fullmove number from a normalized FEN (defaults to 1 on malformed input). */
function fenFullmove(fen: string): number {
  const n = Number(fen.split(' ')[5])
  return Number.isFinite(n) && n >= 1 ? n : 1
}

/** Bounded side-to-move cp for a candidate line (mate maps to ±1000, as in review). */
function lineCp(info: InfoLine): number {
  if (info.mate !== undefined) return info.mate > 0 ? 1000 : -1000
  return Math.max(-1000, Math.min(1000, info.scoreCp ?? 0))
}

interface WeakCandidate {
  uci: string
  cp: number
}

/**
 * Eval-gap-aware softmax pick over candidates (sorted best-first): weight is
 * exp(-(gap/T) * (1 + gap/knee)) — a flat softmax near the top, quadratically
 * steeper for candidates that hang material (see gapKnee).
 */
function softmaxPick(cands: WeakCandidate[], temperature: number, knee: number): string {
  const maxCp = cands[0].cp
  const weights = cands.map((c) => {
    const gap = maxCp - c.cp
    return Math.exp(-(gap / temperature) * (1 + gap / knee))
  })
  const total = weights.reduce((a, b) => a + b, 0)
  let r = Math.random() * total
  for (let i = 0; i < cands.length; i++) {
    r -= weights[i]
    if (r <= 0) return cands[i].uci
  }
  return cands[cands.length - 1].uci
}

/**
 * The full sub-floor pick model over sorted-best-first candidates. Pure —
 * mirrored verbatim in scripts/calibrate-weak.mjs.
 *  1. Opening phase (fullmove small, position near-balanced): hotter softmax,
 *     no blunder roll — varied openings without instant self-destruction.
 *  2. Blunder roll at the band's target rate: uniform pick from candidates
 *     inside the band's severity window.
 *  3. Otherwise: eval-gap-aware softmax.
 */
function pickWeakMove(cands: WeakCandidate[], elo: number, fullmove: number, panic: boolean): string {
  const inOpening = fullmove <= openingFullmoves(elo) && Math.abs(cands[0].cp) < 120
  const knee = gapKnee(elo)
  if (inOpening && !panic) {
    return softmaxPick(cands, weakTemperature(elo) * 1.8, knee)
  }
  const blunderChance = Math.min(0.5, weakBlunderChance(elo) * (panic ? 2 : 1))
  if (cands.length >= 2 && Math.random() < blunderChance) {
    const [minGap, maxGap] = blunderGapWindow(elo)
    const best = cands[0].cp
    const window = cands.filter((c) => best - c.cp >= minGap && best - c.cp <= maxGap)
    if (window.length > 0) return window[Math.floor(Math.random() * window.length)].uci
    // No candidate in the window (quiet position): fall through to the softmax.
  }
  return softmaxPick(cands, weakTemperature(elo) * (panic ? 1.7 : 1), knee)
}

/**
 * One bounded MultiPV search on the play engine; resolves with the latest info
 * line per multipv index plus the engine's own bestmove. Mirrors review.ts
 * analyzeFen: every exit path (bestmove / timeout / engine exit / engine error)
 * detaches all listeners so nothing leaks onto the long-lived play engine.
 */
function collectCandidates(
  eng: UciEngine,
  fen: string,
  depth: number,
  multipv: number
): Promise<{ lines: Map<number, InfoLine>; best: BestMove }> {
  return new Promise((resolve, reject) => {
    const lines = new Map<number, InfoLine>()
    let done = false
    const onInfo = (info: InfoLine): void => {
      const idx = info.multipv ?? 1
      if (info.pv && info.pv.length > 0) lines.set(idx, info)
    }
    const cleanup = (): void => {
      clearTimeout(timer)
      eng.off('info', onInfo)
      eng.off('bestmove', onBest)
      eng.off('exit', onExit)
      eng.off('engineError', onErr)
    }
    const onBest = (bm: BestMove): void => {
      if (done) return
      done = true
      cleanup()
      resolve({ lines, best: bm })
    }
    const fail = (e: Error): void => {
      if (done) return
      done = true
      cleanup()
      reject(e)
    }
    const onExit = (): void => fail(new Error('engine exited during weak-play search'))
    const onErr = (err: Error): void =>
      fail(err instanceof Error ? err : new Error('engine error during weak-play search'))
    // Depth ≤ 8 finishes in well under a second; 20s is a hard crash ceiling so a
    // wedged engine can never hang the bot's turn (and the renderer) forever.
    const timer = setTimeout(() => fail(new Error('weak-play search timeout')), 20000)
    eng.on('info', onInfo)
    eng.once('bestmove', onBest)
    eng.once('exit', onExit)
    eng.once('engineError', onErr)
    void eng.search(fen, { kind: 'depth', value: depth }, multipv)
  })
}

/** Resolve a sub-floor bot move. Same response shape as eng.bestMove().
 *  `panic` = the bot time manager's time-trouble collapse: 2 plies shallower
 *  (floor 3), softmax ~1.7x hotter, blunder chance doubled (capped at 50%). */
async function weakPlay(eng: UciEngine, fen: string, elo: number, panic = false): Promise<BestMove> {
  // Full-strength search — honest candidate evals; the weakening is in the pick.
  // (Skill Level explicitly reset in case a legacy `skill` request lowered it.)
  eng.setOption('UCI_LimitStrength', false)
  eng.setOption('Skill Level', 20)
  const depth = panic ? Math.max(3, weakDepth(elo) - 2) : weakDepth(elo)
  const { lines, best } = await collectCandidates(eng, fen, depth, weakMultiPv(elo))
  const cands: WeakCandidate[] = []
  for (const info of lines.values()) {
    const uci = info.pv?.[0]
    if (uci) cands.push({ uci, cp: lineCp(info) })
  }
  // No usable lines (terminal position / odd output): the engine's own answer.
  if (cands.length === 0) return best
  cands.sort((a, b) => b.cp - a.cp)
  return { bestmove: pickWeakMove(cands, elo, fenFullmove(fen), panic) }
}

let nextHandle = 1
// One analysis engine -> one active streaming subscription at a time.
let active: {
  handleId: number
  eng: UciEngine
  onInfo: (i: InfoLine) => void
  onBest: (b: BestMove) => void
} | null = null

function clearActive(): void {
  if (active) {
    active.eng.off('info', active.onInfo)
    active.eng.off('bestmove', active.onBest)
    active = null
  }
}

// Every position change fires a stop + a re-analyze on the SAME shared analysis
// engine. Run them through one serial queue so they can never interleave (which
// is what let a stale search's bestmove tear down the next subscription).
let opChain: Promise<unknown> = Promise.resolve()
function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const run = opChain.then(fn, fn)
  opChain = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

// engine:play calls all share one long-lived play engine. Serialize them (own
// chain, independent of the analysis queue) so one call's stop/option/search
// writes — and its temporarily attached info/bestmove listeners — can never
// interleave with another call's and swallow the wrong bestmove.
let playChain: Promise<unknown> = Promise.resolve()
function serializePlay<T>(fn: () => Promise<T>): Promise<T> {
  const run = playChain.then(fn, fn)
  playChain = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

export function registerEngine(): void {
  handle('engine:status', z.object({}).strict(), () => ({
    analysisReady: pool.hasAnalysis(),
    playReady: pool.hasPlay(),
    // "Can the Human style play right now": lc0 binary + >=1 maia weight on disk.
    lc0Ready: maiaAvailable()
  }))

  handle(
    'engine:newGame',
    z.object({ instance: z.enum(['analysis', 'play']) }).strict(),
    async ({ instance }) => {
      const eng = instance === 'analysis' ? await pool.getAnalysis() : await pool.getPlay()
      await eng.newGame()
      return { ok: true }
    }
  )

  handle('engine:analyze', analyzeSchema, ({ fen, multipv, limit }, e) =>
    serialize(async () => {
      const safe = safeFen(fen) // validate/normalize before any allocation
      const eng = await pool.getAnalysis()
      clearActive()
      // Drain any in-flight (infinite) search to idle BEFORE attaching this
      // search's listeners. Otherwise the previous search's stop-bestmove is
      // caught by our once('bestmove') below and immediately tears the new
      // subscription down — the bug that froze analysis after the first move.
      await eng.stop()
      const handleId = nextHandle++
      const sender: WebContents = e.sender
      const onInfo = (info: InfoLine): void => {
        if (!sender.isDestroyed()) sender.send('engine:line', { handleId, ...info })
      }
      const onBest = (bm: BestMove): void => {
        if (!sender.isDestroyed()) sender.send('engine:bestmove', { handleId, ...bm })
        clearActive()
      }
      active = { handleId, eng, onInfo, onBest }
      eng.on('info', onInfo)
      eng.once('bestmove', onBest)
      await eng.search(safe, limit, multipv)
      return { handleId }
    })
  )

  handle('engine:stop', z.object({ handleId: z.number() }).strict(), ({ handleId }) =>
    serialize(async () => {
      // Only stop the search the caller actually started (a stale id is a no-op).
      if (active && active.handleId === handleId) {
        await active.eng.stop()
        clearActive()
      }
      return { ok: true }
    })
  )

  handle('engine:play', playSchema, ({ fen, level, limit }) =>
    serializePlay(async () => {
      const safe = safeFen(fen)
      if (level.maia !== undefined) {
        // "Human" style: maia-<level> net at nodes=1 — the policy head IS the
        // player, so the caller's limit is ignored on purpose (a deeper search
        // would make Maia SUPERhuman-shaped, defeating the point). Runs on its
        // own per-level lc0 process; the Stockfish play engine stays untouched.
        // TODO(P2): micro-humanizer (small move-delay model + resign logic).
        const maiaEng = await maiaPool.get(level.maia)
        await maiaEng.stop()
        return maiaEng.bestMove(safe, { kind: 'nodes', value: 1 })
      }
      const eng = await pool.getPlay()
      // Drain any abandoned search (e.g. one whose waiter timed out) to idle
      // BEFORE attaching new listeners / starting a new search, so a stale
      // bestmove can't be mistaken for ours — same discipline as engine:analyze.
      await eng.stop()
      // `elo` wins over the legacy knobs when present (shared/types.ts contract).
      if (level.elo !== undefined && level.elo < ENGINE_ELO_FLOOR) {
        // Below Stockfish's floor: engine-driven weakening. Ignores the caller's
        // limit on purpose — a short Elo-scaled depth search picks the candidates.
        // `level.panic` (bot time manager) is the one extra knob: see weakPlay.
        return weakPlay(eng, safe, level.elo, level.panic === true)
      }
      eng.setOption('MultiPV', 1)
      if (level.elo !== undefined) {
        eng.setOption('UCI_LimitStrength', true)
        eng.setOption('UCI_Elo', level.elo)
      } else if (level.uciElo !== undefined) {
        eng.setOption('UCI_LimitStrength', true)
        eng.setOption('UCI_Elo', level.uciElo)
      } else if (level.skill !== undefined) {
        eng.setOption('UCI_LimitStrength', false)
        eng.setOption('Skill Level', level.skill)
      } else {
        // Neither given: never answer at full strength — cap to a club default.
        eng.setOption('UCI_LimitStrength', true)
        eng.setOption('UCI_Elo', 1500)
      }
      return eng.bestMove(safe, limit)
    })
  )

  // Windows-safe lifecycle: kill all engine children when the app quits.
  app.on('will-quit', () => {
    pool.killAll()
    maiaPool.killAll()
  })
}
