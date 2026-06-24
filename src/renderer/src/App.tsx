import { lazy, Suspense, useCallback, useEffect, useState, type JSX } from 'react'
import { Layout, type ViewKey } from './components/Layout'
import { Placeholder } from './components/Placeholder'
import { SettingsProvider, useSettings } from './state/settings'
import HomeView from './features/home/HomeView'
import { CommandPalette } from './components/CommandPalette'
import { ShortcutsHelp } from './components/ShortcutsHelp'
import { Onboarding } from './components/Onboarding'
import './components/shell-overlays.css'

// Home stays eager (first paint); every other view is code-split so the initial
// bundle only carries the dashboard. React.lazy needs default exports, so views
// that export a named component are adapted to a default here.
const PlayView = lazy(() => import('./features/play/PlayView'))
const PuzzlesView = lazy(() => import('./features/puzzles/PuzzlesView'))
const OpeningsView = lazy(() => import('./features/openings/OpeningsView'))
const ProgressView = lazy(() => import('./features/progress/ProgressView'))
const LessonsView = lazy(() => import('./features/lessons/LessonsView'))
const FamousView = lazy(() => import('./features/famous/FamousView'))
const AnalysisView = lazy(() =>
  import('./features/analysis/AnalysisView').then((m) => ({ default: m.AnalysisView }))
)
const SettingsView = lazy(() =>
  import('./features/settings/SettingsView').then((m) => ({ default: m.SettingsView }))
)

const TITLES: Record<ViewKey, string> = {
  home: 'Home',
  play: 'Play',
  analysis: 'Analysis',
  puzzles: 'Puzzles',
  lessons: 'Lessons',
  famous: 'Famous Games',
  openings: 'Openings',
  progress: 'Progress',
  settings: 'Settings'
}

const ONBOARDING_SEEN_KEY = 'oct.onboarding.seen.v1'

function ViewFallback(): JSX.Element {
  return (
    <div className="view-loading" role="status" aria-live="polite">
      <span className="view-spinner" aria-hidden />
      <span className="visually-hidden">Loading…</span>
    </div>
  )
}

function CurrentView({ view, onNavigate }: { view: ViewKey; onNavigate: (v: ViewKey) => void }): JSX.Element {
  switch (view) {
    case 'home':
      return <HomeView onNavigate={onNavigate} />
    case 'play':
      return <PlayView />
    case 'puzzles':
      return <PuzzlesView />
    case 'openings':
      return <OpeningsView />
    case 'lessons':
      return <LessonsView onNavigate={(v) => onNavigate(v as ViewKey)} />
    case 'famous':
      return <FamousView />
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

function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false
  const p = navigator.platform || ''
  return /mac|iphone|ipad|ipod/i.test(p) || /mac/i.test(navigator.userAgent)
}

/**
 * Inner shell — lives inside SettingsProvider so it can read settings and drive
 * onboarding. Owns routing plus the three app-shell overlays (command palette,
 * shortcuts help, first-run onboarding).
 */
function AppShell(): JSX.Element {
  const { settings } = useSettings()
  const [view, setView] = useState<ViewKey>('home')
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [onboardingOpen, setOnboardingOpen] = useState(false)
  const isMac = isMacPlatform()

  const navigate = useCallback((v: ViewKey) => setView(v), [])

  // First-run onboarding: brand-new profile (default username) with no saved
  // games and no prior 'seen' flag. Never blocks — purely additive, and the flag
  // is written immediately so it shows at most once.
  useEffect(() => {
    let seen = true
    try {
      seen = localStorage.getItem(ONBOARDING_SEEN_KEY) === '1'
    } catch {
      /* storage may be unavailable — treat as already seen */
    }
    if (seen || settings.username !== 'User') return

    let cancelled = false
    void (async () => {
      let hasGames = true
      try {
        const res = await window.api?.games?.list?.({ limit: 1 })
        hasGames = (res?.games?.length ?? 0) > 0
      } catch {
        // If we cannot confirm an empty history, err toward not interrupting.
        hasGames = true
      }
      if (cancelled || hasGames) return
      try {
        localStorage.setItem(ONBOARDING_SEEN_KEY, '1')
      } catch {
        /* ignore */
      }
      setOnboardingOpen(true)
    })()
    return () => {
      cancelled = true
    }
    // Run once on mount; username is read at that point intentionally.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Global shortcuts: Cmd/Ctrl+K toggles the palette; '?' opens shortcuts help.
  // Both ignore typing contexts so they never hijack text entry.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.defaultPrevented) return
      const mod = e.metaKey || e.ctrlKey
      if (mod && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        setShortcutsOpen(false)
        setPaletteOpen((o) => !o)
        return
      }
      const target = e.target as HTMLElement | null
      const typing =
        !!target &&
        (target.isContentEditable ||
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT')
      if (!mod && !typing && e.key === '?') {
        e.preventDefault()
        setPaletteOpen(false)
        setShortcutsOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <>
      <Layout active={view} onNavigate={navigate} title={TITLES[view]}>
        <Suspense fallback={<ViewFallback />}>
          <CurrentView view={view} onNavigate={navigate} />
        </Suspense>
      </Layout>
      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} onNavigate={navigate} />}
      {shortcutsOpen && <ShortcutsHelp onClose={() => setShortcutsOpen(false)} isMac={isMac} />}
      {onboardingOpen && (
        <Onboarding onClose={() => setOnboardingOpen(false)} onNavigate={navigate} />
      )}
    </>
  )
}

export default function App(): JSX.Element {
  return (
    <SettingsProvider>
      <AppShell />
    </SettingsProvider>
  )
}
