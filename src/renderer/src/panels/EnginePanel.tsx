import { pvToSan, turnColor } from '../chess/chess'
import { displaySan } from '../chess/notation'
import { formatScore, toWhite } from '../chess/scores'
import type { PvLine } from '../hooks/useAnalysis'

export interface EnginePanelProps {
  fen: string
  lines: PvLine[]
  depth: number
  enabled: boolean
  multipv: number
  figurineMode: boolean
  onToggle: () => void
  onMultipv: (n: number) => void
  onPlayUci: (uci: string) => void
}

export function EnginePanel(props: EnginePanelProps) {
  const { fen, lines, depth, enabled, multipv, figurineMode, onToggle, onMultipv, onPlayUci } = props
  const stm = turnColor(fen)

  return (
    <div className="panel engine-panel">
      <div className="panel-head">
        <span className="panel-title">Engine</span>
        <span className="muted small num">{enabled ? `Stockfish 18 · depth ${depth}` : 'paused'}</span>
        <button className={`toggle-pill ${enabled ? 'on' : ''}`} onClick={onToggle}>
          {enabled ? 'On' : 'Off'}
        </button>
      </div>

      <div className="engine-lines">
        {enabled && lines.length === 0 && <div className="muted small pad">analyzing…</div>}
        {!enabled && <div className="muted small pad">Turn on the engine to see top lines.</div>}
        {enabled &&
          lines.map((l) => {
            const score = toWhite({ cp: l.scoreCp, mate: l.mate }, stm)
            const positive = (score.mate ?? score.cp ?? 0) >= 0
            const sans = pvToSan(fen, l.pv, 10)
              .map((s) => displaySan(s, figurineMode))
              .join(' ')
            return (
              <button
                key={l.multipv}
                className="engine-line"
                onClick={() => l.pv[0] && onPlayUci(l.pv[0])}
                title="Play this move"
              >
                <span className={`eval-chip ${positive ? 'pos' : 'neg'} num`}>{formatScore(score)}</span>
                <span className="pv num">{sans}</span>
              </button>
            )
          })}
      </div>

      <div className="engine-controls">
        <label className="ctl">
          Lines
          <input
            type="range"
            min={1}
            max={5}
            value={multipv}
            onChange={(e) => onMultipv(Number(e.target.value))}
          />
          <span className="num">{multipv}</span>
        </label>
      </div>
    </div>
  )
}
