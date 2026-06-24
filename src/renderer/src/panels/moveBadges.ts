// Move-classification badge helpers shared by the MoveList and review panels.
// Maps the review `MoveBadge` union onto a tone (which --class-* token drives the
// color) plus a compact label/abbreviation for tight inline rendering.
import type { MoveBadge } from '@shared/types'

export type BadgeMap = Map<number, MoveBadge>

// Visual tone => the design-token color used. Several badges share a tone
// (e.g. Best / Great map to the "best" green) to keep the palette tight.
export type BadgeTone =
  | 'brilliant'
  | 'best'
  | 'good'
  | 'book'
  | 'inaccuracy'
  | 'mistake'
  | 'blunder'

const TONE: Record<MoveBadge, BadgeTone> = {
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

// Single-glyph marks rendered next to a move. ASCII/Unicode symbols only — no
// emoji (product rule). "!" family for strong, "?" family for weak.
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

export function badgeTone(badge: MoveBadge): BadgeTone {
  return TONE[badge]
}

export function badgeAbbr(badge: MoveBadge): string {
  return ABBR[badge]
}

// Whether a badge is worth surfacing inline in the move list. Routine "Good"
// moves are suppressed to avoid a wall of marks; everything notable is shown.
export function isNotableBadge(badge: MoveBadge): boolean {
  return badge !== 'Good' && badge !== 'Excellent'
}
