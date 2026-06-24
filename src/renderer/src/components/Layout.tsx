import type { ReactNode } from 'react'
import {
  Home,
  Swords,
  Cpu,
  Puzzle,
  GraduationCap,
  BookOpen,
  User,
  Settings as SettingsIcon,
  Brain,
  type LucideIcon
} from 'lucide-react'
import { UserAvatar } from './Avatar'
import { useSettings } from '../state/settings'

export type ViewKey =
  | 'home'
  | 'play'
  | 'analysis'
  | 'puzzles'
  | 'lessons'
  | 'openings'
  | 'progress'
  | 'settings'

export const NAV: { key: ViewKey; label: string; Icon: LucideIcon }[] = [
  { key: 'home', label: 'Home', Icon: Home },
  { key: 'play', label: 'Play', Icon: Swords },
  { key: 'analysis', label: 'Analysis', Icon: Cpu },
  { key: 'puzzles', label: 'Puzzles', Icon: Puzzle },
  { key: 'lessons', label: 'Lessons', Icon: GraduationCap },
  { key: 'openings', label: 'Openings', Icon: BookOpen },
  { key: 'progress', label: 'Progress', Icon: User }
]

export function Layout({
  active,
  onNavigate,
  title,
  topRight,
  children
}: {
  active: ViewKey
  onNavigate: (v: ViewKey) => void
  title: string
  topRight?: ReactNode
  children: ReactNode
}) {
  const { settings } = useSettings()
  return (
    <div className="app-shell">
      <nav className="rail" aria-label="Primary">
        <div className="rail-brand" title="Offline Chess Trainer">
          <Brain size={22} />
        </div>
        <div className="rail-nav">
          {NAV.map(({ key, label, Icon }) => (
            <button
              key={key}
              className={`rail-item${active === key ? ' is-active' : ''}`}
              onClick={() => onNavigate(key)}
            >
              <Icon size={20} aria-hidden />
              <span>{label}</span>
            </button>
          ))}
        </div>
        <button
          className={`profile-chip${active === 'settings' ? ' is-active' : ''}`}
          onClick={() => onNavigate('settings')}
          title="Profile & settings"
        >
          <UserAvatar src={settings.avatar} name={settings.username} size={32} />
          <span className="profile-name">{settings.username}</span>
          <SettingsIcon size={16} className="profile-gear" aria-hidden />
        </button>
      </nav>

      <div className="main">
        <header className="topbar">
          <h1>{title}</h1>
          <div className="topbar-right">{topRight}</div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  )
}
