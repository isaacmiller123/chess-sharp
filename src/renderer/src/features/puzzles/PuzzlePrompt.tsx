import type { JSX } from 'react'
import type { Phase } from './usePuzzleSession'
import type { Color } from '../../chess/chess'

export interface PuzzlePromptProps {
  phase: Phase
  userColor: Color
  correctSan?: string | null
}

function colorLabel(c: Color): string {
  return c === 'white' ? 'White' : 'Black'
}

/** Turn prompt + status banner. Mirrors the lichess solving header. */
export function PuzzlePrompt({ phase, userColor, correctSan }: PuzzlePromptProps): JSX.Element {
  let cls = 'panel pad puzzle-prompt'
  let title: string
  let subtitle: string

  switch (phase) {
    case 'solved':
      cls += ' is-solved'
      title = 'Solved'
      subtitle = 'Well played.'
      break
    case 'failed':
      cls += ' is-failed'
      title = 'Not quite'
      subtitle = correctSan ? `Best was ${correctSan}.` : 'That was not the move.'
      break
    case 'empty':
      title = 'No puzzles'
      subtitle = 'No puzzles match this filter.'
      break
    case 'error':
      title = 'Something went wrong'
      subtitle = 'Could not load a puzzle. Try again.'
      break
    case 'loading':
      title = 'Loading puzzle'
      subtitle = 'Finding a position for you.'
      break
    case 'leadin':
    case 'solving':
    default:
      title = `Find the best move for ${colorLabel(userColor)}`
      subtitle = 'Your move.'
      break
  }

  return (
    <div className={cls}>
      <div className="prompt-title">{title}</div>
      <div className="prompt-subtitle">{subtitle}</div>
    </div>
  )
}
