import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { RotateCcw, ChevronRight, GraduationCap, ChevronDown } from 'lucide-react'
import { Board } from '../../board/Board'
import { pieceSetClass } from '../../board/pieceSets'
import { useSettings } from '../../state/settings'
import { usePuzzleSession } from './usePuzzleSession'
import { HintArrow } from './HintArrow'
import { PuzzlePrompt } from './PuzzlePrompt'
import { RatingPanel } from './RatingPanel'
import { StreakBadge } from './StreakBadge'
import { HintLadder } from './HintLadder'
import { ThemePicker } from './ThemePicker'
import { CoachHint } from '../../components/CoachHint'
import './puzzles.css'

/**
 * Puzzles trainer — board + side panel over the bundled puzzle DB.
 * Default export so it can be routed in App.tsx (currently a Placeholder).
 * Takes no props.
 */
export default function PuzzlesView(): JSX.Element {
  const { settings } = useSettings()
  const s = usePuzzleSession()
  const [coachOpen, setCoachOpen] = useState(false)

  const isSolving = s.phase === 'solving'
  const isDone = s.phase === 'solved' || s.phase === 'failed'
  const isLoading = s.phase === 'loading'
  const isEmpty = s.phase === 'empty' || s.phase === 'error'

  // Keyboard shortcuts: n = next, r = retry, h = hint.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'n') {
        if (isDone || isEmpty) s.next()
      } else if (e.key === 'r') {
        if (s.puzzle) s.retry()
      } else if (e.key === 'h') {
        if (isSolving) s.bumpHint()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isDone, isEmpty, isSolving, s])

  return (
    <div className="puzzles-view">
      <div className="board-area">
        <div className="board-stage">
          <div className={`board-wrap board-${settings.boardTheme} ${pieceSetClass(settings.pieceSet)}`}>
            <Board
              fen={s.fen}
              orientation={s.orientation}
              turnColor={s.turn}
              dests={s.dests}
              movableColor={s.orientation}
              viewOnly={!isSolving}
              lastMove={s.lastMove}
              check={s.check}
              showDests={settings.showLegal}
              coordinates={settings.coordinates}
              animation={settings.animation}
              onMove={s.onUserMove}
              syncNonce={s.nonce}
            />
            <HintArrow from={s.hintFrom} to={s.hintTo} stage={s.hintStage} orientation={s.orientation} />
            {isLoading && <div className="puzzle-skeleton" aria-hidden />}
          </div>
        </div>

        <div className="board-controls">
          <button className="icon-btn" onClick={s.retry} disabled={!s.puzzle} title="Retry (r)">
            <RotateCcw size={18} />
          </button>
          <button className="icon-btn" onClick={s.next} title="Next puzzle (n)">
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <aside className="analysis-sidebar">
        <PuzzlePrompt phase={s.phase} userColor={s.orientation} correctSan={s.correctSan} />

        {!s.apiReady && (
          <div className="panel pad muted small">
            Preview mode — connect to the desktop app to load puzzles and ratings.
          </div>
        )}

        <div className="puzzle-meta">
          <RatingPanel
            rating={s.puzzleRating}
            rd={s.puzzleRd}
            delta={s.delta}
            ratingAfter={s.ratingAfter}
            animateKey={s.attemptCount}
          />
          <StreakBadge streak={s.streak} best={s.best} />
        </div>

        <div className="panel pad hint-row">
          <HintLadder
            stage={s.hintStage}
            disabled={!isSolving}
            onHint={s.bumpHint}
            revealSan={s.revealSan}
          />
          <div className="hint-actions">
            <button className="btn ghost" onClick={s.retry} disabled={!s.puzzle}>
              Retry
            </button>
            <button className="btn" onClick={s.next}>
              Next
            </button>
          </div>
        </div>

        {s.puzzle && (
          <div className="panel coachhint-panel">
            <button
              type="button"
              className="panel-head coachhint-toggle"
              onClick={() => setCoachOpen((o) => !o)}
              aria-expanded={coachOpen}
            >
              <span className="panel-title">
                <GraduationCap size={15} /> Coach
              </span>
              <ChevronDown
                size={16}
                className={`coachhint-chevron${coachOpen ? ' is-open' : ''}`}
              />
            </button>
            {coachOpen && (
              <div className="coachhint-panel-body">
                <p className="muted small coachhint-lede">
                  Conceptual guidance for this position — no solution spoilers.
                </p>
                <CoachHint fen={s.fen} />
              </div>
            )}
          </div>
        )}

        {isEmpty && (
          <div className="panel pad puzzle-empty">
            <div className="muted">
              {s.phase === 'error'
                ? 'Could not load a puzzle.'
                : s.theme
                  ? 'No puzzles match this theme.'
                  : 'No puzzles available.'}
            </div>
            {s.theme && (
              <button className="btn ghost" onClick={() => s.setTheme(null)}>
                Clear filter
              </button>
            )}
          </div>
        )}

        <ThemePicker themes={s.themes} active={s.theme} onPick={s.setTheme} />
      </aside>
    </div>
  )
}
