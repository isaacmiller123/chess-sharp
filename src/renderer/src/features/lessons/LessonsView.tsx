import { useMemo, useState } from 'react'
import type { JSX } from 'react'
import { GraduationCap, Layers, BookOpen, Dumbbell, Trophy, ChevronRight } from 'lucide-react'
import type { CurriculumLesson } from '../../../../shared/types'
import { useCurriculum } from './useCurriculum'
import { countCurriculum, formatRatingRange } from './format'
import LessonRow from './LessonRow'
import LessonDetail from './LessonDetail'
import './lessons.css'

export interface LessonsViewProps {
  onNavigate: (view: string) => void
}

interface SelectedLesson {
  lesson: CurriculumLesson
  unitTitle: string
  bandLabel: string
}

export default function LessonsView({ onNavigate }: LessonsViewProps): JSX.Element {
  const { status, bands } = useCurriculum()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const counts = useMemo(() => countCurriculum(bands), [bands])

  // Resolve the selected lesson together with its unit/band context so the
  // detail panel can show a breadcrumb without a second lookup.
  const selected: SelectedLesson | null = useMemo(() => {
    if (!selectedId) return null
    for (const band of bands) {
      for (const unit of band.units) {
        const lesson = unit.lessons.find((l) => l.id === selectedId)
        if (lesson) return { lesson, unitTitle: unit.title, bandLabel: band.label }
      }
    }
    return null
  }, [selectedId, bands])

  const trainThemes = (): void => onNavigate('puzzles')

  return (
    <div className="lessons-view">
      <header className="lessons-header">
        <div className="lessons-heading">
          <span className="lessons-heading-icon">
            <GraduationCap size={22} aria-hidden />
          </span>
          <div>
            <h1 className="lessons-title">Lessons</h1>
            <p className="lessons-subtitle">
              A guided curriculum from your first moves to advanced play.
            </p>
          </div>
        </div>

        <button className="btn ghost lessons-famous-cta" onClick={() => onNavigate('famous')}>
          <Trophy size={16} aria-hidden />
          <span>Famous games</span>
          <ChevronRight size={16} aria-hidden />
        </button>

        {status === 'ready' && (
          <div className="lessons-stats" role="group" aria-label="Curriculum overview">
            <Stat icon={<Layers size={15} aria-hidden />} value={counts.bands} label="Bands" />
            <Stat icon={<BookOpen size={15} aria-hidden />} value={counts.units} label="Units" />
            <Stat
              icon={<GraduationCap size={15} aria-hidden />}
              value={counts.lessons}
              label="Lessons"
            />
            <Stat
              icon={<Dumbbell size={15} aria-hidden />}
              value={counts.themes}
              label="Themes"
            />
          </div>
        )}
      </header>

      {status === 'loading' && (
        <div className="lessons-state muted">Loading curriculum…</div>
      )}
      {status === 'error' && (
        <div className="lessons-state muted">Curriculum is unavailable right now.</div>
      )}
      {status === 'empty' && (
        <div className="lessons-state muted">No lessons have been added yet.</div>
      )}

      {status === 'ready' && (
        <div className={`lessons-layout ${selected ? 'has-detail' : ''}`}>
          <div className="lessons-track">
            {bands.map((band) => (
              <section key={band.id} className="band">
                <div className="band-head">
                  <div className="band-marker" aria-hidden>
                    <span className="band-order num">{band.order}</span>
                  </div>
                  <div className="band-head-text">
                    <div className="band-titlerow">
                      <h2 className="band-label">{band.label}</h2>
                      <span className="band-rating num">
                        {formatRatingRange(band.ratingRange)}
                      </span>
                    </div>
                    <p className="band-goal">{band.goal}</p>
                  </div>
                </div>

                <div className="band-units">
                  {band.units.map((unit) => (
                    <div key={unit.id} className="unit">
                      <div className="unit-head">
                        <h3 className="unit-title">{unit.title}</h3>
                        <span className="unit-goal">{unit.goal}</span>
                      </div>
                      <div className="unit-lessons">
                        {unit.lessons.map((lesson) => (
                          <LessonRow
                            key={lesson.id}
                            lesson={lesson}
                            active={lesson.id === selectedId}
                            onSelect={(l) => setSelectedId(l.id)}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>

          {selected && (
            <LessonDetail
              lesson={selected.lesson}
              unitTitle={selected.unitTitle}
              bandLabel={selected.bandLabel}
              onClose={() => setSelectedId(null)}
              onTrain={trainThemes}
            />
          )}
        </div>
      )}
    </div>
  )
}

function Stat({
  icon,
  value,
  label
}: {
  icon: JSX.Element
  value: number
  label: string
}): JSX.Element {
  return (
    <div className="lessons-stat">
      <span className="lessons-stat-icon">{icon}</span>
      <span className="lessons-stat-num num">{value}</span>
      <span className="lessons-stat-label">{label}</span>
    </div>
  )
}
