import type { JSX } from 'react'
import RatingCard from './RatingCard'
import HeadlineStats from './HeadlineStats'
import TrendCard from './TrendCard'
import StreaksCard from './StreaksCard'
import AnalyticsCard from './AnalyticsCard'
import ResultsBreakdown from './ResultsBreakdown'
import GamesTable from './GamesTable'
import { useProgressData } from './useProgressData'
import './progress.css'

/**
 * Views the Progress page can navigate to. Kept local (mirrors HomeView's
 * pattern) to avoid coupling to a shared file. App.tsx's setView accepts the
 * superset, so passing it is assignment-compatible.
 */
export type ProgressNavTarget = 'play' | 'puzzles' | 'analysis'

export interface ProgressViewProps {
  /** Optional: navigate elsewhere within the app. */
  onNavigate?: (view: ProgressNavTarget) => void
  /** Open a saved game (by id) in the Analysis board. */
  onOpenGame?: (gameId: number) => void
}

export default function ProgressView({ onOpenGame }: ProgressViewProps = {}): JSX.Element {
  const { data } = useProgressData()

  return (
    <div className="progress-view">
      <header className="progress-header">
        <h1 className="progress-title">Progress</h1>
        <p className="progress-sub muted">
          Your ratings, trends, streaks, and game history.
        </p>
      </header>

      <div className="progress-grid">
        <RatingCard
          puzzle={data.puzzleRating}
          vsBot={data.vsBotRating}
          fallback={data.summary}
        />
        <HeadlineStats summary={data.summary} />
        <TrendCard games={data.trendGames} />
        <StreaksCard games={data.trendGames} summary={data.summary} />
      </div>

      <div className="progress-grid analytics-grid">
        <AnalyticsCard games={data.trendGames} summary={data.summary} />
        <ResultsBreakdown games={data.trendGames} />
      </div>

      <GamesTable onOpenGame={onOpenGame} />
    </div>
  )
}
