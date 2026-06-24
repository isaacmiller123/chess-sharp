// Eval -> Win% and display helpers (Lichess model; see docs/content-coaching.md).
import type { Color } from './chess'

export interface Score {
  cp?: number
  mate?: number
}

// Side-to-move-relative engine score -> White-relative score.
export function toWhite(score: Score, sideToMove: Color): Score {
  const sign = sideToMove === 'white' ? 1 : -1
  return {
    cp: score.cp === undefined ? undefined : score.cp * sign,
    mate: score.mate === undefined ? undefined : score.mate * sign
  }
}

// Lichess centipawn -> Win% (0..100), from the perspective of the cp's owner.
export function winPercent(cp: number): number {
  const c = Math.max(-1000, Math.min(1000, cp))
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * c)) - 1)
}

// White win-expectancy 0..100 for the eval bar fill.
export function whiteWinPercent(score: Score): number {
  if (score.mate !== undefined) return score.mate > 0 ? 100 : 0
  if (score.cp !== undefined) return winPercent(score.cp)
  return 50
}

// Compact eval label like "+1.25", "-0.30", "M5", "-M3".
export function formatScore(score: Score): string {
  if (score.mate !== undefined) {
    const sign = score.mate > 0 ? '' : '-'
    return `${sign}M${Math.abs(score.mate)}`
  }
  if (score.cp !== undefined) {
    const p = score.cp / 100
    return (p > 0 ? '+' : p < 0 ? '' : '+') + p.toFixed(2)
  }
  return '0.00'
}
