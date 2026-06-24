import { useState } from 'react'
import type { Role } from 'chessops/types'
import type { Key } from 'chessground/types'
import { FlipVertical2, Flag, RotateCcw, GraduationCap, ChevronDown } from 'lucide-react'
import { Board } from '../../board/Board'
import { PromotionPicker } from '../../board/PromotionPicker'
import { MoveList } from '../../panels/MoveList'
import { CoachHint, type CoachHintLastMove } from '../../components/CoachHint'
import type { GameTree } from '../../state/gameTree'
import type { BoardTheme } from '../../state/settings'
import type { Color, GameResult } from '../../chess/chess'
import { PlayerChip } from './PlayerChip'
import { ResultBanner } from './ResultBanner'

export interface GameViewBanner {
  result: GameResult
  reason: string
  outcomeForUser: 'win' | 'loss' | 'draw'
  delta?: number
  newRating?: number
}

export interface GameViewProps {
  fen: string
  orientation: Color
  turn: Color
  userColor: Color
  dests: Map<Key, Key[]>
  lastMove?: [Key, Key]
  check?: Color
  thinking: boolean
  over: boolean
  pendingPromo: { orig: string; dest: string } | null
  nonce: number
  boardTheme: BoardTheme
  /** Wrapper class for the active piece set, e.g. "pieces-merida". */
  pieceSetClass: string
  showLegal: boolean
  coordinates: boolean
  animation: boolean
  userName: string
  userAvatar: string | null
  /** Opponent chip display name (Stockfish, or a persona's name). */
  opponentName: string
  /** Opponent chip sub-label, e.g. "2780 Elo". */
  opponentSub: string
  /** Optional opponent style line, e.g. "in the style of …". */
  opponentStyleLine?: string
  tree: GameTree
  banner: GameViewBanner | null
  onMove: (orig: Key, dest: Key) => void
  onPromo: (role: Role) => void
  onPromoCancel: () => void
  onResign: () => void
  onNewGame: () => void
  onFlip: () => void
}

export function GameView({
  fen,
  orientation,
  turn,
  userColor,
  dests,
  lastMove,
  check,
  thinking,
  over,
  pendingPromo,
  nonce,
  boardTheme,
  pieceSetClass,
  showLegal,
  coordinates,
  animation,
  userName,
  userAvatar,
  opponentName,
  opponentSub,
  opponentStyleLine,
  tree,
  banner,
  onMove,
  onPromo,
  onPromoCancel,
  onResign,
  onNewGame,
  onFlip
}: GameViewProps) {
  // Coach is opt-in: off by default so it never intrudes on the game loop.
  const [coachOpen, setCoachOpen] = useState(false)

  // Derive the "judge the last move" context from the current tree node: its
  // parent FEN is the position before the move, and current.move.uci is what was
  // played. Undefined at the root (no move yet) -> CoachHint shows position-only.
  const node = tree.current
  const coachLastMove: CoachHintLastMove | undefined =
    node.move && node.parent
      ? { fenBefore: node.parent.fen, played: node.move.uci, ply: node.ply }
      : undefined

  return (
    <div className="play-view">
      <div className="play-board-area">
        <PlayerChip
          kind="engine"
          name={opponentName}
          sub={opponentSub}
          styleLine={opponentStyleLine}
          thinking={thinking}
        />

        <div className="board-stage">
          <div className={`board-wrap board-${boardTheme} ${pieceSetClass}`}>
            <Board
              fen={fen}
              orientation={orientation}
              turnColor={turn}
              dests={dests}
              lastMove={lastMove}
              check={check}
              movableColor={userColor}
              viewOnly={thinking || over}
              showDests={showLegal}
              coordinates={coordinates}
              animation={animation}
              onMove={onMove}
              syncNonce={nonce}
            />
            {pendingPromo && (
              <PromotionPicker color={turn} onSelect={onPromo} onCancel={onPromoCancel} />
            )}
          </div>
        </div>

        <PlayerChip kind="user" name={userName} avatar={userAvatar} />

        {banner ? (
          <ResultBanner
            result={banner.result}
            reason={banner.reason}
            outcomeForUser={banner.outcomeForUser}
            delta={banner.delta}
            newRating={banner.newRating}
            onNewGame={onNewGame}
          />
        ) : (
          <div className="board-controls">
            <button className="icon-btn" onClick={onFlip} title="Flip board">
              <FlipVertical2 size={18} />
            </button>
            <button className="btn ghost btn-resign" onClick={onResign} disabled={over} title="Resign">
              <Flag size={14} /> Resign
            </button>
            <button className="btn ghost play-newgame" onClick={onNewGame} title="New game">
              <RotateCcw size={14} /> New game
            </button>
          </div>
        )}
      </div>

      <aside className="play-sidebar">
        <div className="panel move-panel">
          <div className="panel-head">
            <span className="panel-title">Moves</span>
          </div>
          <MoveList root={tree.root} currentId={tree.current.id} figurineMode={false} onSelect={tree.goTo} />
        </div>

        <div className="panel coachhint-panel">
          <button
            type="button"
            className="panel-head coachhint-toggle"
            onClick={() => setCoachOpen((o) => !o)}
            aria-expanded={coachOpen}
          >
            <span className="panel-title">
              <GraduationCap size={15} /> Coach
            </span>
            <ChevronDown
              size={16}
              className={`coachhint-chevron${coachOpen ? ' is-open' : ''}`}
            />
          </button>
          {coachOpen && (
            <div className="coachhint-panel-body">
              <CoachHint fen={fen} lastMove={coachLastMove} />
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}
