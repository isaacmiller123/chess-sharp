import type { JSX } from 'react'
import { ChevronRight } from 'lucide-react'
import type { CurriculumLesson } from '../../../../shared/types'
import { formatRatingRange, kindLabel, themeLabel } from './format'

export interface LessonRowProps {
  lesson: CurriculumLesson
  active: boolean
  onSelect: (lesson: CurriculumLesson) => void
}

// How many linked-theme chips to show inline before collapsing to a "+N" hint.
const MAX_THEME_CHIPS = 4

export default function LessonRow({ lesson, active, onSelect }: LessonRowProps): JSX.Element {
  const themes = lesson.linkedThemes
  const shown = themes.slice(0, MAX_THEME_CHIPS)
  const extra = themes.length - shown.length

  return (
    <button
      type="button"
      className={`lesson-row ${active ? 'is-active' : ''}`}
      onClick={() => onSelect(lesson)}
      aria-pressed={active}
    >
      <div className="lesson-row-main">
        <div className="lesson-row-head">
          <span className={`lesson-kind kind-${lesson.kind}`}>{kindLabel(lesson.kind)}</span>
          <span className="lesson-row-title">{lesson.title}</span>
          <span className="lesson-row-rating num">{formatRatingRange(lesson.ratingRange)}</span>
        </div>
        <p className="lesson-row-summary">{lesson.summary}</p>
        {themes.length > 0 && (
          <div className="lesson-row-themes">
            {shown.map((t) => (
              <span key={t} className="theme-chip">
                {themeLabel(t)}
              </span>
            ))}
            {extra > 0 && <span className="theme-chip theme-chip-more">+{extra}</span>}
          </div>
        )}
      </div>
      <ChevronRight size={18} className="lesson-row-chevron" aria-hidden />
    </button>
  )
}
