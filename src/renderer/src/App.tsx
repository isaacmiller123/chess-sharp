import { useState } from 'react'
import { Layout, type ViewKey } from './components/Layout'
import { Placeholder } from './components/Placeholder'
import { SettingsProvider } from './state/settings'
import { AnalysisView } from './features/analysis/AnalysisView'
import { SettingsView } from './features/settings/SettingsView'

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

function CurrentView({ view }: { view: ViewKey }) {
  switch (view) {
    case 'analysis':
      return <AnalysisView />
    case 'settings':
      return <SettingsView />
    default:
      return <Placeholder view={view} />
  }
}

export default function App() {
  const [view, setView] = useState<ViewKey>('analysis')
  return (
    <SettingsProvider>
      <Layout active={view} onNavigate={setView} title={TITLES[view]}>
        <CurrentView view={view} />
      </Layout>
    </SettingsProvider>
  )
}
