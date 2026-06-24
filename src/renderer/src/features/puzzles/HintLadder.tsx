import type { JSX } from 'react'
import { Lightbulb } from 'lucide-react'
import type { HintStage } from './usePuzzleSession'

export interface HintLadderProps {
  stage: HintStage
  disabled: boolean
  onHint: () => void
  revealSan?: string | null
}

const NEXT_LABEL: Record<HintStage, string> = {
  0: 'Hint',
  1: 'Hint: show destination',
  2: 'Hint: reveal move',
  3: 'Move revealed'
}

/**
 * Three-stage hint button. Press 1 highlights the piece, press 2 draws the
 * destination arrow (both via the HintArrow overlay on the board), press 3
 * reveals the move SAN inline here.
 */
export function HintLadder({ stage, disabled, onHint, revealSan }: HintLadderProps): JSX.Element {
  const atEnd = stage >= 3
  return (
    <button
      className="btn ghost hint-btn"
      onClick={onHint}
      disabled={disabled || atEnd}
      title="Hint (h)"
    >
      <Lightbulb size={14} aria-hidden />
      {atEnd && revealSan ? <span className="hint-reveal num">{revealSan}</span> : NEXT_LABEL[stage]}
    </button>
  )
}
