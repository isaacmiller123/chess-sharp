// Per-game estimated-Elo BAND from accuracy (content-coaching.md §3.1 accuracy,
// architecture.md §11.1.8 "accuracy-based per-game Elo band ... always a range,
// labeled distinct from the Glicko rating").
//
// This is a deliberately SEPARATE estimate from the Glicko puzzle/vs-bot rating.
// It maps a single game's accuracy% (0..100) to a strength estimate with an honest
// uncertainty band. The band narrows as the game gets longer (more moves = more
// signal), modeling the inverse-variance shrinkage the architecture calls for.

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

/**
 * Estimate a per-game Elo band from accuracy.
 *
 * @param accuracy game accuracy% (0..100).
 * @param moveCount number of the side's own moves analyzed (drives band width).
 *        Fewer moves => wider band (less signal). Default 30 => moderate band.
 */
export function estimateElo(accuracy: number, moveCount = 30): EloBand {
  const est = accuracyToElo(accuracy)

  // Base half-width ~250 Elo, shrinking with sqrt(moves) (inverse-variance flavor),
  // floored so we never claim false precision and capped for tiny games.
  const n = Math.max(1, moveCount)
  const halfWidth = Math.max(120, Math.min(450, 250 * Math.sqrt(20 / n)))

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
