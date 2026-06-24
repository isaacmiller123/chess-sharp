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
import { Clock } from './Clock'

/** Clock state for one side, passed down from the clock engine. */
export interface ClockSide {
  ms: number
  active: boolean
}

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
  /** True when viewing the live game position (the mainline tip). */
  atTip: boolean
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
  /** Whether a clock is running for this game (Unlimited hides clocks). */
  clockActive: boolean
  /** Remaining time + active flag for the opponent (top chip). */
  opponentClock: ClockSide
  /** Remaining time + active flag for the user (bottom chip). */
  userClock: ClockSide
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
  atTip,
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
  clockActive,
  opponentClock,
  userClock,
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

  // Coach "was that move good?" must judge the USER's move — not the engine's
  // instant reply (which would be tree.current). Walk back to the most recent
  // move made by the user's color (white = odd ply, black = even ply).
  const userIsWhite = userColor === 'white'
  let umNode: GameTree['current'] | null = tree.current
  while (umNode && !(umNode.move && umNode.parent && (umNode.ply % 2 === 1) === userIsWhite)) {
    umNode = umNode.parent
  }
  const coachLastMove: CoachHintLastMove | undefined =
    umNode && umNode.move && umNode.parent
      ? { fenBefore: umNode.parent.fen, played: umNode.move.uci, ply: umNode.ply }
      : undefined

  return (
    <div className="play-view">
      <div className="play-board-area">
        <div className="play-chip-row">
          <PlayerChip
            kind="engine"
            name={opponentName}
            sub={opponentSub}
            styleLine={opponentStyleLine}
            thinking={thinking}
          />
          {clockActive && (
            <Clock ms={opponentClock.ms} active={opponentClock.active} over={over} label={opponentName} />
          )}
        </div>

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
              viewOnly={thinking || over || !atTip}
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

        <div className="play-chip-row">
          <PlayerChip kind="user" name={userName} avatar={userAvatar} />
          {clockActive && (
            <Clock ms={userClock.ms} active={userClock.active} over={over} label={userName} />
          )}
        </div>

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
