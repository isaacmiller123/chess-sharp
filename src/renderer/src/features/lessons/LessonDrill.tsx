import type { JSX } from 'react'
import { CheckCircle2, XCircle, Dumbbell, RotateCcw, SkipForward, ArrowRight } from 'lucide-react'
import type { Key } from 'chessground/types'
import type { CurriculumLesson } from '../../../../shared/types'
import { Board } from '../../board/Board'
import { pieceSetClass } from '../../board/pieceSets'
import { useSettings } from '../../state/settings'
import { useLessonDrill, type DrillPhase } from './useLessonDrill'
import { formatRatingRange } from './format'

const NO_DESTS = new Map<Key, Key[]>()

export interface LessonDrillProps {
  lesson: CurriculumLesson
}

function colorLabel(c: 'white' | 'black'): string {
  return c === 'white' ? 'White' : 'Black'
}

interface Banner {
  cls: string
  title: string
  subtitle: string
}

function banner(phase: DrillPhase, userColor: 'white' | 'black', correctSan: string | null): Banner {
  switch (phase) {
    case 'solved':
      return { cls: 'is-solved', title: 'Solved', subtitle: 'Well played. Keep the streak going.' }
    case 'failed':
      return {
        cls: 'is-failed',
        title: 'Not quite',
        subtitle: correctSan ? `The move was ${correctSan}.` : 'That was not the move.'
      }
    case 'empty':
      return {
        cls: '',
        title: 'No puzzles found',
        subtitle: 'No puzzles match these themes in this rating range yet.'
      }
    case 'error':
      return { cls: '', title: 'Something went wrong', subtitle: 'Could not load a puzzle.' }
    case 'loading':
      return { cls: '', title: 'Loading…', subtitle: 'Finding a position for you.' }
    case 'leadin':
    case 'solving':
    default:
      return { cls: '', title: `Find the best move for ${colorLabel(userColor)}`, subtitle: 'Your move.' }
  }
}

/**
 * Inline puzzle drill inside the lesson detail. Reuses Board + the chess helpers
 * via useLessonDrill; validates the solution exactly like the puzzle trainer.
 */
export default function LessonDrill({ lesson }: LessonDrillProps): JSX.Element {
  const { settings } = useSettings()
  const drill = useLessonDrill(lesson)
  const {
    apiReady,
    phase,
    fen,
    orientation,
    turn,
    check,
    dests,
    lastMove,
    nonce,
    correctSan,
    stats,
    start,
    onUserMove,
    next,
    skip,
    retry
  } = drill

  if (!apiReady) {
    return (
      <section className="lesson-detail-section lesson-drill">
        <p className="muted small lesson-drill-empty">Puzzles are unavailable right now.</p>
      </section>
    )
  }

  // Idle: a call-to-action card before the first puzzle is pulled.
  if (phase === 'idle') {
    return (
      <section className="lesson-detail-section lesson-drill">
        <div className="lesson-drill-intro">
          <p className="lesson-drill-intro-text">
            Practise this lesson on real positions. Puzzles are drawn from the linked themes within
            the {formatRatingRange(lesson.ratingRange)} range.
          </p>
          <button type="button" className="btn lesson-drill-start" onClick={start}>
            <Dumbbell size={15} aria-hidden /> Start drill
          </button>
        </div>
      </section>
    )
  }

  const b = banner(phase, orientation, correctSan)
  const isDone = phase === 'solved' || phase === 'failed'
  const isEnded = phase === 'empty' || phase === 'error'
  const movableColor = phase === 'solving' ? turn : undefined

  return (
    <section className="lesson-detail-section lesson-drill" aria-label="Lesson drill">
      <div className="lesson-drill-head">
        <span className="lesson-drill-tally" role="status" aria-live="polite">
          <span className="lesson-drill-tally-item is-solved">
            <CheckCircle2 size={13} aria-hidden /> {stats.solved}
          </span>
          <span className="lesson-drill-tally-item is-failed">
            <XCircle size={13} aria-hidden /> {stats.failed}
          </span>
          <span className="lesson-drill-tally-item muted">
            <span className="num">{stats.seen}</span> seen
          </span>
        </span>
      </div>

      {!isEnded && (
        <div
          className={`board-wrap lesson-drill-board board-${settings.boardTheme} ${pieceSetClass(settings.pieceSet)}`}
        >
          <Board
            fen={fen}
            orientation={orientation}
            turnColor={turn}
            movableColor={movableColor}
            dests={phase === 'solving' ? dests : NO_DESTS}
            lastMove={lastMove}
            check={check}
            viewOnly={phase !== 'solving'}
            showDests={phase === 'solving'}
            coordinates={settings.coordinates}
            animation={settings.animation}
            syncNonce={nonce}
            onMove={onUserMove}
          />
        </div>
      )}

      <div className={`lesson-drill-banner ${b.cls}`} role="status" aria-live="polite">
        <span className="lesson-drill-banner-title">
          {phase === 'solved' && <CheckCircle2 size={15} aria-hidden />}
          {phase === 'failed' && <XCircle size={15} aria-hidden />}
          {b.title}
        </span>
        <span className="lesson-drill-banner-sub">{b.subtitle}</span>
      </div>

      <div className="lesson-drill-actions">
        {isDone && (
          <>
            {phase === 'failed' && (
              <button type="button" className="btn" onClick={retry} title="Try this puzzle again">
                <RotateCcw size={15} aria-hidden /> Retry
              </button>
            )}
            <button type="button" className="btn lesson-drill-next" onClick={next}>
              Next puzzle <ArrowRight size={15} aria-hidden />
            </button>
          </>
        )}
        {!isDone && !isEnded && (
          <button
            type="button"
            className="btn ghost"
            onClick={skip}
            disabled={phase === 'loading'}
            title="Skip this puzzle"
          >
            <SkipForward size={15} aria-hidden /> Skip
          </button>
        )}
        {isEnded && (
          <button type="button" className="btn" onClick={next} title="Try again">
            <RotateCcw size={15} aria-hidden /> Try again
          </button>
        )}
      </div>
    </section>
  )
}
