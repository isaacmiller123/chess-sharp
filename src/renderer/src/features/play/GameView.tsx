import type { Role } from 'chessops/types'
import type { Key } from 'chessground/types'
import { FlipVertical2, Flag, RotateCcw } from 'lucide-react'
import { Board } from '../../board/Board'
import { PromotionPicker } from '../../board/PromotionPicker'
import { MoveList } from '../../panels/MoveList'
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
  showLegal: boolean
  coordinates: boolean
  animation: boolean
  userName: string
  userAvatar: string | null
  elo: number
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
  showLegal,
  coordinates,
  animation,
  userName,
  userAvatar,
  elo,
  tree,
  banner,
  onMove,
  onPromo,
  onPromoCancel,
  onResign,
  onNewGame,
  onFlip
}: GameViewProps) {
  return (
    <div className="play-view">
      <div className="play-board-area">
        <PlayerChip kind="engine" name="Stockfish" sub={`${elo} Elo`} thinking={thinking} />

        <div className="board-stage">
          <div className={`board-wrap board-${boardTheme}`}>
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
      </aside>
    </div>
  )
}
