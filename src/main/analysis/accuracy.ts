// Accuracy / Win% math (content-coaching.md §0.2, §2.3, §3.1, §3.2).
//
// Clean-room re-implementation of the Lichess Win% + Accuracy% pipeline on plain
// numbers. No engine, no DB, no chess library — pure functions so this module can
// be unit-tested headlessly and reused by review.ts and estElo.ts.
//
// Conventions:
//  - cp is centipawns from a FIXED point of view (caller decides whose POV).
//  - mate is mate-in-n plies, sign = who delivers mate (positive = the POV side mates).
//  - Win% is 0..100 from that same POV.

// ---- cp -> Win% (Lichess canonical, lila PR #11148) -----------------------------

/** Lichess winning-chances sigmoid constant. Do NOT mix with the older -0.004. */
export const WIN_MULT = -0.00368208

/** Centipawns are clamped to this magnitude before the sigmoid. */
export const CP_CLAMP = 1000

/** Raw winning chances in [-1, 1] for a cp eval (clamped to +/-1000). */
export function rawWinningChances(cp: number): number {
  const c = Math.max(-CP_CLAMP, Math.min(CP_CLAMP, cp))
  return 2 / (1 + Math.exp(WIN_MULT * c)) - 1
}

/** Map a signed mate distance to a finite high-band cp value. */
export function mateToCp(mate: number): number {
  const sign = Math.sign(mate)
  return sign * (21 - Math.min(10, Math.abs(mate))) * 100
}

/**
 * Win% in 0..100 from the POV the eval is expressed in.
 * Pass `mate` when the score is a forced mate; otherwise pass `scoreCp`.
 */
export function winPercent(scoreCp: number | null, mate: number | null): number {
  const cp = mate != null ? mateToCp(mate) : (scoreCp ?? 0)
  return 50 + 50 * rawWinningChances(cp)
}

/** Winning chances in 0..1 (the 0..100 Win% rescaled), POV-relative. */
export function winChances(scoreCp: number | null, mate: number | null): number {
  return winPercent(scoreCp, mate) / 100
}

// ---- Per-move Accuracy% (content-coaching.md §3.1) -------------------------------

/**
 * Per-move accuracy in 0..100. Both args are Win% (0..100) from the MOVER's POV;
 * winAfter is taken from the post-move position, re-expressed to the mover.
 * Fits the anchor curve 0->100, 5->75, 10->60, 20->42, 40->20, 60->5, 80->0.
 */
export function moveAccuracy(winBefore: number, winAfter: number): number {
  if (winAfter >= winBefore) return 100
  const winDiff = winBefore - winAfter
  // 103.1668100711649 * exp(-0.04354415386753951 * winDiff) - 3.166924740191411, +1 bonus.
  const acc = 103.1668100711649 * Math.exp(-0.04354415386753951 * winDiff) - 3.166924740191411 + 1
  return Math.max(0, Math.min(100, acc))
}

// ---- Game accuracy (volatility-weighted-mean + harmonic-mean blend) --------------

/** Sample standard deviation of a slice (population std; matches lila harmonic.scala). */
function stdDev(xs: number[]): number {
  if (xs.length === 0) return 0
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length
  const variance = xs.reduce((a, b) => a + (b - mean) * (b - mean), 0) / xs.length
  return Math.sqrt(variance)
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x))
}

/**
 * Blend a side's per-move accuracies into a single 0..100 game accuracy.
 *
 * @param accuracies per-move accuracy for this side's moves, in game order.
 * @param winPercents the Win% (0..100, FROM THIS SIDE'S POV) for EACH ply of the
 *        whole game (both sides), in game order — used to compute the volatility
 *        weighting window. If omitted, falls back to a flat weighting.
 * @param sideIndices the indices into `winPercents` of this side's moves (the post
 *        positions), aligned 1:1 with `accuracies`. If omitted, accuracies are
 *        assumed contiguous from index 0.
 */
export function gameAccuracy(
  accuracies: number[],
  winPercents?: number[],
  sideIndices?: number[]
): number {
  const n = accuracies.length
  if (n === 0) return 0
  if (n === 1) return clamp(accuracies[0], 0, 100)

  // Harmonic mean (guard zeros with a small epsilon).
  const EPS = 1e-3
  const harmonicMean = n / accuracies.reduce((a, b) => a + 1 / Math.max(EPS, b), 0)

  // Volatility weights from a centered Win% window over the WHOLE game.
  let weights: number[]
  if (winPercents && winPercents.length > 0 && sideIndices && sideIndices.length === n) {
    const total = winPercents.length
    const windowSize = clamp(Math.round(total / 10), 2, 8)
    weights = sideIndices.map((idx) => {
      const half = Math.floor(windowSize / 2)
      const lo = Math.max(0, Math.min(idx - half, total - windowSize))
      const hi = Math.min(total, lo + windowSize)
      return clamp(stdDev(winPercents.slice(lo, hi)), 0.5, 12)
    })
  } else {
    weights = accuracies.map(() => 1)
  }

  const weightSum = weights.reduce((a, b) => a + b, 0)
  const weightedMean =
    weightSum > 0 ? accuracies.reduce((a, acc, i) => a + acc * weights[i], 0) / weightSum : 0

  return clamp((weightedMean + harmonicMean) / 2, 0, 100)
}

// ---- ACPL (separate stat) -------------------------------------------------------

/** Per-move centipawn loss cap and overall guard (content-coaching.md §3.1). */
export const MAX_CPL_PER_MOVE = 1000
export const MAX_CPL = 2000

/**
 * Average centipawn loss for a side. Each loss is the mover-POV cp drop from the
 * position before the move to after, capped per-move at +/-1000. Pass already-signed
 * losses (>=0). Returns a non-negative integer-ish cp value; lower = stronger.
 */
export function acpl(losses: number[]): number {
  if (losses.length === 0) return 0
  const sum = losses.reduce((a, l) => a + Math.min(MAX_CPL_PER_MOVE, Math.max(0, l)), 0)
  return Math.min(MAX_CPL, sum / losses.length)
}

// ---- Move classification (content-coaching.md §3.2) -----------------------------

export type ReviewVerdict = 'blunder' | 'mistake' | 'inaccuracy' | 'ok'

/**
 * Post-game REVIEW annotation bucket (Lichess Advice.scala).
 * @param delta POV-signed (prevWinChances - currWinChances) on the 0..1 chances scale.
 */
export function reviewVerdict(delta: number): ReviewVerdict {
  if (delta >= 0.3) return 'blunder'
  if (delta >= 0.2) return 'mistake'
  if (delta >= 0.1) return 'inaccuracy'
  return 'ok'
}

export type PracticeVerdict = 'goodMove' | 'inaccuracy' | 'mistake' | 'blunder'

/**
 * Live practice / guess-the-move bucket (Lichess practiceCtrl.ts). The `shift`
 * here is on the HALVED povDiff scale — keep separate from reviewVerdict's delta.
 */
export function practiceVerdict(shift: number, playedIsBest: boolean): PracticeVerdict {
  if (playedIsBest) return 'goodMove'
  if (shift < 0.025) return 'goodMove'
  if (shift < 0.06) return 'inaccuracy'
  if (shift < 0.14) return 'mistake'
  return 'blunder'
}

// ---- Mate transitions (content-coaching.md §3.2c) -------------------------------

export type MateTransition = 'MateCreated' | 'MateLost' | 'MateDelayed' | null

export interface EvalScore {
  /** cp from the mover's POV (set when not a mate). */
  cp?: number | null
  /** mate distance from the mover's POV (set when forced mate; sign = who mates). */
  mate?: number | null
}

/**
 * Classify a mate transition between the best line (prev, before the move, mover POV)
 * and the played line (curr, after the move, re-expressed to the SAME mover POV).
 * Returns the transition kind plus its review severity (null when not annotated).
 */
export function mateTransition(
  prev: EvalScore,
  curr: EvalScore
): { kind: MateTransition; severity: ReviewVerdict | null } {
  const prevMate = prev.mate ?? null
  const currMate = curr.mate ?? null
  const prevCp = prev.cp ?? 0
  const currCp = curr.cp ?? 0

  // cp -> mate(negative for mover) => MateCreated (mover is now getting mated)
  if (prevMate == null && currMate != null && currMate < 0) {
    let severity: ReviewVerdict
    if (prevCp < -999) severity = 'inaccuracy'
    else if (prevCp < -700) severity = 'mistake'
    else severity = 'blunder'
    return { kind: 'MateCreated', severity }
  }

  // mate(positive) -> cp  OR  mate(pos) -> mate(neg) => MateLost
  if (prevMate != null && prevMate > 0) {
    const lostToCp = currMate == null
    const flippedToNeg = currMate != null && currMate < 0
    if (lostToCp || flippedToNeg) {
      const povCp = lostToCp ? currCp : -mateToCp(Math.abs(currMate as number))
      let severity: ReviewVerdict
      if (povCp > 999) severity = 'inaccuracy'
      else if (povCp > 700) severity = 'mistake'
      else severity = 'blunder'
      return { kind: 'MateLost', severity }
    }
    // mate(pos) -> worse mate(pos) => MateDelayed (NOT annotated)
    if (currMate != null && currMate > 0 && currMate > prevMate) {
      return { kind: 'MateDelayed', severity: null }
    }
  }

  return { kind: null, severity: null }
}

// ---- Rich badge labels + sacrifice-aware brilliant/great (content-coaching.md §3.2d) -

export type MoveBadge =
  | 'Best'
  | 'Brilliant'
  | 'Great'
  | 'Excellent'
  | 'Good'
  | 'Book'
  | 'Forced'
  | 'Inaccuracy'
  | 'Mistake'
  | 'Blunder'

/** Material values (pawns) for the sacrifice wash (content-coaching.md §3.2 detector). */
export const PIECE_VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 }

export interface BadgeInput {
  /** Win% diff signed TO THE MOVER, 0..100 scale (winAfter - winBefore, mover POV). */
  winDiff: number
  /** Mover's Win% (0..100) AFTER the move, mover POV. */
  winAfterMover: number
  /** True if the played move equals the engine's best move. */
  playedIsBest: boolean
  /** True if only one legal move (or a single forced reply). */
  forced?: boolean
  /** True if the position before the move is in the opening book. */
  inBook?: boolean
  /** True if the played move is a recapture (disqualifies Great). */
  isRecapture?: boolean
  /** True if the played move is a sound piece sacrifice (see isSacrifice). */
  isSacrifice?: boolean
  /**
   * Win% (0..100, mover POV) the SECOND-best line would have reached after its move,
   * if available (requires MultiPV >= 2). Used for the Great "beats 2nd line" test.
   */
  secondBestWinMover?: number | null
  /** Mover's Win% (0..100) BEFORE the move, mover POV (for the 50% line crossing). */
  winBeforeMover: number
}

/**
 * Chess.com-style rich badge (clearly-labeled approximation). Operates on the
 * mover-signed winDiff (0..100). Brilliant/Great need the sacrifice flag / 2nd line.
 */
export function classifyBadge(i: BadgeInput): MoveBadge {
  if (i.forced) return 'Forced'

  // Brilliant: near-best AND a sound sac AND mover not losing AND the position
  // wasn't already trivially won (mover < 97% before the move).
  const notLosing = i.winAfterMover >= 50
  if (
    i.winDiff >= -2 &&
    i.isSacrifice &&
    notLosing &&
    i.winBeforeMover < 97
  ) {
    return 'Brilliant'
  }

  // Great: near-best, not a recapture, not losing, not already winning, AND it
  // either crossed the 50% line with a clear gain, or beats the 2nd-best line by >10%.
  if (
    i.winDiff >= -2 &&
    !i.isRecapture &&
    notLosing &&
    i.winBeforeMover < 97
  ) {
    const crossed50 = i.winBeforeMover < 50 && i.winAfterMover >= 50 && i.winDiff > 10
    const beatsSecond =
      i.secondBestWinMover != null && i.winAfterMover - i.secondBestWinMover > 10
    if (crossed50 || beatsSecond) return 'Great'
  }

  if (i.playedIsBest) return 'Best'
  if (i.inBook) return 'Book'

  if (i.winDiff < -20) return 'Blunder'
  if (i.winDiff < -10) return 'Mistake'
  if (i.winDiff < -5) return 'Inaccuracy'
  if (i.winDiff < -2) return 'Good'
  return 'Excellent'
}

/**
 * Sacrifice detector (Chesskit-style, content-coaching.md §3.2). Given the captured
 * piece roles along the engine PV AFTER the candidate move (truncated to EVEN length),
 * decide whether the MOVER ends up down material once matching captures wash out.
 *
 * @param pvCaptures ordered list of captures in the resulting PV, each tagged with
 *        who made the capture relative to the mover ('mover' | 'opp') and the role
 *        of the captured piece. Caller truncates to an even number of plies.
 * Note: never flags pure pawn sacrifices (documented limitation).
 */
export function isSacrifice(
  pvCaptures: { by: 'mover' | 'opp'; role: string }[]
): boolean {
  // Cancel matching captures (a recapture of equal value washes out): simplest
  // faithful model — sum signed material captured by each side, then net.
  let moverGain = 0
  let oppGain = 0
  let nonPawnInvolved = false
  for (const c of pvCaptures) {
    const v = PIECE_VALUE[c.role] ?? 0
    if (c.role !== 'p') nonPawnInvolved = true
    if (c.by === 'mover') moverGain += v
    else oppGain += v
  }
  // Only single pawns in play -> not a sacrifice.
  if (!nonPawnInvolved) return false
  // After the wash, the mover ends up DOWN material -> sacrifice.
  return moverGain - oppGain < 0
}
