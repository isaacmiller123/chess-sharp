import { useCallback, useMemo, useState, type JSX } from 'react'
import { RotateCcw, Repeat } from 'lucide-react'
import type { Key } from 'chessground/types'
import { Board } from '../../board/Board'
import { pieceSetClass } from '../../board/pieceSets'
import { useSettings } from '../../state/settings'
import type { CatalogEntry } from './catalog'
import {
  initVariant,
  variantCheck,
  variantDests,
  variantFen,
  variantOutcome,
  variantPlay,
  variantTurn,
  type VariantState
} from './variantGame'

/**
 * Local over-the-board play for the chessops variant wave. Two humans, one
 * machine, accurate variant rules end-to-end (legal moves, variant win
 * conditions, auto-flip). TODO(P2): clocks, sounds, move list + PGN save via
 * the game kernel; promotion picker (auto-queen today).
 */
export function VariantOtb({ entry }: { entry: CatalogEntry }): JSX.Element {
  const { settings } = useSettings()
  const [state, setState] = useState<VariantState>(() => initVariant(entry.kind, entry.rules ?? 'chess'))
  const [lastMove, setLastMove] = useState<[Key, Key] | undefined>(undefined)
  const [moveCount, setMoveCount] = useState(0)
  const [autoFlip, setAutoFlip] = useState(true)

  const fen = variantFen(state)
  const turn = variantTurn(state)
  const outcome = variantOutcome(state)
  const dests = useMemo(() => (outcome ? new Map<Key, Key[]>() : variantDests(state)), [state, outcome])

  const onMove = useCallback(
    (orig: Key, dest: Key) => {
      setState((s) => {
        const next = variantPlay(s, orig, dest)
        if (!next) return s
        setLastMove([orig, dest])
        setMoveCount((n) => n + 1)
        return next
      })
    },
    []
  )

  const reset = useCallback(() => {
    setState(initVariant(entry.kind, entry.rules ?? 'chess'))
    setLastMove(undefined)
    setMoveCount(0)
  }, [entry])

  const orientation = autoFlip ? turn : 'white'
  const resultLabel =
    outcome &&
    (outcome.result === '1/2-1/2'
      ? `Draw — ${outcome.reason.toLowerCase()}`
      : `${outcome.result === '1-0' ? 'White' : 'Black'} wins — ${outcome.reason.toLowerCase()}`)

  return (
    <div className="votb">
      <div className="votb-stage">
        <div className={`board-wrap board-${settings.boardTheme} ${pieceSetClass(settings.pieceSet)} votb-board`}>
          <Board
            fen={fen}
            orientation={orientation}
            turnColor={turn}
            dests={dests}
            lastMove={lastMove}
            check={variantCheck(state)}
            movableColor={outcome ? undefined : turn}
            coordinates
            onMove={onMove}
          />
        </div>
        {outcome && (
          <div className="votb-banner" role="status">
            <strong>{resultLabel}</strong>
            <button type="button" className="votb-btn is-primary" onClick={reset}>
              <RotateCcw size={14} aria-hidden /> Play again
            </button>
          </div>
        )}
      </div>
      <aside className="votb-side">
        <div className="votb-turn">
          <span className={`votb-turn-dot is-${turn}`} aria-hidden />
          {outcome ? 'Game over' : `${turn === 'white' ? 'White' : 'Black'} to move`}
          <span className="votb-movecount">{moveCount} moves</span>
        </div>
        <label className="votb-flip">
          <input type="checkbox" checked={autoFlip} onChange={(e) => setAutoFlip(e.target.checked)} />
          <Repeat size={14} aria-hidden />
          Auto-flip board to the side to move
        </label>
        <button type="button" className="votb-btn" onClick={reset}>
          <RotateCcw size={14} aria-hidden /> {entry.kind === 'chess960' ? 'New position' : 'Restart game'}
        </button>
        <p className="votb-note">
          Over-the-board: pass the machine between moves. Clocks, move list and saving land in P2.
        </p>
      </aside>
    </div>
  )
}
