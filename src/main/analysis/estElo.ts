// Per-game estimated-Elo BAND from accuracy + ACPL (content-coaching.md §3.1
// accuracy, architecture.md §11.1.8 "accuracy-based per-game Elo band ... always a
// range, labeled distinct from the Glicko rating").
//
// This is a deliberately SEPARATE estimate from the Glicko puzzle/vs-bot rating.
// Calibration (v2):
//  1. Accuracy% (0..100) maps to a base Elo on an anchor curve.
//  2. ACPL nudges the base — accuracy anchors alone overrate short, quiet games
//     (few moves = few chances to lose win%), while ACPL keeps an absolute
//     "how much did you actually leak" signal. Low ACPL (<20) pushes the
//     estimate up, high ACPL (>80) pulls it down.
//  3. Short games (<20 own moves) are shrunk toward the middle and get a much
//     wider band: 12 accurate moves are NOT evidence of master play, and the
//     label must stay honest.

export interface EloBand {
  /** Point estimate (rounded). */
  est: number
  /** Lower bound of the band (rounded). */
  low: number
  /** Upper bound of the band (rounded). */
  high: number
  /** The accuracy% the estimate was derived from (echoed for the UI). */
  accuracy: number
  /** Always 'estimate' — UI must label this distinct from the Glicko rating. */
  kind: 'estimate'
}

// Anchor points mapping accuracy% -> approximate Elo, fit to the observed Lichess
// relationship (rapid/classical): a roughly logistic curve where ~50% accuracy is
// beginner play and >95% is near-master. Interpolated linearly between anchors and
// clamped to the playable band.
const ANCHORS: { acc: number; elo: number }[] = [
  { acc: 20, elo: 250 },
  { acc: 40, elo: 600 },
  { acc: 55, elo: 900 },
  { acc: 65, elo: 1200 },
  { acc: 72, elo: 1500 },
  { acc: 78, elo: 1800 },
  { acc: 84, elo: 2100 },
  { acc: 90, elo: 2400 },
  { acc: 95, elo: 2700 },
  { acc: 99, elo: 2900 }
]

const ELO_FLOOR = 250
const ELO_CEIL = 2900

/** Piecewise-linear accuracy% -> Elo on the anchor curve. */
export function accuracyToElo(accuracy: number): number {
  const a = Math.max(0, Math.min(100, accuracy))
  if (a <= ANCHORS[0].acc) return ELO_FLOOR
  if (a >= ANCHORS[ANCHORS.length - 1].acc) return ELO_CEIL
  for (let i = 1; i < ANCHORS.length; i++) {
    const hi = ANCHORS[i]
    const lo = ANCHORS[i - 1]
    if (a <= hi.acc) {
      const t = (a - lo.acc) / (hi.acc - lo.acc)
      return lo.elo + t * (hi.elo - lo.elo)
    }
  }
  return ELO_CEIL
}

// ACPL -> Elo adjustment bands (piecewise-linear between anchors, clamped at the
// ends). Sub-20 ACPL is engine-grade calm play (+), 80+ means the eval was
// hemorrhaging every few moves (-) regardless of what the accuracy blend says.
const ACPL_ADJUST: { acpl: number; adj: number }[] = [
  { acpl: 8, adj: 160 },
  { acpl: 20, adj: 80 },
  { acpl: 40, adj: 0 },
  { acpl: 65, adj: -90 },
  { acpl: 90, adj: -190 },
  { acpl: 130, adj: -320 }
]

/** Elo delta implied by a side's average centipawn loss. */
export function acplAdjustment(acplValue: number): number {
  const a = Math.max(0, acplValue)
  if (a <= ACPL_ADJUST[0].acpl) return ACPL_ADJUST[0].adj
  const last = ACPL_ADJUST[ACPL_ADJUST.length - 1]
  if (a >= last.acpl) return last.adj
  for (let i = 1; i < ACPL_ADJUST.length; i++) {
    const hi = ACPL_ADJUST[i]
    const lo = ACPL_ADJUST[i - 1]
    if (a <= hi.acpl) {
      const t = (a - lo.acpl) / (hi.acpl - lo.acpl)
      return lo.adj + t * (hi.adj - lo.adj)
    }
  }
  return last.adj
}

/** Below this many own moves the estimate is shrunk toward the middle and widened. */
const SHORT_GAME_MOVES = 20
/** Maximum shrink fraction toward SHRINK_CENTER for a vanishingly short game. */
const SHORT_GAME_SHRINK = 0.35
const SHRINK_CENTER = 1500

/**
 * Estimate a per-game Elo band from accuracy, blended with ACPL.
 *
 * @param accuracy game accuracy% (0..100).
 * @param moveCount number of the side's own moves analyzed (drives band width).
 *        Fewer moves => wider band (less signal); <20 also shrinks the estimate
 *        toward the middle (short games overrate on the accuracy curve alone).
 * @param acplValue the side's average centipawn loss for the game, if known.
 *        Omitted (e.g. raw perf:estimate calls, placement) => pure accuracy curve.
 */
export function estimateElo(accuracy: number, moveCount = 30, acplValue?: number): EloBand {
  let est = accuracyToElo(accuracy)

  // 2) ACPL blend: additive nudge from the leak-rate bands.
  if (acplValue != null && Number.isFinite(acplValue)) {
    est += acplAdjustment(acplValue)
  }

  const n = Math.max(1, moveCount)

  // 3) Short-game honesty: pull extreme estimates toward the middle, scaled by
  //    how little evidence there is (full data at SHORT_GAME_MOVES+).
  if (n < SHORT_GAME_MOVES) {
    const shrink = SHORT_GAME_SHRINK * (1 - n / SHORT_GAME_MOVES)
    est = SHRINK_CENTER + (est - SHRINK_CENTER) * (1 - shrink)
  }

  est = Math.max(ELO_FLOOR, Math.min(ELO_CEIL, est))

  // Band half-width ~250 Elo at 20 moves, shrinking with sqrt(moves)
  // (inverse-variance flavor); short games get a progressively widened (up to
  // +25%), higher-capped band so the label never claims precision a 10-move
  // game cannot carry. The widen factor is continuous at the 20-move boundary.
  const widen = n < SHORT_GAME_MOVES ? 1 + 0.25 * (1 - n / SHORT_GAME_MOVES) : 1
  const halfWidth = Math.max(
    140,
    Math.min(n < SHORT_GAME_MOVES ? 600 : 400, 250 * widen * Math.sqrt(SHORT_GAME_MOVES / n))
  )

  const low = Math.max(ELO_FLOOR, est - halfWidth)
  const high = Math.min(ELO_CEIL, est + halfWidth)

  return {
    est: Math.round(est),
    low: Math.round(low),
    high: Math.round(high),
    accuracy: Math.round(accuracy * 10) / 10,
    kind: 'estimate'
  }
}
