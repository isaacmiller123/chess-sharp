import { EngineAvatar } from '../../components/Avatar'

export type ColorChoice = 'white' | 'black' | 'random'

export interface SetupCardProps {
  elo: number
  colorChoice: ColorChoice
  onElo: (v: number) => void
  onColor: (c: ColorChoice) => void
  onStart: () => void
}

const ELO_MIN = 1320
const ELO_MAX = 3190

const PRESETS: { label: string; elo: number }[] = [
  { label: 'Beginner', elo: 1320 },
  { label: 'Casual', elo: 1500 },
  { label: 'Club', elo: 1800 },
  { label: 'Expert', elo: 2100 },
  { label: 'Master', elo: 2500 },
  { label: 'Max', elo: 3190 }
]

const COLORS: { key: ColorChoice; label: string }[] = [
  { key: 'white', label: 'White' },
  { key: 'black', label: 'Black' },
  { key: 'random', label: 'Random' }
]

export function SetupCard({ elo, colorChoice, onElo, onColor, onStart }: SetupCardProps) {
  return (
    <div className="setup-grid">
      <section className="card setup-card">
        <div className="setup-opponent">
          <EngineAvatar size={48} />
          <div className="setup-opponent-meta">
            <h2>Stockfish</h2>
            <span className="muted small">Strength {elo} Elo</span>
          </div>
        </div>

        <div className="setup-field">
          <div className="setup-label-row">
            <span className="setup-label">Engine strength</span>
            <span className="num elo-readout">{elo}</span>
          </div>
          <input
            className="elo-range"
            type="range"
            min={ELO_MIN}
            max={ELO_MAX}
            step={10}
            value={elo}
            aria-label="Engine Elo"
            onChange={(e) => onElo(Number(e.target.value))}
          />
          <div className="preset-row">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                className={`seg${elo === p.elo ? ' on' : ''}`}
                onClick={() => onElo(p.elo)}
                title={`${p.label} (${p.elo})`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="setup-field">
          <span className="setup-label">Play as</span>
          <div className="segmented color-row">
            {COLORS.map((c) => (
              <button
                key={c.key}
                className={`seg${colorChoice === c.key ? ' on' : ''}`}
                onClick={() => onColor(c.key)}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <button className="btn setup-start" onClick={onStart}>
          Start game
        </button>
      </section>
    </div>
  )
}
