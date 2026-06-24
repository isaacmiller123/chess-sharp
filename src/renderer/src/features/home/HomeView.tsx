import type { JSX } from 'react'
import { useHomeData } from './useHomeData'
import QuickActions from './QuickActions'
import InsightsStrip from './InsightsStrip'
import StrengthCard from './StrengthCard'
import ContinueCard from './ContinueCard'
import RecentGamesCard from './RecentGamesCard'
import DailyPuzzleCard from './DailyPuzzleCard'
import './home.css'

/**
 * Views the Home dashboard can navigate to. Intentionally a strict subset of
 * Layout's ViewKey (no 'home'/'settings') and defined locally to avoid coupling
 * to a shared file. App.tsx's setView accepts the superset, so passing it is
 * assignment-compatible.
 */
export type HomeNavTarget = 'play' | 'puzzles' | 'analysis' | 'lessons' | 'openings' | 'progress'

export interface HomeViewProps {
  onNavigate: (view: HomeNavTarget) => void
}

export default function HomeView({ onNavigate }: HomeViewProps): JSX.Element {
  const { data, sessionBaseline } = useHomeData()
  const lastGame = data.games.length > 0 ? data.games[0] : null

  return (
    <div className="home-view">
      <QuickActions onNavigate={onNavigate} />
      <InsightsStrip
        summary={data.summary}
        games={data.games}
        bands={data.bands}
        sessionBaseline={sessionBaseline}
        onNavigate={onNavigate}
      />
      <div className="home-grid">
        <StrengthCard puzzle={data.puzzleRating} vsBot={data.vsBotRating} fallback={data.summary} />
        <ContinueCard lastGame={lastGame} onNavigate={onNavigate} />
        <RecentGamesCard games={data.games} onNavigate={onNavigate} />
        <DailyPuzzleCard onNavigate={onNavigate} />
      </div>
    </div>
  )
}
