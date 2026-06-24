import { EngineAvatar } from '../../components/Avatar'
import type { Persona } from '../../../../shared/types'
import { TIME_CONTROLS } from './timeControl'

export type ColorChoice = 'white' | 'black' | 'random'
export type OpponentMode = 'engine' | 'persona'

export interface SetupCardProps {
  mode: OpponentMode
  elo: number
  colorChoice: ColorChoice
  /** Selected time-control id (see timeControl.ts). */
  timeControlId: string
  personas: Persona[]
  personasLoading: boolean
  selectedPersonaId: string | null
  onMode: (m: OpponentMode) => void
  onElo: (v: number) => void
  onColor: (c: ColorChoice) => void
  onTimeControl: (id: string) => void
  onSelectPersona: (id: string) => void
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

const MODES: { key: OpponentMode; label: string }[] = [
  { key: 'engine', label: 'Engine' },
  { key: 'persona', label: 'Grandmaster style' }
]

/** Clamp 0..1 style weight to a percentage for the meter fill. */
function pct(v: number): number {
  return Math.max(0, Math.min(1, v)) * 100
}

function StyleMeter({ label, value }: { label: string; value: number }) {
  return (
    <div className="persona-meter">
      <span className="persona-meter-label">{label}</span>
      <span className="persona-meter-track" aria-hidden>
        <span className="persona-meter-fill" style={{ width: `${pct(value)}%` }} />
      </span>
    </div>
  )
}

function PersonaCard({
  persona,
  selected,
  onSelect
}: {
  persona: Persona
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      className={`persona-card${selected ? ' is-selected' : ''}`}
      onClick={onSelect}
      aria-pressed={selected}
    >
      <div className="persona-card-head">
        <EngineAvatar size={40} />
        <div className="persona-card-meta">
          <span className="persona-card-name">{persona.name}</span>
          <span className="persona-card-era muted small">{persona.era}</span>
        </div>
        <span className="eval-chip persona-card-elo">{persona.peakElo}</span>
      </div>
      <p className="persona-card-bio">{persona.bio}</p>
      <div className="persona-card-style">
        <StyleMeter label="Aggression" value={persona.style.aggression} />
        <StyleMeter label="Risk" value={persona.style.risk} />
      </div>
    </button>
  )
}

export function SetupCard({
  mode,
  elo,
  colorChoice,
  timeControlId,
  personas,
  personasLoading,
  selectedPersonaId,
  onMode,
  onElo,
  onColor,
  onTimeControl,
  onSelectPersona,
  onStart
}: SetupCardProps) {
  const selectedPersona = personas.find((p) => p.id === selectedPersonaId) ?? null
  const canStart = mode === 'engine' || selectedPersona !== null

  return (
    <div className="setup-grid">
      <section className="card setup-card">
        <div className="setup-opponent">
          <EngineAvatar size={48} />
          <div className="setup-opponent-meta">
            <h2>{mode === 'persona' ? selectedPersona?.name ?? 'Grandmaster style' : 'Stockfish'}</h2>
            <span className="muted small">
              {mode === 'persona'
                ? selectedPersona
                  ? `In the style of ${selectedPersona.name} · ${selectedPersona.peakElo} Elo`
                  : 'Choose a grandmaster to play in their style'
                : `Strength ${elo} Elo`}
            </span>
          </div>
        </div>

        <div className="setup-field">
          <span className="setup-label">Opponent</span>
          <div className="segmented mode-row">
            {MODES.map((m) => (
              <button
                key={m.key}
                className={`seg${mode === m.key ? ' on' : ''}`}
                onClick={() => onMode(m.key)}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {mode === 'engine' ? (
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
        ) : (
          <div className="setup-field">
            <span className="setup-label">Grandmaster</span>
            {personasLoading ? (
              <div className="persona-empty muted small">Loading grandmasters…</div>
            ) : personas.length === 0 ? (
              <div className="persona-empty muted small">No grandmaster styles are available.</div>
            ) : (
              <div className="persona-gallery">
                {personas.map((p) => (
                  <PersonaCard
                    key={p.id}
                    persona={p}
                    selected={p.id === selectedPersonaId}
                    onSelect={() => onSelectPersona(p.id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

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

        <div className="setup-field">
          <span className="setup-label">Time control</span>
          <div className="segmented time-row" role="group" aria-label="Time control">
            {TIME_CONTROLS.map((tc) => (
              <button
                key={tc.id}
                className={`seg${timeControlId === tc.id ? ' on' : ''}`}
                aria-pressed={timeControlId === tc.id}
                onClick={() => onTimeControl(tc.id)}
              >
                {tc.label}
              </button>
            ))}
          </div>
        </div>

        <button className="btn setup-start" onClick={onStart} disabled={!canStart}>
          Start game
        </button>
      </section>
    </div>
  )
}
