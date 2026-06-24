import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Role } from 'chessops/types'
import type { Key } from 'chessground/types'
import { useGameTree } from '../../state/gameTree'
import { useSettings } from '../../state/settings'
import { treeToPgn } from '../../state/pgn'
import {
  applyMove,
  checkColor,
  destsFor,
  isPromotion,
  outcome,
  turnColor,
  uciToLastMove,
  INITIAL_FEN,
  type Color,
  type GameResult
} from '../../chess/chess'
import { SetupCard, type ColorChoice } from './SetupCard'
import { GameView, type GameViewBanner } from './GameView'
import './play.css'

const ROLE_FROM_CHAR: Record<string, Role> = { q: 'queen', r: 'rook', b: 'bishop', n: 'knight' }
const ENGINE_MOVETIME_MS = 600

type Phase = 'setup' | 'game'

interface BannerState {
  result: GameResult
  reason: string
  delta?: number
  newRating?: number
}

function yyyymmdd(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}.${m}.${day}`
}

// User-perspective score (1 win / 0.5 draw / 0 loss) for reportResult.
function userScore(result: GameResult, userColor: Color): number {
  if (result === '1/2-1/2') return 0.5
  const userWon = (result === '1-0' && userColor === 'white') || (result === '0-1' && userColor === 'black')
  return userWon ? 1 : 0
}

function outcomeForUser(result: GameResult, userColor: Color): 'win' | 'loss' | 'draw' {
  const s = userScore(result, userColor)
  return s === 1 ? 'win' : s === 0.5 ? 'draw' : 'loss'
}

export function PlayView() {
  const { settings } = useSettings()

  // Setup form.
  const [phase, setPhase] = useState<Phase>('setup')
  const [elo, setElo] = useState(1500)
  const [colorChoice, setColorChoice] = useState<ColorChoice>('white')

  // Resolved at game start.
  const [userColor, setUserColor] = useState<Color>('white')
  const [orientation, setOrientation] = useState<Color>('white')

  // In-game runtime.
  const tree = useGameTree()
  const [thinking, setThinking] = useState(false)
  const [pendingPromo, setPendingPromo] = useState<{ orig: string; dest: string } | null>(null)
  const [nonce, setNonce] = useState(0)
  const [banner, setBanner] = useState<BannerState | null>(null)

  // save+report fire exactly once per game; a ref so async paths see the latest value.
  const savedRef = useRef(false)

  const fen = tree.currentFen
  const dests = useMemo(() => destsFor(fen), [fen])
  const turn = turnColor(fen)
  const check = checkColor(fen)
  const lastMove = tree.current.move ? uciToLastMove(tree.current.move.uci) : undefined
  const over = banner !== null || outcome(fen).over

  const whiteName = userColor === 'white' ? settings.username : 'Stockfish'
  const blackName = userColor === 'white' ? 'Stockfish' : settings.username

  const finishGame = useCallback(
    async (result: GameResult, reason: string) => {
      if (savedRef.current) return
      savedRef.current = true

      const headers: Record<string, string> = {
        Event: 'Play vs Stockfish',
        Site: 'Offline Chess Trainer',
        Date: yyyymmdd(),
        White: whiteName,
        Black: blackName,
        Result: result
      }
      const pgn = treeToPgn(tree.root, headers)

      await window.api?.games.save({
        pgn,
        userColor,
        result,
        opponentKind: 'engine',
        opponentLabel: 'Stockfish',
        opponentElo: elo,
        source: 'play'
      })

      const rep = await window.api?.games.reportResult({ botElo: elo, score: userScore(result, userColor) })
      setBanner({ result, reason, delta: rep?.delta, newRating: rep?.ratingAfter })
    },
    [elo, tree.root, userColor, whiteName, blackName]
  )

  // Engine reply loop — driven by fen changes. Also fires on game start when the
  // engine plays first (user chose Black). commit() only mutates the tree.
  useEffect(() => {
    if (phase !== 'game') return
    if (turn === userColor) return
    if (outcome(fen).over) return

    let cancelled = false
    setThinking(true)
    ;(async () => {
      const res = await window.api?.engine.play({
        fen,
        level: { uciElo: elo },
        limit: { kind: 'movetime', value: ENGINE_MOVETIME_MS }
      })
      if (cancelled) return
      setThinking(false)
      // Game ended out-of-band while the engine was thinking (e.g. resign).
      if (savedRef.current || !res?.bestmove) return
      const uci = res.bestmove
      const promo = uci.length > 4 ? ROLE_FROM_CHAR[uci[4]] : undefined
      const m = applyMove(fen, uci.slice(0, 2), uci.slice(2, 4), promo)
      if (cancelled || !m) return
      tree.addMove(m)
      const out = outcome(m.fen)
      if (out.over && out.result) void finishGame(out.result, out.reason ?? 'draw')
    })()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fen, phase, userColor, elo])

  const commit = useCallback(
    (orig: string, dest: string, promotion?: Role) => {
      const m = applyMove(fen, orig, dest, promotion)
      if (!m) {
        setNonce((n) => n + 1) // illegal: re-sync board to truth
        return
      }
      tree.addMove(m)
      const out = outcome(m.fen)
      if (out.over && out.result) void finishGame(out.result, out.reason ?? 'draw')
      // else: the fen change re-triggers the engine-reply effect.
    },
    [fen, tree, finishGame]
  )

  const onMove = useCallback(
    (orig: Key, dest: Key) => {
      if (isPromotion(fen, orig, dest)) setPendingPromo({ orig, dest })
      else commit(orig, dest)
    },
    [fen, commit]
  )

  const onPromo = useCallback(
    (role: Role) => {
      if (pendingPromo) commit(pendingPromo.orig, pendingPromo.dest, role)
      setPendingPromo(null)
    },
    [pendingPromo, commit]
  )

  const onPromoCancel = useCallback(() => {
    setPendingPromo(null)
    setNonce((n) => n + 1)
  }, [])

  const startGame = useCallback(async () => {
    const c: Color = colorChoice === 'random' ? (Math.random() < 0.5 ? 'white' : 'black') : colorChoice
    setUserColor(c)
    setOrientation(c)
    savedRef.current = false
    setBanner(null)
    setPendingPromo(null)
    setThinking(false)
    await window.api?.engine.newGame('play')
    tree.reset(INITIAL_FEN)
    setPhase('game')
    // The fen effect fires; if the user is Black, the engine replies as White.
  }, [colorChoice, tree])

  const onResign = useCallback(() => {
    if (over) return
    const result: GameResult = userColor === 'white' ? '0-1' : '1-0'
    void finishGame(result, 'resignation')
  }, [over, userColor, finishGame])

  const onFlip = useCallback(() => setOrientation((o) => (o === 'white' ? 'black' : 'white')), [])

  const onNewGame = useCallback(() => {
    setPhase('setup')
    setBanner(null)
    setPendingPromo(null)
    setThinking(false)
  }, [])

  if (phase === 'setup') {
    return (
      <div className="play-view-shell">
        <SetupCard
          elo={elo}
          colorChoice={colorChoice}
          onElo={setElo}
          onColor={setColorChoice}
          onStart={() => void startGame()}
        />
      </div>
    )
  }

  const gameBanner: GameViewBanner | null = banner
    ? {
        result: banner.result,
        reason: banner.reason,
        outcomeForUser: outcomeForUser(banner.result, userColor),
        delta: banner.delta,
        newRating: banner.newRating
      }
    : null

  return (
    <GameView
      fen={fen}
      orientation={orientation}
      turn={turn}
      userColor={userColor}
      dests={dests}
      lastMove={lastMove}
      check={check}
      thinking={thinking}
      over={over}
      pendingPromo={pendingPromo}
      nonce={nonce}
      boardTheme={settings.boardTheme}
      showLegal={settings.showLegal}
      coordinates={settings.coordinates}
      animation={settings.animation}
      userName={settings.username}
      userAvatar={settings.avatar}
      elo={elo}
      tree={tree}
      banner={gameBanner}
      onMove={onMove}
      onPromo={onPromo}
      onPromoCancel={onPromoCancel}
      onResign={onResign}
      onNewGame={onNewGame}
      onFlip={onFlip}
    />
  )
}

export default PlayView
