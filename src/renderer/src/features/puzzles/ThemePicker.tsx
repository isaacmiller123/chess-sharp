import type { JSX } from 'react'
import type { ThemeCount } from '../../../../shared/types'

export interface ThemePickerProps {
  themes: ThemeCount[]
  active: string | null
  onPick: (key: string | null) => void
}

/** camelCase / kebab theme key -> human label, e.g. "kingsideAttack" -> "Kingside Attack". */
function humanize(key: string): string {
  const spaced = key
    .replace(/[-_]/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim()
  return spaced.replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `${Math.round(n / 1000)}k`
  return String(n)
}

/** Theme chip grid filtering puzzles.next({ theme }). First chip clears the filter. */
export function ThemePicker({ themes, active, onPick }: ThemePickerProps): JSX.Element {
  return (
    <div className="panel theme-panel">
      <div className="panel-head">
        <span className="panel-title">Themes</span>
      </div>
      <div className="theme-grid">
        <button
          className={`theme-chip${active == null ? ' is-active' : ''}`}
          onClick={() => onPick(null)}
        >
          <span className="theme-name">All</span>
        </button>
        {themes.map((t) => (
          <button
            key={t.key}
            className={`theme-chip${active === t.key ? ' is-active' : ''}`}
            onClick={() => onPick(t.key)}
            title={humanize(t.key)}
          >
            <span className="theme-name">{humanize(t.key)}</span>
            <span className="theme-count num">{formatCount(t.count)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
