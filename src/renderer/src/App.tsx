import { useState } from 'react'
import { Layout, type ViewKey } from './components/Layout'
import { Placeholder } from './components/Placeholder'
import { SettingsProvider } from './state/settings'
import { AnalysisView } from './features/analysis/AnalysisView'
import { SettingsView } from './features/settings/SettingsView'
import HomeView from './features/home/HomeView'
import PlayView from './features/play/PlayView'
import PuzzlesView from './features/puzzles/PuzzlesView'
import OpeningsView from './features/openings/OpeningsView'
import ProgressView from './features/progress/ProgressView'

const TITLES: Record<ViewKey, string> = {
  home: 'Home',
  play: 'Play',
  analysis: 'Analysis',
  puzzles: 'Puzzles',
  lessons: 'Lessons',
  openings: 'Openings',
  progress: 'Progress',
  settings: 'Settings'
}

function CurrentView({ view, onNavigate }: { view: ViewKey; onNavigate: (v: ViewKey) => void }) {
  switch (view) {
    case 'home':
      return <HomeView onNavigate={onNavigate} />
    case 'play':
      return <PlayView />
    case 'puzzles':
      return <PuzzlesView />
    case 'openings':
      return <OpeningsView />
    case 'progress':
      return <ProgressView onNavigate={onNavigate} />
    case 'analysis':
      return <AnalysisView />
    case 'settings':
      return <SettingsView />
    default:
      return <Placeholder view={view} />
  }
}

export default function App() {
  const [view, setView] = useState<ViewKey>('home')
  return (
    <SettingsProvider>
      <Layout active={view} onNavigate={setView} title={TITLES[view]}>
        <CurrentView view={view} onNavigate={setView} />
      </Layout>
    </SettingsProvider>
  )
}
