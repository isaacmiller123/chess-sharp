import type { Color } from '../chess/chess'
import { formatScore, whiteWinPercent, type Score } from '../chess/scores'

// Vertical eval bar: white's win-expectancy fills from white's side. Flips with
// board orientation. Label sits on the leading side.
export function EvalBar({ score, orientation }: { score: Score; orientation: Color }) {
  const whitePct = whiteWinPercent(score)
  const label = formatScore(score)
  const whiteLeads = whitePct >= 50
  return (
    <div className={`eval-bar eval-${orientation}`} aria-label={`Evaluation ${label}`}>
      <div className="eval-fill-white" style={{ height: `${whitePct}%` }} />
      <span className={`eval-label ${whiteLeads ? 'on-white' : 'on-black'} num`}>{label}</span>
    </div>
  )
}
