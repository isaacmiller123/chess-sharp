import type { CurriculumBand, LessonKind } from '../../../../shared/types'

/** Human-friendly label for a lesson kind chip. */
export function kindLabel(kind: LessonKind): string {
  switch (kind) {
    case 'concept':
      return 'Concept'
    case 'tactics':
      return 'Tactics'
    case 'endgame':
      return 'Endgame'
    case 'opening':
      return 'Opening'
    case 'strategy':
      return 'Strategy'
    default:
      return kind
  }
}

/** Format an inclusive rating range as "800–1200" (en dash, no spaces). */
export function formatRatingRange(range: [number, number]): string {
  const [lo, hi] = range
  return lo === hi ? `${lo}` : `${lo}–${hi}`
}

/**
 * Turn a raw Lichess-style theme key (e.g. "backRankMate", "hangingPiece")
 * into a readable chip label ("Back rank mate", "Hanging piece"). Handles
 * camelCase, snake_case and kebab-case keys.
 */
export function themeLabel(key: string): string {
  const spaced = key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

export interface CurriculumCounts {
  bands: number
  units: number
  lessons: number
  themes: number
}

/** Roll up overall counts across the curriculum tree (progress scaffolding). */
export function countCurriculum(bands: CurriculumBand[]): CurriculumCounts {
  let units = 0
  let lessons = 0
  const themes = new Set<string>()
  for (const band of bands) {
    units += band.units.length
    for (const unit of band.units) {
      lessons += unit.lessons.length
      for (const lesson of unit.lessons) {
        for (const t of lesson.linkedThemes) themes.add(t)
      }
    }
  }
  return { bands: bands.length, units, lessons, themes: themes.size }
}
