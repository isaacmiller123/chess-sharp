import type { JSX } from 'react'
import { Target, Dumbbell, X } from 'lucide-react'
import type { CurriculumLesson } from '../../../../shared/types'
import { formatRatingRange, kindLabel, themeLabel } from './format'

export interface LessonDetailProps {
  lesson: CurriculumLesson
  unitTitle: string
  bandLabel: string
  onClose: () => void
  onTrain: () => void
}

export default function LessonDetail({
  lesson,
  unitTitle,
  bandLabel,
  onClose,
  onTrain
}: LessonDetailProps): JSX.Element {
  return (
    <aside className="panel lesson-detail" aria-label={`Lesson: ${lesson.title}`}>
      <div className="panel-head">
        <span className="panel-title">Lesson</span>
        <button className="icon-btn lesson-detail-close" onClick={onClose} title="Close">
          <X size={16} />
        </button>
      </div>

      <div className="lesson-detail-body">
        <div className="lesson-detail-crumb">
          {bandLabel} <span className="lesson-detail-crumb-sep">/</span> {unitTitle}
        </div>

        <div className="lesson-detail-titlerow">
          <span className={`lesson-kind kind-${lesson.kind}`}>{kindLabel(lesson.kind)}</span>
          <h2 className="lesson-detail-title">{lesson.title}</h2>
        </div>

        <div className="lesson-detail-rating">
          <span className="muted small">Recommended rating</span>
          <span className="lesson-detail-rating-num num">
            {formatRatingRange(lesson.ratingRange)}
          </span>
        </div>

        <p className="lesson-detail-summary">{lesson.summary}</p>

        {lesson.objectives.length > 0 && (
          <section className="lesson-detail-section">
            <h3 className="lesson-detail-subhead">
              <Target size={15} aria-hidden /> Objectives
            </h3>
            <ul className="lesson-objectives">
              {lesson.objectives.map((o, i) => (
                <li key={i}>{o}</li>
              ))}
            </ul>
          </section>
        )}

        {lesson.linkedThemes.length > 0 && (
          <section className="lesson-detail-section">
            <h3 className="lesson-detail-subhead">
              <Dumbbell size={15} aria-hidden /> Linked puzzle themes
            </h3>
            <div className="lesson-detail-themes">
              {lesson.linkedThemes.map((t) => (
                <button
                  key={t}
                  type="button"
                  className="theme-chip theme-chip-train"
                  onClick={onTrain}
                  title={`Train ${themeLabel(t)} puzzles`}
                >
                  <span className="theme-chip-label">{themeLabel(t)}</span>
                  <span className="theme-chip-train-cta">Train</span>
                </button>
              ))}
            </div>
            <button type="button" className="btn lesson-train-all" onClick={onTrain}>
              <Dumbbell size={15} aria-hidden /> Train these themes
            </button>
          </section>
        )}
      </div>
    </aside>
  )
}
