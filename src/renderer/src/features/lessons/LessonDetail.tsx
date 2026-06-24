import { useEffect, useState, type JSX } from 'react'
import { Target, Dumbbell, X, Lightbulb, BookOpen, ChevronLeft, ChevronRight } from 'lucide-react'
import type { Key } from 'chessground/types'
import type { CurriculumLesson, LessonContent } from '../../../../shared/types'
import { Board } from '../../board/Board'
import { pieceSetClass } from '../../board/pieceSets'
import { useSettings } from '../../state/settings'
import { formatRatingRange, kindLabel, themeLabel } from './format'

const NO_DESTS = new Map<Key, Key[]>()

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
  const { settings } = useSettings()
  const [content, setContent] = useState<LessonContent | null>(null)
  const [loading, setLoading] = useState(true)
  const [exampleIdx, setExampleIdx] = useState(0)

  useEffect(() => {
    let cancelled = false
    setContent(null)
    setExampleIdx(0)
    setLoading(true)
    const api = window.api?.curriculum
    if (!api) {
      setLoading(false)
      return
    }
    api
      .lessonContent(lesson.id)
      .then((r) => {
        if (!cancelled) setContent(r.content)
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [lesson.id])

  const examples = content?.examples ?? []
  const example = examples[exampleIdx]
  const exampleFen = example?.fen

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

        {/* Interactive teaching content */}
        {content?.intro && (
          <section className="lesson-detail-section">
            <h3 className="lesson-detail-subhead">
              <BookOpen size={15} aria-hidden /> Lesson
            </h3>
            <p className="lesson-intro">{content.intro}</p>
          </section>
        )}

        {exampleFen && (
          <section className="lesson-detail-section lesson-example">
            <div className={`board-wrap board-${settings.boardTheme} ${pieceSetClass(settings.pieceSet)}`}>
              <Board
                fen={exampleFen}
                orientation="white"
                turnColor={exampleFen.split(' ')[1] === 'b' ? 'black' : 'white'}
                dests={NO_DESTS}
                viewOnly
                showDests={false}
                coordinates={settings.coordinates}
                animation={settings.animation}
              />
            </div>
            {example?.title && <h4 className="lesson-example-title">{example.title}</h4>}
            {example?.explanation && <p className="lesson-example-text">{example.explanation}</p>}
            {examples.length > 1 && (
              <div className="lesson-example-nav">
                <button
                  className="icon-btn"
                  onClick={() => setExampleIdx((i) => Math.max(0, i - 1))}
                  disabled={exampleIdx === 0}
                  title="Previous example"
                >
                  <ChevronLeft size={18} />
                </button>
                <span className="muted small num">
                  {exampleIdx + 1} / {examples.length}
                </span>
                <button
                  className="icon-btn"
                  onClick={() => setExampleIdx((i) => Math.min(examples.length - 1, i + 1))}
                  disabled={exampleIdx === examples.length - 1}
                  title="Next example"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            )}
          </section>
        )}

        {content && content.keyPoints.length > 0 && (
          <section className="lesson-detail-section">
            <h3 className="lesson-detail-subhead">
              <Lightbulb size={15} aria-hidden /> Key points
            </h3>
            <ul className="lesson-keypoints">
              {content.keyPoints.map((k, i) => (
                <li key={i}>{k}</li>
              ))}
            </ul>
          </section>
        )}

        {loading && <div className="muted small lesson-content-loading">Loading lesson…</div>}

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
