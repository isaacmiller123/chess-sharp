import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Role } from 'chessops/types'
import type { Key } from 'chessground/types'
import type { Persona } from '../../../../shared/types'
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
import { SetupCard, type ColorChoice, type OpponentMode } from './SetupCard'
import { GameView, type GameViewBanner } from './GameView'
import { pieceSetClass } from '../../board/pieceSets'
import { useSound } from '../../sound'
import { useChessClock } from './useChessClock'
import { DEFAULT_TIME_CONTROL_ID, timeControlById, type TimeControl } from './timeControl'
import './play.css'

const ROLE_FROM_CHAR: Record<string, Role> = { q: 'queen', r: 'rook', b: 'bishop', n: 'knight' }

type Phase = 'setup' | 'game'

// The resolved opponent for an in-progress game. Captured at game start so the
// reply loop and save/report paths stay consistent even if setup changes later.
type Opponent =
  | { kind: 'engine'; elo: number }
  | { kind: 'persona'; persona: Persona }

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

function opponentName(o: Opponent): string {
  return o.kind === 'persona' ? o.persona.name : 'Stockfish'
}

function opponentElo(o: Opponent): number {
  return o.kind === 'persona' ? o.persona.peakElo : o.elo
}

export function PlayView() {
  const { settings } = useSettings()
  const { play, playMove } = useSound()

  // Setup form.
  const [phase, setPhase] = useState<Phase>('setup')
  const [mode, setMode] = useState<OpponentMode>('engine')
  const [elo, setElo] = useState(1500)
  const [colorChoice, setColorChoice] = useState<ColorChoice>('white')
  const [timeControlId, setTimeControlId] = useState<string>(DEFAULT_TIME_CONTROL_ID)

  // Persona gallery.
  const [personas, setPersonas] = useState<Persona[]>([])
  const [personasLoading, setPersonasLoading] = useState(false)
  const [selectedPersonaId, setSelectedPersonaId] = useState<string | null>(null)

  // Resolved at game start.
  const [userColor, setUserColor] = useState<Color>('white')
  const [orientation, setOrientation] = useState<Color>('white')
  const [opponent, setOpponent] = useState<Opponent>({ kind: 'engine', elo: 1500 })
  const [timeControl, setTimeControl] = useState<TimeControl>(() => timeControlById(DEFAULT_TIME_CONTROL_ID))

  // In-game runtime.
  const tree = useGameTree()
  const [thinking, setThinking] = useState(false)
  const [pendingPromo, setPendingPromo] = useState<{ orig: string; dest: string } | null>(null)
  const [nonce, setNonce] = useState(0)
  const [banner, setBanner] = useState<BannerState | null>(null)
  // Bumped at each game start to reset the clocks (even for an identical control).
  const [gameKey, setGameKey] = useState(0)

  // save+report fire exactly once per game; a ref so async paths see the latest value.
  const savedRef = useRef(false)

  // ---- Load personas once on first entering GM mode (lazy) ----
  useEffect(() => {
    if (mode !== 'persona' || personas.length > 0 || personasLoading) return
    const api = window.api?.personas
    if (!api) return
    let cancelled = false
    setPersonasLoading(true)
    api
      .list()
      .then((r) => {
        if (cancelled) return
        setPersonas(r.personas)
        if (r.personas.length > 0) setSelectedPersonaId((cur) => cur ?? r.personas[0].id)
      })
      .catch(() => {
        if (!cancelled) setPersonas([])
      })
      .finally(() => {
        if (!cancelled) setPersonasLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [mode, personas.length, personasLoading])

  const fen = tree.currentFen
  const dests = useMemo(() => destsFor(fen), [fen])
  const turn = turnColor(fen)
  const check = checkColor(fen)
  const lastMove = tree.current.move ? uciToLastMove(tree.current.move.uci) : undefined
  const over = banner !== null || outcome(fen).over
  // The live game position is the mainline tip (a node with no continuation).
  // When the user navigates to a PAST move, we're not at the tip — the board is
  // read-only and the engine must NOT move (it already replied at the tip).
  const atTip = tree.current.children.length === 0

  const oppName = opponentName(opponent)
  const oppElo = opponentElo(opponent)
  const whiteName = userColor === 'white' ? settings.username : oppName
  const blackName = userColor === 'white' ? oppName : settings.username

  const finishGame = useCallback(
    async (result: GameResult, reason: string) => {
      if (savedRef.current) return
      savedRef.current = true

      const isPersona = opponent.kind === 'persona'
      const headers: Record<string, string> = {
        Event: isPersona ? `Play vs ${oppName} style` : 'Play vs Stockfish',
        Site: 'Chess#',
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
        opponentKind: isPersona ? 'persona' : 'engine',
        opponentLabel: oppName,
        opponentElo: oppElo,
        source: 'play'
      })

      const rep = await window.api?.games.reportResult({
        botElo: oppElo,
        score: userScore(result, userColor)
      })
      setBanner({ result, reason, delta: rep?.delta, newRating: rep?.ratingAfter })
      play('gameEnd')
    },
    [opponent, oppName, oppElo, tree.root, userColor, whiteName, blackName, play]
  )

  // ---- Clock --------------------------------------------------------------
  // A flag fall ends the game as a time loss for whichever side ran out. The
  // winner is simply the other color; finishGame handles save + report.
  const onFlag = useCallback(
    (loser: Color) => {
      if (savedRef.current) return
      const result: GameResult = loser === 'white' ? '0-1' : '1-0'
      void finishGame(result, 'time')
    },
    [finishGame]
  )

  const onLowTime = useCallback(() => play('lowTime'), [play])

  const clock = useChessClock({
    timeControl,
    gameKey,
    turn,
    // White's clock starts ticking the moment the game is live (standard chess).
    running: phase === 'game',
    over,
    onFlag,
    onLowTime
  })

  // Opponent reply loop — driven by fen changes. Also fires on game start when the
  // opponent plays first (user chose Black). Routes through personas.move in GM
  // mode and engine.play otherwise. Only mutates the tree.
  useEffect(() => {
    if (phase !== 'game') return
    if (!atTip) return // viewing history — don't auto-move the engine
    if (turn === userColor) return
    if (outcome(fen).over) return

    let cancelled = false
    setThinking(true)
    ;(async () => {
      let bestmove: string | undefined
      if (opponent.kind === 'persona') {
        const res = await window.api?.personas.move({
          fen,
          personaId: opponent.persona.id,
          movetimeMs: settings.playThinkMs
        })
        bestmove = res?.bestmove
      } else {
        const res = await window.api?.engine.play({
          fen,
          level: { uciElo: opponent.elo },
          limit: { kind: 'movetime', value: settings.playThinkMs }
        })
        bestmove = res?.bestmove
      }
      if (cancelled) return
      setThinking(false)
      // Game ended out-of-band while the opponent was thinking (e.g. resign).
      if (savedRef.current || !bestmove) return
      const uci = bestmove
      const promo = uci.length > 4 ? ROLE_FROM_CHAR[uci[4]] : undefined
      const m = applyMove(fen, uci.slice(0, 2), uci.slice(2, 4), promo)
      if (cancelled || !m) return
      tree.addMove(m)
      // The opponent just moved: credit its increment. `turn` here is the
      // opponent's color (we only enter this branch when it's their move).
      clock.addIncrement(turn)
      playMove(m)
      const out = outcome(m.fen)
      if (out.over && out.result) void finishGame(out.result, out.reason ?? 'draw')
    })()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fen, phase, userColor, opponent, atTip])

  const commit = useCallback(
    (orig: string, dest: string, promotion?: Role) => {
      const m = applyMove(fen, orig, dest, promotion)
      if (!m) {
        setNonce((n) => n + 1) // illegal: re-sync board to truth
        return
      }
      tree.addMove(m)
      // Credit the increment to the side that just moved (the user's color).
      clock.addIncrement(turnColor(fen))
      playMove(m)
      const out = outcome(m.fen)
      if (out.over && out.result) void finishGame(out.result, out.reason ?? 'draw')
      // else: the fen change re-triggers the opponent-reply effect.
    },
    [fen, tree, finishGame, playMove, clock]
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
    // Resolve the opponent now so an in-progress game ignores later setup edits.
    let resolved: Opponent
    if (mode === 'persona') {
      const persona = personas.find((p) => p.id === selectedPersonaId)
      if (!persona) return // guarded by SetupCard's disabled Start, but stay safe
      resolved = { kind: 'persona', persona }
    } else {
      resolved = { kind: 'engine', elo }
    }
    setOpponent(resolved)

    // Freeze the time control for this game so later setup edits don't apply.
    const tc = timeControlById(timeControlId)
    setTimeControl(tc)

    const c: Color = colorChoice === 'random' ? (Math.random() < 0.5 ? 'white' : 'black') : colorChoice
    setUserColor(c)
    setOrientation(c)
    savedRef.current = false
    setBanner(null)
    setPendingPromo(null)
    setThinking(false)
    await window.api?.engine.newGame('play')
    tree.reset(INITIAL_FEN)
    // Bump the game key so the clock resets to base time (even for an unchanged
    // control). Unlimited is a no-op clock — the hook parks itself.
    setGameKey((k) => k + 1)
    setPhase('game')
    play('gameStart')
    // The fen effect fires; if the user is Black, the opponent replies as White.
  }, [mode, personas, selectedPersonaId, elo, colorChoice, timeControlId, tree, play])

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
          mode={mode}
          elo={elo}
          colorChoice={colorChoice}
          timeControlId={timeControlId}
          personas={personas}
          personasLoading={personasLoading}
          selectedPersonaId={selectedPersonaId}
          onMode={setMode}
          onElo={setElo}
          onColor={setColorChoice}
          onTimeControl={setTimeControlId}
          onSelectPersona={setSelectedPersonaId}
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

  const opponentSub = `${oppElo} Elo`
  const opponentStyleLine = opponent.kind === 'persona' ? `in the style of ${opponent.persona.name}` : undefined

  const opponentColor: Color = userColor === 'white' ? 'black' : 'white'
  const clockLive = clock.active && !over
  const opponentClock = {
    ms: clock.times[opponentColor],
    active: clockLive && turn === opponentColor
  }
  const userClock = {
    ms: clock.times[userColor],
    active: clockLive && turn === userColor
  }

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
      atTip={atTip}
      pendingPromo={pendingPromo}
      nonce={nonce}
      boardTheme={settings.boardTheme}
      pieceSetClass={pieceSetClass(settings.pieceSet)}
      showLegal={settings.showLegal}
      coordinates={settings.coordinates}
      animation={settings.animation}
      userName={settings.username}
      userAvatar={settings.avatar}
      opponentName={oppName}
      opponentSub={opponentSub}
      opponentStyleLine={opponentStyleLine}
      clockActive={clock.active}
      opponentClock={opponentClock}
      userClock={userClock}
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
