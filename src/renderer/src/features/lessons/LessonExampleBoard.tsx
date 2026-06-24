import { useEffect, useMemo, useState, type JSX } from 'react'
import type { Role } from 'chessops/types'
import type { Key } from 'chessground/types'
import { RotateCcw } from 'lucide-react'
import { Board } from '../../board/Board'
import { PromotionPicker } from '../../board/PromotionPicker'
import { pieceSetClass } from '../../board/pieceSets'
import { useSettings } from '../../state/settings'
import { useSound } from '../../sound'
import {
  applyMove,
  checkColor,
  destsFor,
  isPromotion,
  turnColor,
  uciToLastMove,
  type Color
} from '../../chess/chess'

export interface LessonExampleBoardProps {
  /** The example's starting position. Resetting returns here. */
  startFen: string
}

/**
 * An interactive lesson board: the learner can play legal moves for EITHER side
 * to try the idea being taught, then reset to the example position. This is the
 * "learn by doing" half of a lesson — the static study board was view-only.
 */
export default function LessonExampleBoard({ startFen }: LessonExampleBoardProps): JSX.Element {
  const { settings } = useSettings()
  const { playMove } = useSound()

  const [fen, setFen] = useState(startFen)
  const [lastMove, setLastMove] = useState<[Key, Key] | undefined>(undefined)
  const [pendingPromo, setPendingPromo] = useState<{ orig: string; dest: string } | null>(null)
  const [moved, setMoved] = useState(false)
  const [nonce, setNonce] = useState(0)

  // Snap back to the example whenever a different one is shown.
  useEffect(() => {
    setFen(startFen)
    setLastMove(undefined)
    setMoved(false)
    setPendingPromo(null)
    setNonce((n) => n + 1)
  }, [startFen])

  const dests = useMemo(() => destsFor(fen), [fen])
  const turn = turnColor(fen)
  const check = checkColor(fen)
  // Orient to whoever moves first in the example so the learner faces the board.
  const orientation: Color = useMemo(() => turnColor(startFen), [startFen])

  const commit = (orig: string, dest: string, promotion?: Role): void => {
    const m = applyMove(fen, orig, dest, promotion)
    if (!m) {
      setNonce((n) => n + 1) // illegal: re-sync the board to truth
      return
    }
    setFen(m.fen)
    setLastMove(uciToLastMove(m.uci))
    setMoved(true)
    playMove(m)
  }

  const onMove = (orig: Key, dest: Key): void => {
    if (isPromotion(fen, orig, dest)) setPendingPromo({ orig, dest })
    else commit(orig, dest)
  }

  const reset = (): void => {
    setFen(startFen)
    setLastMove(undefined)
    setMoved(false)
    setPendingPromo(null)
    setNonce((n) => n + 1)
  }

  return (
    <div className="lesson-example-board">
      <div className={`board-wrap board-${settings.boardTheme} ${pieceSetClass(settings.pieceSet)}`}>
        <Board
          fen={fen}
          orientation={orientation}
          turnColor={turn}
          dests={dests}
          movableColor="both"
          lastMove={lastMove}
          check={check}
          showDests={settings.showLegal}
          coordinates={settings.coordinates}
          animation={settings.animation}
          onMove={onMove}
          syncNonce={nonce}
        />
        {pendingPromo && (
          <PromotionPicker
            color={turn}
            onSelect={(role) => {
              commit(pendingPromo.orig, pendingPromo.dest, role)
              setPendingPromo(null)
            }}
            onCancel={() => {
              setPendingPromo(null)
              setNonce((n) => n + 1)
            }}
          />
        )}
      </div>
      <div className="lesson-example-board-foot">
        <span className="muted small">
          {moved ? 'Exploring — try the idea, then reset.' : 'Your move — drag a piece to try it.'}
        </span>
        <button className="btn ghost lesson-example-reset" onClick={reset} disabled={!moved}>
          <RotateCcw size={14} aria-hidden /> Reset
        </button>
      </div>
    </div>
  )
}
