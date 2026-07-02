// Play → Online (LAN) tab. Two copies of Chess# on the same network play each
// other over a direct WebSocket: one HOSTS (opens a server, shares a short join
// code), the other JOINS (enters the code). Everything below the setup cards is a
// self-contained live game that reuses GameView.
//
// This file is standalone (it consumes ONLY window.api.mp + shared chess
// helpers) but exposes a small seam to its host surface (SetupCard/PlayView):
//   initialTimeControl — seeds the host card's picker from the shared Play
//                        time control (when timed; Unlimited falls back to 10+0
//                        since the wire refuses untimed games);
//   onTimeControl      — reflects picker changes back into the shared control;
//   onStage            — reports 'idle' | 'lobby' | 'game' so the host surface
//                        can widen for a live game and lock the tab strip
//                        (unmounting this tab tears the session down).
//
// Fair-play rules for online games (contract): assist/hints and takebacks are
// DISABLED. Clocks are HOST-AUTHORITATIVE — we render whatever clockMs the host
// puts on each 'move' event and never run a local countdown of our own.

import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react'
import type { Role } from 'chessops/types'
import type { Key } from 'chessground/types'
import { Copy, Check, Wifi, Radio, LogIn, Loader2, AlertTriangle, X } from 'lucide-react'
import type { MpColor, MpEvent, MpGameConfig } from '@shared/types'
import { useGameTree } from '../../state/gameTree'
import { useSettings } from '../../state/settings'
import { treeToPgn } from '../../state/pgn'
import { useSound } from '../../sound'
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
import { pieceSetClass } from '../../board/pieceSets'
import { GameView, type GameViewBanner } from './GameView'
import { TimeControlPicker } from './TimeControlPicker'
import { timeControlById, formatClock, type TimeControl } from './timeControl'
import './online.css'

const ROLE_FROM_CHAR: Record<string, Role> = { q: 'queen', r: 'rook', b: 'bishop', n: 'knight' }

type ColorChoice = MpColor | 'random'

// The tab's phase machine.
//   menu       — host / join cards
//   hosting    — server open, waiting for a guest (code shown)
//   connecting — guest is dialing the host
//   game       — a game is live (or finished, banner up)
type Phase = 'menu' | 'hosting' | 'connecting' | 'game'

/** What the host surface needs to know about this tab: nothing live ('idle'),
 *  a session is open but no game yet ('lobby'), or a game is live ('game'). */
export type OnlineStage = 'idle' | 'lobby' | 'game'

export interface OnlineTabProps {
  /** Seed for the host card's time control — the shared Play control. Untimed
   *  values fall back to 10+0 (the wire refuses initialMs < 1s). */
  initialTimeControl?: TimeControl
  /** Reflect host-card picker changes back into the shared Play control. */
  onTimeControl?: (tc: TimeControl) => void
  /** Stage reports for the host surface (tab locking / game-width handoff). */
  onStage?: (stage: OnlineStage) => void
}

/** Per-side clock, mirrored from host-authoritative 'move'.clockMs. */
type Clocks = { white: number; black: number }

function yyyymmdd(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}.${m}.${day}`
}

function outcomeForUser(result: GameResult, userColor: Color): 'win' | 'loss' | 'draw' {
  if (result === '1/2-1/2') return 'draw'
  const userWon = (result === '1-0' && userColor === 'white') || (result === '0-1' && userColor === 'black')
  return userWon ? 'win' : 'loss'
}

export default function OnlineTab({
  initialTimeControl,
  onTimeControl,
  onStage
}: OnlineTabProps = {}): JSX.Element {
  const { settings } = useSettings()
  const { play, playMove } = useSound()

  // ---- setup form ----------------------------------------------------------
  // Online games must be timed (the wire refuses initialMs < 1s): seed from the
  // shared Play control when it carries a clock, else default to a friendly
  // rapid control — and forbid Unlimited at Start either way.
  const [hostTc, setHostTcState] = useState<TimeControl>(() =>
    initialTimeControl && initialTimeControl.baseMs > 0
      ? initialTimeControl
      : timeControlById('10+0')
  )
  // Picker changes also flow up into the shared Play control (one selection
  // across the Local / Online / Grandmasters tabs). Ref keeps the setter stable.
  const onTimeControlRef = useRef(onTimeControl)
  onTimeControlRef.current = onTimeControl
  const setHostTc = useCallback((tc: TimeControl) => {
    setHostTcState(tc)
    onTimeControlRef.current?.(tc)
  }, [])
  const [hostColorChoice, setHostColorChoice] = useState<ColorChoice>('white')
  const [joinCode, setJoinCode] = useState('')

  // ---- connection state ----------------------------------------------------
  const [phase, setPhase] = useState<Phase>('menu')
  const [code, setCode] = useState<string | null>(null) // host's shareable code
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false) // an async host()/join() is in flight
  const [error, setError] = useState<string | null>(null)
  // Our role, set the moment we host()/join(); used for rematch semantics + copy.
  const roleRef = useRef<'host' | 'guest' | null>(null)

  // ---- live game state -----------------------------------------------------
  const tree = useGameTree()
  const [config, setConfig] = useState<MpGameConfig | null>(null)
  const [userColor, setUserColor] = useState<Color>('white')
  const [orientation, setOrientation] = useState<Color>('white')
  const [clocks, setClocks] = useState<Clocks>({ white: 0, black: 0 })
  const [banner, setBanner] = useState<GameViewBanner | null>(null)
  const [nonce, setNonce] = useState(0)
  const [pendingPromo, setPendingPromo] = useState<{ orig: string; dest: string } | null>(null)
  // Incoming draw offer from the opponent (enables an Accept affordance).
  const [drawOffered, setDrawOffered] = useState(false)
  // We offered a draw / rematch and await the peer.
  const [drawSent, setDrawSent] = useState(false)
  const [rematchSent, setRematchSent] = useState(false)
  const [rematchOffered, setRematchOffered] = useState(false) // peer wants a rematch
  const [peerLeft, setPeerLeft] = useState(false)

  // save fires exactly once per finished game.
  const savedRef = useRef(false)
  // Latest values needed inside the (stable) event handler, via refs.
  const userColorRef = useRef<Color>('white')
  userColorRef.current = userColor
  const configRef = useRef<MpGameConfig | null>(null)
  configRef.current = config

  const fen = tree.currentFen
  const dests = useMemo(() => destsFor(fen), [fen])
  const turn = turnColor(fen)
  const check = checkColor(fen)
  const lastMove = tree.current.move ? uciToLastMove(tree.current.move.uci) : undefined
  const over = banner !== null
  const atTip = tree.current.children.length === 0

  // ---- persist a finished game (opponentKind 'human') ----------------------
  const saveFinished = useCallback(
    (result: GameResult) => {
      if (savedRef.current) return
      savedRef.current = true
      const uc = userColorRef.current
      const oppName = 'Opponent'
      const whiteName = uc === 'white' ? settings.username : oppName
      const blackName = uc === 'white' ? oppName : settings.username
      const headers: Record<string, string> = {
        Event: 'Online (LAN) game',
        Site: 'Chess#',
        Date: yyyymmdd(),
        White: whiteName,
        Black: blackName,
        Result: result
      }
      const pgn = treeToPgn(tree.root, headers)
      // Best-effort; never block the banner on a failed save.
      void window.api?.games
        .save({
          pgn,
          whiteName,
          blackName,
          userColor: uc,
          result,
          opponentKind: 'human',
          opponentLabel: oppName,
          source: 'online'
        })
        .catch(() => {})
    },
    [settings.username, tree.root]
  )

  /** End the game locally: raise the banner + persist. Reason drives copy. */
  const endLocally = useCallback(
    (result: GameResult, reason: string) => {
      if (savedRef.current || banner) return
      const uc = userColorRef.current
      setBanner({ result, reason, outcomeForUser: outcomeForUser(result, uc) })
      saveFinished(result)
      play('gameEnd')
    },
    [banner, saveFinished, play]
  )

  // ---- start / reset a fresh game (both new games and rematches) ------------
  const beginGame = useCallback(
    (yourColor: MpColor, cfg: MpGameConfig) => {
      savedRef.current = false
      setConfig(cfg)
      setUserColor(yourColor)
      setOrientation(yourColor)
      setClocks({ white: cfg.tc.initialMs, black: cfg.tc.initialMs })
      setBanner(null)
      setPendingPromo(null)
      setDrawOffered(false)
      setDrawSent(false)
      setRematchSent(false)
      setRematchOffered(false)
      setPeerLeft(false)
      tree.reset(INITIAL_FEN)
      setPhase('game')
      play('gameStart')
    },
    [tree, play]
  )

  // ---- the single event pump ----------------------------------------------
  // Subscribed once on mount; everything the session reports flows through here.
  // Uses refs for values that change so the subscription stays stable (no churn,
  // no missed events on re-render).
  const beginGameRef = useRef(beginGame)
  beginGameRef.current = beginGame
  const endLocallyRef = useRef(endLocally)
  endLocallyRef.current = endLocally

  useEffect(() => {
    const api = window.api?.mp
    if (!api) return
    const off = api.onEvent((ev: MpEvent) => {
      switch (ev.type) {
        case 'peer-joined':
          // Host only — the guest connected; 'start' follows immediately.
          break
        case 'start':
          beginGameRef.current(ev.yourColor, ev.config)
          break
        case 'move': {
          // The REMOTE peer moved. Apply it to our board and adopt the host's
          // authoritative clocks verbatim.
          setClocks(ev.clockMs)
          const uci = ev.uci
          const promo = uci.length > 4 ? ROLE_FROM_CHAR[uci[4]] : undefined
          // Apply against the live tip (functional: we may be mid-render).
          setPendingPromo(null)
          // Use a microtask-free direct apply via the tree helper below.
          applyRemoteMoveRef.current(uci, promo)
          break
        }
        case 'drawOffer':
          setDrawOffered(true)
          break
        case 'drawAccept':
          endLocallyRef.current('1/2-1/2', 'by agreement')
          break
        case 'resign':
          // `by` is whoever resigned (or flagged). Winner is the other side.
          endLocallyRef.current(ev.by === 'white' ? '0-1' : '1-0', 'resignation')
          break
        case 'rematchOffer':
          setRematchOffered(true)
          break
        case 'rematchStart':
          beginGameRef.current(ev.yourColor, configRef.current as MpGameConfig)
          break
        case 'peer-left':
          setPeerLeft(true)
          // If a game was live and undecided, treat it as over (no result saved —
          // an abandoned game isn't a clean win/loss to record).
          break
        case 'error':
          setError(ev.message)
          setBusy(false)
          // A pre-game error (bad handshake) drops us back to the menu.
          setPhase((p) => (p === 'game' ? p : 'menu'))
          break
      }
    })
    return off
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Apply a remote move to the tree + sounds, kept in a ref so the stable event
  // pump can call the freshest version (it closes over `fen`/`tree`).
  const applyRemoteMove = useCallback(
    (uci: string, promo?: Role) => {
      // Always apply from the current live tip, not a displayed history node.
      let tip = tree.root
      while (tip.children[0]) tip = tip.children[0]
      const m = applyMove(tip.fen, uci.slice(0, 2), uci.slice(2, 4), promo)
      if (!m) return
      tree.addMove(m)
      playMove(m)
      const out = outcome(m.fen)
      if (out.over && out.result) endLocallyRef.current(out.result, out.reason ?? 'checkmate')
    },
    [tree, playMove]
  )
  const applyRemoteMoveRef = useRef(applyRemoteMove)
  applyRemoteMoveRef.current = applyRemoteMove

  // ---- local move → optimistic apply + send --------------------------------
  const commit = useCallback(
    (orig: string, dest: string, promotion?: Role) => {
      // Only the side to move at the live tip may move, and only when it's us.
      if (over || !atTip || turn !== userColor) {
        setNonce((n) => n + 1)
        return
      }
      const m = applyMove(fen, orig, dest, promotion)
      if (!m) {
        setNonce((n) => n + 1)
        return
      }
      // Any pending draw exchange is answered by making a move.
      setDrawOffered(false)
      setDrawSent(false)
      tree.addMove(m)
      playMove(m)
      void window.api?.mp.sendMove(m.uci)
      const out = outcome(m.fen)
      if (out.over && out.result) endLocallyRef.current(out.result, out.reason ?? 'checkmate')
    },
    [over, atTip, turn, userColor, fen, tree, playMove]
  )

  const onMove = useCallback(
    (orig: Key, dest: Key) => {
      if (isPromotion(fen, orig, dest)) {
        if (settings.autoQueen) commit(orig, dest, 'queen')
        else setPendingPromo({ orig, dest })
      } else commit(orig, dest)
    },
    [fen, commit, settings.autoQueen]
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

  // ---- host / join actions -------------------------------------------------
  const doHost = useCallback(async () => {
    if (hostTc.baseMs <= 0) {
      setError('Online games need a clock — pick a time control (Unlimited is not supported online).')
      return
    }
    setError(null)
    setBusy(true)
    roleRef.current = 'host'
    const cfg: MpGameConfig = {
      tc: { initialMs: hostTc.baseMs, incrementMs: hostTc.incMs },
      hostColor: hostColorChoice
    }
    try {
      const res = await window.api!.mp.host(cfg)
      setCode(res.code)
      setPhase('hosting')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start hosting.')
      roleRef.current = null
    } finally {
      setBusy(false)
    }
  }, [hostTc, hostColorChoice])

  const doJoin = useCallback(async () => {
    const trimmed = joinCode.trim()
    if (trimmed.length < 5) {
      setError('Enter the full join code your opponent shared.')
      return
    }
    setError(null)
    setBusy(true)
    roleRef.current = 'guest'
    setPhase('connecting')
    try {
      const res = await window.api!.mp.join(trimmed)
      if (!res.ok) {
        setError(res.error ?? 'Could not join that game.')
        setPhase('menu')
        roleRef.current = null
      }
      // On success we simply wait for the 'start' event to flip us into 'game'.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join that game.')
      setPhase('menu')
      roleRef.current = null
    } finally {
      setBusy(false)
    }
  }, [joinCode])

  // ---- leave / teardown ----------------------------------------------------
  const leave = useCallback(() => {
    void window.api?.mp.leave()
    roleRef.current = null
    setCode(null)
    setConfig(null)
    setBanner(null)
    setError(null)
    setPeerLeft(false)
    setDrawOffered(false)
    setDrawSent(false)
    setRematchSent(false)
    setRematchOffered(false)
    setPhase('menu')
  }, [])

  // Tear the session down if the tab unmounts mid-session.
  useEffect(() => {
    return () => {
      void window.api?.mp.leave()
    }
  }, [])

  // Report the stage to the host surface: 'game' widens the play area and locks
  // the tab strip; any non-menu phase ('lobby') locks the strip so a hosted code
  // or a dialing guest isn't silently killed by a tab switch. Ref-read callback
  // keeps the effect keyed on phase alone; unmount resets to 'idle'.
  const onStageRef = useRef(onStage)
  onStageRef.current = onStage
  useEffect(() => {
    onStageRef.current?.(phase === 'game' ? 'game' : phase === 'menu' ? 'idle' : 'lobby')
  }, [phase])
  useEffect(
    () => () => {
      onStageRef.current?.('idle')
    },
    []
  )

  // ---- in-game control handlers -------------------------------------------
  const onResign = useCallback(() => {
    if (over) return
    void window.api?.mp.resign()
    // The session echoes a 'resign' event back to us, which raises the banner.
  }, [over])

  const onOfferDraw = useCallback(() => {
    if (over) return
    if (drawOffered) {
      void window.api?.mp.acceptDraw()
    } else {
      setDrawSent(true)
      void window.api?.mp.offerDraw()
    }
  }, [over, drawOffered])

  const onRematch = useCallback(() => {
    setRematchSent(true)
    void window.api?.mp.offerRematch()
  }, [])

  const onFlip = useCallback(() => setOrientation((o) => (o === 'white' ? 'black' : 'white')), [])

  const copyCode = useCallback(() => {
    if (!code) return
    void navigator.clipboard?.writeText(code).then(
      () => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1600)
      },
      () => {}
    )
  }, [code])

  // ==========================================================================
  // RENDER
  // ==========================================================================
  if (phase === 'game') {
    return (
      <OnlineGame
        fen={fen}
        orientation={orientation}
        turn={turn}
        userColor={userColor}
        dests={dests}
        lastMove={lastMove}
        check={check}
        over={over}
        atTip={atTip}
        pendingPromo={pendingPromo}
        nonce={nonce}
        clocks={clocks}
        config={config}
        banner={banner}
        drawOffered={drawOffered}
        drawSent={drawSent}
        rematchSent={rematchSent}
        rematchOffered={rematchOffered}
        peerLeft={peerLeft}
        settings={settings}
        tree={tree}
        onMove={onMove}
        onPromo={onPromo}
        onPromoCancel={onPromoCancel}
        onResign={onResign}
        onOfferDraw={onOfferDraw}
        onRematch={onRematch}
        onFlip={onFlip}
        onLeave={leave}
      />
    )
  }

  // ---- setup / lobby -------------------------------------------------------
  return (
    <div className="online-lobby">
      <header className="online-lobby-head">
        <h2>Play online</h2>
        <p className="muted">
          One of you hosts and shares a code; the other joins. On the same Wi-Fi it just works.
        </p>
      </header>

      {error && (
        <div className="online-error" role="alert">
          <AlertTriangle size={15} aria-hidden />
          <span>{error}</span>
          <button className="icon-btn online-error-x" onClick={() => setError(null)} aria-label="Dismiss">
            <X size={14} />
          </button>
        </div>
      )}

      {phase === 'hosting' && code ? (
        <HostWaiting code={code} copied={copied} onCopy={copyCode} onCancel={leave} />
      ) : phase === 'connecting' ? (
        <div className="online-card online-connecting">
          <Loader2 className="spin" size={22} aria-hidden />
          <span>Connecting to the host…</span>
          <button className="btn ghost" onClick={leave}>
            Cancel
          </button>
        </div>
      ) : (
        <div className="online-cards">
          {/* HOST */}
          <section className="online-card" aria-label="Host a game">
            <div className="online-card-head">
              <Radio size={18} className="online-card-icon" aria-hidden />
              <div>
                <h3>Host a game</h3>
                <span className="muted small">Open a table and share the code.</span>
              </div>
            </div>

            <div className="online-field">
              <span className="online-label">Time control</span>
              <TimeControlPicker value={hostTc} onChange={setHostTc} dense />
              {hostTc.baseMs <= 0 && (
                <p className="online-note warn">Online games need a clock — pick any timed control.</p>
              )}
            </div>

            <div className="online-field">
              <span className="online-label">Play as</span>
              <div className="online-colors" role="group" aria-label="Play as">
                {(['white', 'black', 'random'] as ColorChoice[]).map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`online-color${hostColorChoice === c ? ' on' : ''}`}
                    aria-pressed={hostColorChoice === c}
                    onClick={() => setHostColorChoice(c)}
                  >
                    <span className={`online-disc is-${c}`} aria-hidden>
                      {c === 'white' ? '♔' : c === 'black' ? '♚' : '⯪'}
                    </span>
                    <span className="online-color-label">
                      {c === 'white' ? 'White' : c === 'black' ? 'Black' : 'Random'}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              className="btn online-primary"
              onClick={() => void doHost()}
              disabled={busy || hostTc.baseMs <= 0}
            >
              {busy && roleRef.current === 'host' ? (
                <>
                  <Loader2 className="spin" size={15} /> Opening…
                </>
              ) : (
                <>
                  <Radio size={15} /> Start &amp; get code
                </>
              )}
            </button>
          </section>

          {/* JOIN */}
          <section className="online-card" aria-label="Join a game">
            <div className="online-card-head">
              <LogIn size={18} className="online-card-icon" aria-hidden />
              <div>
                <h3>Join a game</h3>
                <span className="muted small">Enter the code your opponent sent.</span>
              </div>
            </div>

            <div className="online-field">
              <span className="online-label" id="join-code-label">
                Join code
              </span>
              <input
                className="online-code-input num"
                aria-labelledby="join-code-label"
                placeholder="XXXXX-XXXXX"
                autoCapitalize="characters"
                spellCheck={false}
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void doJoin()
                }}
              />
              <p className="online-note">Codes look like <span className="num">A1B2C-D3E4F</span>.</p>
            </div>

            <button
              type="button"
              className="btn online-primary"
              onClick={() => void doJoin()}
              disabled={busy || joinCode.trim().length < 5}
            >
              {busy && roleRef.current === 'guest' ? (
                <>
                  <Loader2 className="spin" size={15} /> Connecting…
                </>
              ) : (
                <>
                  <LogIn size={15} /> Join game
                </>
              )}
            </button>
          </section>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Host "waiting for opponent" panel: big copyable code + honest network note.
// ---------------------------------------------------------------------------
function HostWaiting({
  code,
  copied,
  onCopy,
  onCancel
}: {
  code: string
  copied: boolean
  onCopy: () => void
  onCancel: () => void
}): JSX.Element {
  return (
    <div className="online-card online-hosting" aria-label="Waiting for an opponent">
      <div className="online-card-head">
        <Radio size={18} className="online-card-icon is-live" aria-hidden />
        <div>
          <h3>Waiting for your opponent…</h3>
          <span className="muted small">Share this code. The game starts the moment they join.</span>
        </div>
      </div>

      <button className="online-code" onClick={onCopy} title="Copy join code" aria-label={`Join code ${code}, click to copy`}>
        <span className="online-code-text num">{code}</span>
        <span className="online-code-copy">
          {copied ? <Check size={16} /> : <Copy size={16} />}
          {copied ? 'Copied' : 'Copy'}
        </span>
      </button>

      <div className="online-note-block">
        <p className="online-note">
          <Wifi size={13} aria-hidden /> On the <strong>same network</strong> (home Wi-Fi, phone hotspot),
          this works instantly.
        </p>
        <p className="online-note muted">
          Over the internet you&apos;d need to forward the port shown inside the code on your router —
          that&apos;s off by default and not needed on the same network.
        </p>
      </div>

      <div className="online-hosting-foot">
        <Loader2 className="spin" size={16} aria-hidden />
        <button className="btn ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// The live online game. Wraps GameView with online-specific chrome: a small
// online status/actions strip (draw offer/accept, resign already in GameView),
// host-authoritative clocks, and a rematch flow that survives peer-left.
// ---------------------------------------------------------------------------
interface OnlineGameProps {
  fen: string
  orientation: Color
  turn: Color
  userColor: Color
  dests: Map<Key, Key[]>
  lastMove?: [Key, Key]
  check?: Color
  over: boolean
  atTip: boolean
  pendingPromo: { orig: string; dest: string } | null
  nonce: number
  clocks: Clocks
  config: MpGameConfig | null
  banner: GameViewBanner | null
  drawOffered: boolean
  drawSent: boolean
  rematchSent: boolean
  rematchOffered: boolean
  peerLeft: boolean
  settings: ReturnType<typeof useSettings>['settings']
  tree: ReturnType<typeof useGameTree>
  onMove: (orig: Key, dest: Key) => void
  onPromo: (role: Role) => void
  onPromoCancel: () => void
  onResign: () => void
  onOfferDraw: () => void
  onRematch: () => void
  onFlip: () => void
  onLeave: () => void
}

function OnlineGame(props: OnlineGameProps): JSX.Element {
  const {
    userColor,
    clocks,
    over,
    atTip,
    turn,
    banner,
    drawOffered,
    drawSent,
    rematchSent,
    rematchOffered,
    peerLeft,
    settings,
    onOfferDraw,
    onRematch,
    onLeave
  } = props

  const opponentColor: Color = userColor === 'white' ? 'black' : 'white'
  const timed = (props.config?.tc.initialMs ?? 0) > 0
  const clockLive = timed && !over
  const opponentClock = { ms: clocks[opponentColor], active: clockLive && turn === opponentColor && atTip }
  const userClock = { ms: clocks[userColor], active: clockLive && turn === userColor && atTip }

  const opponentSub = timed ? formatClock(clocks[opponentColor]) : 'Online'

  return (
    <div className="online-game">
      {/* A slim status bar above the board carries the online-only affordances. */}
      <div className="online-statusbar">
        <span className="online-statusbar-tag">
          <Wifi size={13} aria-hidden /> Online
        </span>
        {peerLeft ? (
          <span className="online-statusbar-msg warn">Opponent disconnected.</span>
        ) : drawOffered && !over ? (
          <span className="online-statusbar-msg">Opponent offers a draw.</span>
        ) : drawSent && !over ? (
          <span className="online-statusbar-msg muted">Draw offered — waiting…</span>
        ) : (
          <span className="online-statusbar-msg muted">Fair-play mode: hints &amp; takebacks are off.</span>
        )}

        <div className="online-statusbar-actions">
          {!over && !peerLeft && (
            <button
              className={`btn ghost small${drawOffered ? ' is-accept' : ''}`}
              onClick={onOfferDraw}
              disabled={drawSent && !drawOffered}
            >
              {drawOffered ? 'Accept draw' : drawSent ? 'Draw sent' : 'Offer draw'}
            </button>
          )}
          <button className="btn ghost small" onClick={onLeave}>
            Leave
          </button>
        </div>
      </div>

      <GameView
        fen={props.fen}
        orientation={props.orientation}
        turn={props.turn}
        userColor={userColor}
        dests={props.dests}
        lastMove={props.lastMove}
        check={props.check}
        thinking={false}
        over={over}
        atTip={atTip}
        pendingPromo={props.pendingPromo}
        nonce={props.nonce}
        boardTheme={settings.boardTheme}
        pieceSetClass={pieceSetClass(settings.pieceSet)}
        showLegal={settings.showLegal}
        coordinates={settings.coordinates}
        animation={settings.animation}
        // Fair play: no hints, no takebacks online.
        hintsEnabled={false}
        allowTakebacks={false}
        canTakeback={false}
        userName={settings.username}
        userAvatar={settings.avatar}
        opponentName="Opponent"
        opponentSub={opponentSub}
        opponentPhoto={null}
        clockActive={timed}
        opponentClock={opponentClock}
        userClock={userClock}
        confirmResign={settings.confirmResign}
        tree={props.tree}
        banner={banner}
        onMove={props.onMove}
        onPromo={props.onPromo}
        onPromoCancel={props.onPromoCancel}
        onResign={props.onResign}
        // "New game" from the banner leaves the session (host/join again).
        onNewGame={onLeave}
        onFlip={props.onFlip}
        // Rematch is online-aware: offer/accept over the wire. When the peer has
        // left, hide it (handled by disabling below through onRematch no-op UI).
        onRematch={peerLeft ? undefined : onRematch}
      />

      {/* Post-game rematch status (the banner's Rematch button triggers onRematch;
          these lines report the negotiation the banner can't). */}
      {over && !peerLeft && (rematchSent || rematchOffered) && (
        <div className="online-rematch-note" role="status">
          {rematchOffered
            ? 'Opponent wants a rematch — press Rematch to accept.'
            : 'Rematch offered — waiting for your opponent…'}
        </div>
      )}
    </div>
  )
}
