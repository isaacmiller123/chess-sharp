// vs Bot for every NON-chess kernel game (go, gomoku, othello, connect4, hex,
// morris, tictactoe, checkers both) — the sibling of VariantBot (chess family)
// built on the same seams: rules through the registry GameSpec, moves through
// the games/bots.ts provider (KataGo GTP ipc for go, in-process searches for
// the rest), board via the registry's lazy renderer. KernelOtb's extras carry
// over: per-idiom color names, pass/swap buttons, go board sizes and go's
// scoring phase (the bot defers to the human on dead-stone marking — mark, then
// finalize on the board).
//
// Go's engine dependency is surfaced INLINE (spec task: not a dead toast): when
// KataGo isn't installed the setup card swaps Start for an install prompt that
// deep-links to Settings → Datasets.

import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type JSX
} from 'react'
import { Bot, Download, RotateCcw, Swords } from 'lucide-react'
import { resolveBotProvider, BotUnavailableError, BOT_LEVEL_NAMES } from '../../games/bots'
import type { GameKind, PlayerColor } from '../../games/kernel'
import { getGame, type GameBoardProps } from '../../games/registry'
import type { GoSpec, GoState } from '../../games/go'
import { useBoardSound } from '../../games/boards/useBoardSound'
import type { CatalogEntry } from './catalog'
import { kernelColorLabel } from './KernelOtb'

type Phase = 'setup' | 'playing'

const GO_SIZES = [9, 13, 19] as const

// Lazy board components cached per kind (same discipline as KernelOtb).
const BOARD_CACHE = new Map<string, ComponentType<GameBoardProps>>()
function lazyBoard(kind: GameKind, loader: () => Promise<{ default: ComponentType<GameBoardProps> }>) {
  const cached = BOARD_CACHE.get(kind)
  if (cached) return cached
  const Board = lazy(loader)
  BOARD_CACHE.set(kind, Board as unknown as ComponentType<GameBoardProps>)
  return BOARD_CACHE.get(kind)!
}

export function KernelBot({
  entry,
  kind,
  onToast,
  onOpenSettings
}: {
  entry: CatalogEntry
  /** Registry kind (GamePage resolves catalog aliases like checkers-8). */
  kind: GameKind
  onToast: (msg: string) => void
  /** Deep link to Settings → Datasets (the go install prompt). */
  onOpenSettings?: () => void
}): JSX.Element {
  const game = useMemo(() => getGame(kind)!, [kind])
  const spec = game.spec
  const provider = useMemo(() => resolveBotProvider(kind), [kind])
  const Board = lazyBoard(kind, game.loadRenderer)
  const isGo = kind === 'go'

  const [phase, setPhase] = useState<Phase>('setup')
  const [level, setLevel] = useState(3)
  const [userColor, setUserColor] = useState<PlayerColor>(spec.players[0])
  const [goSize, setGoSize] = useState<9 | 13 | 19>(9)
  const [state, setState] = useState<unknown>(null)
  const [thinking, setThinking] = useState(false)
  // Go engine availability: null = probing, then katagoReady. Non-go kinds are
  // always available (in-process bots).
  const [engineReady, setEngineReady] = useState<boolean | null>(isGo ? null : true)
  // Monotonic game id: a stale engine reply from a finished/restarted game is dropped.
  const gameSeq = useRef(0)

  // Probe KataGo availability behind the setup card (go only). Re-probed on
  // every setup return so finishing a Settings download is picked up.
  useEffect(() => {
    if (!isGo || phase !== 'setup') return
    let cancelled = false
    const api = typeof window !== 'undefined' ? window.api : undefined
    if (!api) {
      setEngineReady(false)
      return
    }
    api.engine
      .status()
      .then((s) => {
        if (!cancelled) setEngineReady(s.katagoReady)
      })
      .catch(() => {
        if (!cancelled) setEngineReady(false)
      })
    return () => {
      cancelled = true
    }
  }, [isGo, phase])

  useBoardSound(kind, state)

  const initOptions = isGo ? { size: goSize } : undefined
  const moves = ((state ?? {}) as { moves?: readonly string[] }).moves ?? []
  const outcome = state !== null ? spec.result(state) : null
  const legal = useMemo(
    () => (state !== null && !outcome ? spec.legalMoves(state) : []),
    [spec, state, outcome]
  )
  const turn: PlayerColor = spec.players[moves.length % 2]
  const goScoring =
    isGo && state !== null && !outcome && (spec as unknown as GoSpec).isScoringPhase(state as GoState)
  // The bot only ever answers board moves; in go's scoring phase (no legal
  // moves, result pending) the HUMAN resolves dead stones for both sides.
  const isUserTurn = phase === 'playing' && !outcome && !goScoring && turn === userColor

  const applyMove = useCallback(
    (move: string): boolean => {
      let played = false
      setState((s: unknown) => {
        if (s === null) return s
        const next = spec.play(s, move)
        if (!next) return s
        played = true
        return next
      })
      return played
    },
    [spec]
  )

  // Bot turn: ask the provider once per position; drop stale replies.
  useEffect(() => {
    if (phase !== 'playing' || outcome || goScoring || turn === userColor || state === null) return
    if (legal.length === 0) return
    const seq = gameSeq.current
    let cancelled = false
    setThinking(true)
    provider
      .move(state, level)
      .then((mv) => {
        if (cancelled || seq !== gameSeq.current) return
        setThinking(false)
        if (!applyMove(mv)) onToast(`The bot offered an illegal move (${mv}) — try restarting.`)
      })
      .catch((err) => {
        if (cancelled || seq !== gameSeq.current) return
        setThinking(false)
        setPhase('setup')
        if (err instanceof BotUnavailableError) {
          // Back on the setup card the availability probe re-runs and renders
          // the inline install prompt — the toast is just the immediate why.
          if (isGo) setEngineReady(false)
          onToast(err.message)
        } else {
          onToast('The bot failed to move — try restarting the game.')
        }
      })
    return () => {
      cancelled = true
    }
  }, [phase, state, turn, userColor, outcome, goScoring, legal, provider, level, applyMove, onToast, isGo])

  const onUserMove = useCallback(
    (move: string) => {
      if (isUserTurn) applyMove(move)
    },
    [isUserTurn, applyMove]
  )

  // Go scoring actions (markdead/finalize) — proposed by the board, resolved
  // through the GoSpec seam exactly like KernelOtb.
  const onAction = useCallback(
    (action: string) => {
      if (!isGo) return
      const gs = spec as unknown as GoSpec
      setState((s: unknown) => {
        if (s === null) return s
        if (action === 'finalize') return gs.finalizeScore(s as GoState) ?? s
        if (action.startsWith('markdead ')) {
          return gs.markDead(s as GoState, action.slice('markdead '.length)) ?? s
        }
        return s
      })
    },
    [isGo, spec]
  )

  const start = useCallback(() => {
    gameSeq.current++
    setState(spec.init(initOptions))
    setThinking(false)
    setPhase('playing')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec, goSize])

  const backToSetup = useCallback(() => {
    gameSeq.current++
    setThinking(false)
    setPhase('setup')
  }, [])

  const canPass = isUserTurn && legal.includes('pass')
  const canSwap = isUserTurn && legal.includes('swap')

  const resultLabel =
    outcome &&
    (outcome.winner === null
      ? `Draw — ${outcome.reason.replace(/-/g, ' ')}`
      : `${outcome.winner === userColor ? 'You win' : 'Bot wins'} — ${outcome.reason.replace(/-/g, ' ')}`)

  if (phase === 'setup') {
    return (
      <div className="vbot-setup">
        <div className="vbot-setup-card">
          <div className="vbot-setup-head">
            <span className="mode-icon">
              <Bot size={22} aria-hidden />
            </span>
            <div>
              <h3>Play {entry.title} vs Bot</h3>
              <p>
                {isGo
                  ? 'Five strengths, powered by KataGo.'
                  : 'Five strengths, engine-free and instant.'}
              </p>
            </div>
          </div>

          <div className="vbot-levels" role="radiogroup" aria-label="Bot strength">
            {BOT_LEVEL_NAMES.map((name, i) => (
              <button
                key={name}
                type="button"
                role="radio"
                aria-checked={level === i + 1}
                className={`vbot-level${level === i + 1 ? ' is-active' : ''}`}
                onClick={() => setLevel(i + 1)}
              >
                <span className="vbot-level-num">{i + 1}</span>
                <span className="vbot-level-name">{name}</span>
              </button>
            ))}
          </div>
          <p className="vbot-level-hint">{provider.describe(level)}</p>

          {isGo && (
            <div className="vbot-colors is-three" role="radiogroup" aria-label="Board size">
              {GO_SIZES.map((sz) => (
                <button
                  key={sz}
                  type="button"
                  role="radio"
                  aria-checked={goSize === sz}
                  className={`vbot-color${goSize === sz ? ' is-active' : ''}`}
                  onClick={() => setGoSize(sz)}
                >
                  {sz}×{sz}
                </button>
              ))}
            </div>
          )}

          <div className="vbot-colors" role="radiogroup" aria-label="Play as">
            {spec.players.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={userColor === c}
                className={`vbot-color${userColor === c ? ' is-active' : ''}`}
                onClick={() => setUserColor(c)}
              >
                <span className={`votb-turn-dot is-${c}`} aria-hidden />
                Play {kernelColorLabel(kind, c)}
                {c === spec.players[0] ? ' (first)' : ''}
              </button>
            ))}
          </div>

          {engineReady === false ? (
            <div className="vbot-install" role="status">
              <p>
                Go bots run on <strong>KataGo</strong> — a small engine download that stays on this
                machine. Grab it once and every level (including the human-style ranks) unlocks.
              </p>
              {onOpenSettings ? (
                <button type="button" className="votb-btn is-primary" onClick={onOpenSettings}>
                  <Download size={15} aria-hidden /> Download in Settings → Datasets
                </button>
              ) : (
                <p className="muted small">Open Settings → Datasets to download it.</p>
              )}
            </div>
          ) : (
            <button
              type="button"
              className="votb-btn is-primary vbot-start"
              onClick={start}
              disabled={engineReady === null}
            >
              <Swords size={15} aria-hidden /> {engineReady === null ? 'Checking engine…' : 'Start game'}
            </button>
          )}
        </div>
      </div>
    )
  }

  const shimmer = <div className="kotb-loading">Setting up the {spec.title} board…</div>

  return (
    <div className="votb">
      <div className="votb-stage">
        {state === null ? (
          shimmer
        ) : (
          <Suspense fallback={shimmer}>
            <Board
              kind={kind}
              state={state}
              orientation={userColor === 'black' && spec.flipPolicy === 'rotate' ? 'black' : 'white'}
              // Scoring phase (go): the human marks dead stones for BOTH sides.
              interactive={isUserTurn || goScoring}
              onMove={onUserMove}
              onAction={onAction}
            />
          </Suspense>
        )}
        {outcome && (
          <div className="votb-banner" role="status">
            <strong>{resultLabel}</strong>
            <button type="button" className="votb-btn is-primary" onClick={start}>
              <RotateCcw size={14} aria-hidden /> Rematch
            </button>
          </div>
        )}
      </div>
      <aside className="votb-side">
        <div className="votb-turn">
          <span className={`votb-turn-dot is-${turn}`} aria-hidden />
          {goScoring
            ? 'Scoring — tap dead groups'
            : outcome
              ? 'Game over'
              : isUserTurn
                ? 'Your move'
                : 'Bot to move'}
          <span className="votb-movecount">{moves.length} moves</span>
        </div>
        <div className={`vbot-opponent${thinking ? ' is-thinking' : ''}`}>
          <Bot size={16} aria-hidden />
          <span>
            Level {level} · {BOT_LEVEL_NAMES[level - 1]}
          </span>
          {thinking && (
            <span className="vbot-dots" aria-label="Bot is thinking">
              <i />
              <i />
              <i />
            </span>
          )}
        </div>
        {canPass && (
          <button type="button" className="votb-btn" onClick={() => onUserMove('pass')}>
            Pass{kind === 'othello' ? ' — no legal placement' : ''}
          </button>
        )}
        {canSwap && (
          <button type="button" className="votb-btn" onClick={() => onUserMove('swap')}>
            Swap (pie rule)
          </button>
        )}
        <button type="button" className="votb-btn" onClick={start}>
          <RotateCcw size={14} aria-hidden /> Restart game
        </button>
        <button type="button" className="votb-btn" onClick={backToSetup}>
          Change level
        </button>
        <p className="votb-note">
          {entry.title} vs bot — {provider.describe(level)}.
          {isGo && ' Two passes end the game — then tap dead groups and finalize the score.'}
        </p>
      </aside>
    </div>
  )
}
