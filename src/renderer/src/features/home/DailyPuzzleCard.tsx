import { useEffect, useMemo, useState, type JSX } from 'react'
import { Sparkles } from 'lucide-react'
import type { Puzzle } from '../../../../shared/types'
import { Board } from '../../board/Board'
import { turnColor, type Color } from '../../chess/chess'
import { useSettings } from '../../state/settings'
import type { HomeNavTarget } from './HomeView'
import { humanizeTheme } from './format'

export interface DailyPuzzleCardProps {
  onNavigate: (view: HomeNavTarget) => void
}

interface DailyState {
  puzzle: Puzzle | null
  loading: boolean
}

export default function DailyPuzzleCard({ onNavigate }: DailyPuzzleCardProps): JSX.Element {
  const { settings } = useSettings()
  const [state, setState] = useState<DailyState>({ puzzle: null, loading: true })

  useEffect(() => {
    let cancelled = false
    const api = window.api
    if (!api) {
      setState({ puzzle: null, loading: false })
      return
    }
    void (async () => {
      try {
        const res = await api.puzzles.next({})
        if (!cancelled) setState({ puzzle: res.puzzle ?? null, loading: false })
      } catch {
        if (!cancelled) setState({ puzzle: null, loading: false })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const { puzzle, loading } = state

  // Validate FEN once; if it throws, render text-only (no board preview).
  const orientation = useMemo<Color | null>(() => {
    if (!puzzle) return null
    try {
      return turnColor(puzzle.fen)
    } catch {
      return null
    }
  }, [puzzle])

  const theme = puzzle && puzzle.themes.length > 0 ? humanizeTheme(puzzle.themes[0]) : ''

  return (
    <section className="card home-card daily-card">
      <div className="card-title-row">
        <h3 className="card-title">
          <Sparkles size={14} aria-hidden /> Daily puzzle
        </h3>
      </div>

      {loading ? (
        <p className="muted small">Loading…</p>
      ) : !puzzle ? (
        <div className="daily-body">
          <p className="muted small">No puzzle available.</p>
          <button className="btn ghost" onClick={() => onNavigate('puzzles')}>
            Open puzzles
          </button>
        </div>
      ) : (
        <div className="daily-body">
          {orientation && (
            <div className={`daily-board board-${settings.boardTheme}`}>
              <Board
                fen={puzzle.fen}
                orientation={orientation}
                turnColor={orientation}
                dests={new Map()}
                viewOnly
                coordinates={false}
                showDests={false}
                animation={false}
              />
            </div>
          )}
          <div className="daily-meta">
            <div className="daily-rating">
              <span className="daily-rating-num">{Math.round(puzzle.rating)}</span>
              <span className="muted small">rating</span>
            </div>
            {theme && <span className="daily-theme small muted">{theme}</span>}
            <button className="btn daily-solve" onClick={() => onNavigate('puzzles')}>
              Solve
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
