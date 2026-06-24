import type { JSX } from 'react'
import {
  ArrowRight,
  GraduationCap,
  Layers,
  Puzzle as PuzzleIcon,
  Target,
  type LucideIcon
} from 'lucide-react'
import type { CurriculumBand, GameRow, ProgressSummary } from '../../../../shared/types'
import type { HomeNavTarget } from './HomeView'
import { lessonKindLabel, pickBand, resultKind, suggestNextLesson } from './format'

export interface InsightsStripProps {
  summary: ProgressSummary | null
  games: GameRow[]
  bands: CurriculumBand[]
  /** Solved-count baseline captured at first load this run; null until known. */
  sessionBaseline: number | null
  onNavigate: (view: HomeNavTarget) => void
}

interface StatTileProps {
  Icon: LucideIcon
  label: string
  value: string
  hint?: string
}

function StatTile({ Icon, label, value, hint }: StatTileProps): JSX.Element {
  return (
    <div className="insight-tile">
      <span className="insight-tile-icon" aria-hidden>
        <Icon size={16} />
      </span>
      <div className="insight-tile-body">
        <span className="insight-tile-label">{label}</span>
        <span className="insight-tile-value">{value}</span>
        {hint && <span className="insight-tile-hint small muted">{hint}</span>}
      </div>
    </div>
  )
}

/**
 * Pull the most recent game that carries an accuracy figure for the user's
 * side. Returns a rounded percentage string or null when nothing is reviewed.
 */
function recentAccuracy(games: GameRow[]): string | null {
  for (const g of games) {
    const acc = g.user_color === 'black' ? g.accuracy_black : g.accuracy_white
    if (acc != null && Number.isFinite(acc)) return `${Math.round(acc)}%`
  }
  return null
}

/** Win count among the recent games (best-effort form indicator). */
function recentForm(games: GameRow[]): { wins: number; total: number } {
  let wins = 0
  let total = 0
  for (const g of games) {
    const kind = resultKind(g)
    if (kind === 'unknown') continue
    total += 1
    if (kind === 'win') wins += 1
  }
  return { wins, total }
}

export default function InsightsStrip({
  summary,
  games,
  bands,
  sessionBaseline,
  onNavigate
}: InsightsStripProps): JSX.Element {
  const solvedTotal =
    summary && Number.isFinite(summary.puzzlesSolved) ? summary.puzzlesSolved : 0
  const solvedSession =
    sessionBaseline != null ? Math.max(0, solvedTotal - sessionBaseline) : 0

  // The curriculum is keyed off the puzzle rating, which is the app's primary
  // skill signal for learning content.
  const rating =
    summary && Number.isFinite(summary.puzzleRating) ? summary.puzzleRating : 0
  const pick = pickBand(bands, rating)
  const nextLesson = pick ? suggestNextLesson(pick.band, rating) : null

  const accuracy = recentAccuracy(games)
  const form = recentForm(games)

  // Brand-new profile: nothing rated, nothing solved, no games, no curriculum.
  const isFresh =
    solvedTotal === 0 &&
    games.length === 0 &&
    (summary == null || summary.gamesPlayed === 0) &&
    !pick

  if (isFresh) {
    return (
      <section className="card home-card insights-card">
        <div className="insights-empty">
          <span className="insights-empty-icon" aria-hidden>
            <Target size={18} />
          </span>
          <div className="insights-empty-body">
            <p className="insights-empty-title">Your insights will appear here</p>
            <p className="small muted">
              Solve a puzzle or play a game to start tracking accuracy, progress, and a
              suggested lesson path.
            </p>
          </div>
          <button className="btn" onClick={() => onNavigate('puzzles')}>
            Solve a puzzle
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="card home-card insights-card" aria-label="Insights">
      <div className="insights-stats">
        <StatTile
          Icon={PuzzleIcon}
          label="Puzzles solved"
          value={solvedTotal.toLocaleString()}
          hint={solvedSession > 0 ? `+${solvedSession} this session` : 'total'}
        />
        <StatTile
          Icon={Target}
          label="Recent accuracy"
          value={accuracy ?? '—'}
          hint={accuracy ? 'last reviewed game' : 'review a game'}
        />
        <StatTile
          Icon={Layers}
          label="Current band"
          value={pick ? pick.band.label : '—'}
          hint={
            pick
              ? pick.belowFloor
                ? 'building the basics'
                : form.total > 0
                  ? `${form.wins}/${form.total} recent wins`
                  : pick.band.goal
              : 'not placed yet'
          }
        />
      </div>

      {nextLesson && pick && (
        <button
          className="insights-next"
          onClick={() => onNavigate('lessons')}
          aria-label={`Next lesson: ${nextLesson.title}`}
        >
          <span className="insights-next-icon" aria-hidden>
            <GraduationCap size={18} />
          </span>
          <span className="insights-next-body">
            <span className="insights-next-kicker small muted">
              Suggested next · {lessonKindLabel(nextLesson.kind)}
            </span>
            <span className="insights-next-title">{nextLesson.title}</span>
          </span>
          <ArrowRight size={16} aria-hidden className="insights-next-arrow" />
        </button>
      )}
    </section>
  )
}
