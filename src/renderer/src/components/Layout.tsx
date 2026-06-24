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
  type LucideIcon
} from 'lucide-react'
import { UserAvatar } from './Avatar'
import { Logo } from './Logo'
import { useSettings } from '../state/settings'

export type ViewKey =
  | 'home'
  | 'play'
  | 'analysis'
  | 'puzzles'
  | 'lessons'
  | 'famous'
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
        <div className="rail-brand" role="img" aria-label="Chess#" title="Chess#">
          <Logo size={26} />
          <span className="rail-wordmark">
            Chess<span className="rail-wordmark-hash">#</span>
          </span>
        </div>
        <div className="rail-nav">
          {NAV.map(({ key, label, Icon }) => {
            const isActive = active === key
            return (
              <button
                key={key}
                type="button"
                className={`rail-item${isActive ? ' is-active' : ''}`}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => onNavigate(key)}
              >
                <Icon className="rail-icon" size={20} aria-hidden />
                <span>{label}</span>
              </button>
            )
          })}
        </div>
        <button
          type="button"
          className={`profile-chip${active === 'settings' ? ' is-active' : ''}`}
          aria-current={active === 'settings' ? 'page' : undefined}
          aria-label={`Profile and settings — ${settings.username}`}
          title="Profile & settings"
          onClick={() => onNavigate('settings')}
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
        <main className="content" id="main-content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  )
}
