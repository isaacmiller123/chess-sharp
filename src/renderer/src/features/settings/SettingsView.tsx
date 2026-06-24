import { useRef } from 'react'
import { UserAvatar } from '../../components/Avatar'
import { useSettings, type BoardTheme } from '../../state/settings'
import { PIECE_SETS, getPieceSet, normalizePieceSet } from '../../board/pieceSets'

/**
 * Selectable board square palettes. Keys map 1:1 to the `.board-<key>` wrapper
 * classes in tokens.css (which expose `--sq-light` / `--sq-dark`).
 *
 * NOTE: the four originals are part of the `BoardTheme` union (state/settings.tsx);
 * the four new palettes (purple/wood/slate/ice) are not yet in that union, so this
 * list is typed over a local superset and narrowed at the click handler. Once the
 * lead widens `BoardTheme` to include them, the `as BoardTheme` cast below can be
 * dropped with no other change.
 */
type BoardThemeKey = BoardTheme | 'purple' | 'wood' | 'slate' | 'ice'

const BOARD_THEMES: { key: BoardThemeKey; label: string; light: string; dark: string }[] = [
  { key: 'brown', label: 'Brown', light: '#f0d9b5', dark: '#b58863' },
  { key: 'green', label: 'Green', light: '#eeeed2', dark: '#769656' },
  { key: 'blue', label: 'Blue', light: '#dee3e6', dark: '#8ca2ad' },
  { key: 'grey', label: 'Grey', light: '#d8d8d8', dark: '#8f8f8f' },
  { key: 'purple', label: 'Purple', light: '#e9e1f2', dark: '#9171b8' },
  { key: 'wood', label: 'Wood', light: '#e8c99b', dark: '#a16f43' },
  { key: 'slate', label: 'Slate', light: '#c7ccd2', dark: '#5d6b7a' },
  { key: 'ice', label: 'Ice', light: '#e4eef2', dark: '#7fa7b8' }
]

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="setting-row">
      <span>{label}</span>
      <button className={`switch${on ? ' on' : ''}`} role="switch" aria-checked={on} onClick={() => onChange(!on)}>
        <span className="switch-knob" />
      </button>
    </label>
  )
}

export function SettingsView() {
  const { settings, update } = useSettings()
  const fileRef = useRef<HTMLInputElement>(null)

  const onPickAvatar = (file: File | undefined) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => update({ avatar: String(reader.result) })
    reader.readAsDataURL(file)
  }

  return (
    <div className="settings-view">
      <section className="card settings-card">
        <h2>Profile</h2>
        <div className="profile-edit">
          <UserAvatar src={settings.avatar} name={settings.username} size={72} />
          <div className="profile-fields">
            <label className="field">
              <span>Username</span>
              <input
                className="text-input"
                value={settings.username}
                maxLength={24}
                onChange={(e) => update({ username: e.target.value || 'User' })}
              />
            </label>
            <div className="avatar-actions">
              <button className="btn" onClick={() => fileRef.current?.click()}>
                Change picture
              </button>
              {settings.avatar && (
                <button className="btn ghost" onClick={() => update({ avatar: null })}>
                  Remove
                </button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => onPickAvatar(e.target.files?.[0])}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="card settings-card">
        <h2>Appearance</h2>
        <div className="setting-row">
          <span>Theme</span>
          <div className="segmented">
            {(['light', 'dark'] as const).map((t) => (
              <button
                key={t}
                className={`seg${settings.theme === t ? ' on' : ''}`}
                onClick={() => update({ theme: t })}
              >
                {t[0].toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="setting-row">
          <span>Board theme</span>
          <div className="board-swatches">
            {BOARD_THEMES.map((b) => (
              <button
                key={b.key}
                className={`swatch${settings.boardTheme === b.key ? ' on' : ''}`}
                title={b.label}
                onClick={() => update({ boardTheme: b.key as BoardTheme })}
              >
                <span className="swatch-grid">
                  <span style={{ background: b.light }} />
                  <span style={{ background: b.dark }} />
                  <span style={{ background: b.dark }} />
                  <span style={{ background: b.light }} />
                </span>
              </button>
            ))}
          </div>
        </div>
        <div className="setting-row">
          <span>Pieces</span>
          <div className="segmented">
            {PIECE_SETS.map((p) => (
              <button
                key={p.id}
                className={`seg${settings.pieceSet === p.id ? ' on' : ''}`}
                onClick={() => update({ pieceSet: normalizePieceSet(p.id) })}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div className="setting-row setting-caption">
          <span className="muted small">
            {getPieceSet(settings.pieceSet).author} · {getPieceSet(settings.pieceSet).license}
          </span>
        </div>
      </section>

      <section className="card settings-card">
        <h2>Board &amp; play</h2>
        <Toggle label="Show legal move dots" on={settings.showLegal} onChange={(v) => update({ showLegal: v })} />
        <Toggle label="Board coordinates" on={settings.coordinates} onChange={(v) => update({ coordinates: v })} />
        <Toggle label="Piece animation" on={settings.animation} onChange={(v) => update({ animation: v })} />
        <Toggle label="Sound effects" on={settings.sound} onChange={(v) => update({ sound: v })} />
      </section>
    </div>
  )
}
