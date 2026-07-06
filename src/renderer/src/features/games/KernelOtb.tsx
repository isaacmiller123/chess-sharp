// Local over-the-board play for every kernel game (non-chessops kinds).
// Two humans, one machine, rules end-to-end through the registry GameSpec:
// the board proposes moves, this owner answers via spec.play, terminal states
// come from spec.result. Flip policy is respected exactly — 'rotate' kinds
// (checkers, morris) get the auto-flip toggle, 'none' kinds (go, gomoku,
// othello, hex, connect4, tictactoe) never rotate.
//
// Extras the codecs need from the owner:
//   - a Pass button whenever 'pass' is legal (go always; othello when forced),
//     and Swap for hex's pie rule when enabled;
//   - go's scoring phase: the board proposes onAction('markdead <v>') /
//     onAction('finalize'), resolved here through the GoSpec seam;
//   - go board-size picker (9/13/19) — picking a size starts a fresh game;
//   - ffish kinds (requiresPreload) await spec.preload() before init.

import { Suspense, lazy, useCallback, useEffect, useMemo, useState, type JSX } from 'react'
import type { ComponentType } from 'react'
import { RotateCcw, Repeat } from 'lucide-react'
import type { CatalogEntry } from './catalog'
import { getGame, isRegisteredGame, type GameBoardProps } from '../../games/registry'
import type { PlayerColor } from '../../games/kernel'
import type { GoSpec, GoState } from '../../games/go'
import { Board3DHost, BoardModeToggle, useBoardMode } from './boardMode'

/** Per-idiom color naming (spec players stay white/black on the wire). */
export function kernelColorLabel(kind: string, c: PlayerColor): string {
  if (kind === 'connect4') return c === 'white' ? 'Red' : 'Yellow'
  if (kind === 'hex') return c === 'white' ? 'Red' : 'Blue'
  if (kind === 'tictactoe') return c === 'white' ? 'X' : 'O'
  return c === 'white' ? 'White' : 'Black'
}

const DOT_COLORS: Record<string, [string, string]> = {
  connect4: ['#d84b40', '#e8c33a'],
  hex: ['#c0392b', '#2a6fb8']
}

// Lazy board components are cached per kind so re-entering a game page never
// re-suspends an already-loaded board.
const BOARD_CACHE = new Map<string, ComponentType<GameBoardProps>>()

function lazyBoard(kind: string): ComponentType<GameBoardProps> {
  const cached = BOARD_CACHE.get(kind)
  if (cached) return cached
  const entry = getGame(kind as never)
  const Board = lazy(entry!.loadRenderer)
  BOARD_CACHE.set(kind, Board as unknown as ComponentType<GameBoardProps>)
  return BOARD_CACHE.get(kind)!
}

const GO_SIZES = [9, 13, 19] as const

interface StateWithMoves {
  moves: readonly string[]
}

export function KernelOtb({ entry }: { entry: CatalogEntry }): JSX.Element {
  const kind = entry.kind
  const game = isRegisteredGame(kind) ? getGame(kind) : undefined
  if (!game) throw new Error(`KernelOtb: unregistered kind ${kind}`)
  const spec = game.spec

  const [goSize, setGoSize] = useState<9 | 13 | 19>(19)
  const initOptions = useMemo(() => (kind === 'go' ? { size: goSize } : undefined), [kind, goSize])

  const [ready, setReady] = useState(() => game.requiresPreload !== true)
  const [state, setState] = useState<unknown>(() => (game.requiresPreload ? null : spec.init(initOptions)))
  const [autoFlip, setAutoFlip] = useState(true)
  const { is3d } = useBoardMode(kind)

  useEffect(() => {
    if (ready) return
    let alive = true
    void spec.preload?.().then(() => {
      if (!alive) return
      setState(spec.init())
      setReady(true)
    })
    return (): void => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const Board = lazyBoard(kind)

  const moves = state !== null ? (state as StateWithMoves).moves : []
  const result = useMemo(() => (state !== null && ready ? spec.result(state) : null), [spec, state, ready])
  const legal = useMemo(
    () => (state !== null && ready && !result ? spec.legalMoves(state) : []),
    [spec, state, ready, result]
  )
  const turn: PlayerColor = spec.players[moves.length % 2]
  const goScoring =
    kind === 'go' && state !== null && !result && (spec as unknown as GoSpec).isScoringPhase(state as GoState)

  const onMove = useCallback(
    (move: string) => {
      setState((s: unknown) => (s === null ? s : (spec.play(s, move) ?? s)))
    },
    [spec]
  )

  const onAction = useCallback(
    (action: string) => {
      if (kind !== 'go') return
      const gs = spec as unknown as GoSpec
      setState((s: unknown) => {
        if (s === null) return s
        if (action === 'finalize') return gs.finalizeScore(s as GoState) ?? s
        if (action.startsWith('markdead ')) return gs.markDead(s as GoState, action.slice('markdead '.length)) ?? s
        return s
      })
    },
    [kind, spec]
  )

  const reset = useCallback(
    (options?: unknown) => {
      if (!ready) return
      setState(spec.init(options ?? initOptions))
    },
    [spec, ready, initOptions]
  )

  const rotates = spec.flipPolicy === 'rotate'
  const orientation: PlayerColor = rotates && autoFlip ? turn : 'white'
  const canPass = legal.includes('pass')
  const canSwap = legal.includes('swap')

  const resultLabel =
    result &&
    (result.winner === null
      ? `Draw — ${result.reason.replace(/-/g, ' ')}`
      : `${kernelColorLabel(kind, result.winner)} wins — ${result.reason.replace(/-/g, ' ')}`)

  const dot = DOT_COLORS[kind]
  const turnLabel = goScoring
    ? 'Scoring — tap dead groups'
    : result
      ? 'Game over'
      : `${kernelColorLabel(kind, turn)} to move`

  return (
    <div className="votb kotb">
      <div className="votb-stage">
        <Suspense fallback={<div className="kotb-loading">Setting up the board…</div>}>
          {state !== null && ready ? (
            is3d ? (
              <Board3DHost
                kind={kind as never}
                state={state}
                orientation={orientation}
                interactive={!result}
                onMove={onMove}
                onAction={onAction}
              />
            ) : (
              <Board
                kind={kind as never}
                state={state}
                orientation={orientation}
                interactive={!result}
                onMove={onMove}
                onAction={onAction}
              />
            )
          ) : (
            <div className="kotb-loading">Loading rules engine…</div>
          )}
        </Suspense>
        {result && (
          <div className="votb-banner" role="status">
            <strong>{resultLabel}</strong>
            <button type="button" className="votb-btn is-primary" onClick={() => reset()}>
              <RotateCcw size={14} aria-hidden /> Play again
            </button>
          </div>
        )}
      </div>
      <aside className="votb-side">
        <div className="votb-turn">
          <span
            className={`votb-turn-dot${dot ? '' : ` is-${turn}`}`}
            style={dot ? { background: dot[turn === 'white' ? 0 : 1], borderColor: 'transparent' } : undefined}
            aria-hidden
          />
          {turnLabel}
          <span className="votb-movecount">
            {moves.length === 1 ? '1 move' : `${moves.length} moves`}
          </span>
        </div>
        {kind === 'go' && (
          <div className="kotb-sizes" role="group" aria-label="Board size">
            {GO_SIZES.map((sz) => (
              <button
                key={sz}
                type="button"
                className={`kotb-chip${goSize === sz ? ' is-active' : ''}`}
                onClick={() => {
                  setGoSize(sz)
                  reset({ size: sz })
                }}
              >
                {sz}×{sz}
              </button>
            ))}
          </div>
        )}
        <BoardModeToggle kind={kind} />
        {rotates && (
          <label className="votb-flip">
            <input type="checkbox" checked={autoFlip} onChange={(e) => setAutoFlip(e.target.checked)} />
            <Repeat size={14} aria-hidden />
            Auto-flip board to the side to move
          </label>
        )}
        {canPass && (
          <button type="button" className="votb-btn" onClick={() => onMove('pass')}>
            Pass{kind === 'othello' ? ' — no legal placement' : ''}
          </button>
        )}
        {canSwap && (
          <button type="button" className="votb-btn" onClick={() => onMove('swap')}>
            Swap (pie rule)
          </button>
        )}
        <button type="button" className="votb-btn" onClick={() => reset()}>
          <RotateCcw size={14} aria-hidden /> Restart game
        </button>
        <p className="votb-note">
          Over-the-board: pass the machine between moves.
          {kind === 'go' && ' Two passes end the game — then tap dead groups and finalize the score.'}
        </p>
      </aside>
    </div>
  )
}
