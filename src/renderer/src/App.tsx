import { useEffect, useState } from 'react'
import {
  Home,
  Swords,
  Cpu,
  Puzzle,
  GraduationCap,
  BookOpen,
  User,
  Settings as SettingsIcon,
  Brain
} from 'lucide-react'
import type { DataVersion, PingResult } from '@shared/types'

const NAV = [
  { key: 'home', label: 'Home', Icon: Home },
  { key: 'play', label: 'Play', Icon: Swords },
  { key: 'analysis', label: 'Analysis', Icon: Cpu },
  { key: 'puzzles', label: 'Puzzles', Icon: Puzzle },
  { key: 'lessons', label: 'Lessons', Icon: GraduationCap },
  { key: 'openings', label: 'Openings', Icon: BookOpen },
  { key: 'progress', label: 'Progress', Icon: User },
  { key: 'settings', label: 'Settings', Icon: SettingsIcon }
] as const

export default function App() {
  const [active, setActive] = useState<string>('home')
  const [ping, setPing] = useState<PingResult | null>(null)
  const [version, setVersion] = useState<DataVersion | null>(null)

  useEffect(() => {
    window.api.app.ping().then(setPing).catch(() => undefined)
    window.api.app.dataVersion().then(setVersion).catch(() => undefined)
  }, [])

  return (
    <div className="app-shell">
      <nav className="rail" aria-label="Primary">
        <div className="rail-brand" title="Offline Chess Trainer">
          <Brain size={22} />
        </div>
        {NAV.map(({ key, label, Icon }) => (
          <button
            key={key}
            className={`rail-item${active === key ? ' is-active' : ''}`}
            onClick={() => setActive(key)}
          >
            <Icon size={20} aria-hidden />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <div className="main">
        <header className="topbar">
          <h1>Offline Chess Trainer</h1>
          <span className="muted num">
            {version ? `${version.engineVersion} · puzzles ${version.puzzleDbDate}` : 'loading…'}
          </span>
        </header>

        <main className="content">
          <section className="card">
            <h2>Foundation scaffold is live</h2>
            <p className="muted">
              Secure Electron shell · typed IPC bridge · design tokens loaded. Feature surfaces
              are wired into this rail as the foundation build proceeds.
            </p>
            <ul className="status">
              <li>
                IPC bridge:{' '}
                <strong className={ping?.ok ? 'ok' : ''}>{ping?.ok ? 'connected' : '…'}</strong>
              </li>
              <li>
                App version: <span className="num">{version?.appVersion ?? '…'}</span>
              </li>
              <li>
                Active section: <span className="num">{active}</span>
              </li>
            </ul>
          </section>
        </main>
      </div>
    </div>
  )
}
