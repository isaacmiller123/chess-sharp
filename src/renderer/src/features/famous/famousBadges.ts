// Self-contained move-classification badge helpers for the Famous-games viewer.
// Mirrors the renderer's shared badge semantics but keeps tone/abbr local so the
// feature never depends on another feature's CSS. Tones resolve to --class-*
// tokens via the .fg-tone-* classes in famous.css. No emoji (product rule).
import type { MoveBadge } from '@shared/types'

export type FamousBadgeTone =
  | 'brilliant'
  | 'best'
  | 'good'
  | 'book'
  | 'inaccuracy'
  | 'mistake'
  | 'blunder'

const TONE: Record<MoveBadge, FamousBadgeTone> = {
  Brilliant: 'brilliant',
  Great: 'best',
  Best: 'best',
  Excellent: 'good',
  Good: 'good',
  Book: 'book',
  Forced: 'book',
  Inaccuracy: 'inaccuracy',
  Mistake: 'mistake',
  Blunder: 'blunder'
}

// Single/short glyph marks — ASCII/Unicode only, never emoji.
const ABBR: Record<MoveBadge, string> = {
  Brilliant: '!!',
  Great: '!',
  Best: '*',
  Excellent: '+',
  Good: '+',
  Book: 'B',
  Forced: '=',
  Inaccuracy: '?!',
  Mistake: '?',
  Blunder: '??'
}

export function famousBadgeTone(badge: MoveBadge): FamousBadgeTone {
  return TONE[badge]
}

export function famousBadgeAbbr(badge: MoveBadge): string {
  return ABBR[badge]
}

// Whether a badge deserves an inline mark next to the move. Routine moves are
// suppressed so a long master game does not turn into a wall of marks.
export function isNotableFamousBadge(badge: MoveBadge): boolean {
  return badge !== 'Good' && badge !== 'Excellent'
}
