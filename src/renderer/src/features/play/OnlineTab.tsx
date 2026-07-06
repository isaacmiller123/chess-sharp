// Play → Online tab. Two copies of Chess# anywhere in the world play each other
// over a direct, encrypted WebRTC peer-to-peer connection: one HOSTS (shares a
// short join code = a random room key), the other JOINS (enters the code).
// Signaling runs through public relays in the renderer — no account, no server,
// no port forwarding.
//
// v3 (MP-V3-SPEC §5): this file is a PURE VIEW over the module-level `onlineStore`
// (features/play/online/onlineStore.ts). The live game lives in that store for the
// app's whole lifetime, so navigating away and back is SAFE — unmount does NOT
// tear the session down (the L1/L2/MP-01 fix). All game state (phase, colors,
// clocks, banner, offers, peer-away, errors) is read from the store snapshot via
// useOnlineGame(); every action goes through the store singleton, which is the
// ONLY caller of mp.leave().
//
// Fair-play rules for online games (contract): assist/hints and takebacks are
// DISABLED. Clocks are HOST-AUTHORITATIVE; the store owns the snapshot and the
// Clock component ticks it locally (B2/D5).

import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react'
import type { Role } from 'chessops/types'
import type { Key } from 'chessground/types'
import {
  Copy,
  Check,
  Globe,
  Radio,
  LogIn,
  Loader2,
  AlertTriangle,
  X,
  Wifi,
  WifiOff,
  OctagonX,
  Handshake,
  Repeat
} from 'lucide-react'
import type { MpColor, MpGameConfig } from '@shared/types'
import { onlineStore } from './online/onlineStore'
import { useOnlineGame } from './online/useOnlineGame'
import { useGameTree } from '../../state/gameTree'
import { useSettings } from '../../state/settings'
import {
  applyMove,
  checkColor,
  destsFor,
  isPromotion,
  turnColor,
  uciToLastMove,
  type Color
} from '../../chess/chess'
import { pieceSetClass } from '../../board/pieceSets'
import { useSound } from '../../sound/useSound'
import { GameView } from './GameView'
import { TimeControlPicker } from './TimeControlPicker'
import { timeControlById, formatClock, type TimeControl } from './timeControl'
import './online.css'

type ColorChoice = MpColor | 'random'

/** What the host surface needs to know about this tab: nothing live ('idle'),
 *  a session is open but no game yet ('lobby'), or a game is live ('game'). Kept
 *  for SetupCard's width handoff — it is NO LONGER a nav lock (the store survives
 *  unmount, so switching tabs or views can never kill the session). */
export type OnlineStage = 'idle' | 'lobby' | 'game'

export interface OnlineTabProps {
  /** Seed for the host card's time control — the shared Play control. Untimed
   *  values fall back to 10+0 (the wire refuses initialMs < 1s). */
  initialTimeControl?: TimeControl
  /** Reflect host-card picker changes back into the shared Play control. */
  onTimeControl?: (tc: TimeControl) => void
  /** Stage reports for the host surface (game-width handoff only). */
  onStage?: (stage: OnlineStage) => void
}

/** Live remaining ms for one side, computed from the store's authoritative clock
 *  snapshot at render time. The store-owned Clock component does the smooth 100ms
 *  ticking on top of this; this coarse value keeps GameView's ClockSide contract
 *  intact and drives the active-side glow. */
function liveMs(
  clock: { snapshot: { white: number; black: number }; atMono: number; running: 'white' | 'black' | null } | null,
  side: Color
): number {
  if (!clock) return 0
  const base = clock.snapshot[side]
  if (clock.running !== side) return Math.max(0, base)
  const elapsed = performance.now() - clock.atMono
  return Math.max(0, base - elapsed)
}

export default function OnlineTab({
  initialTimeControl,
  onTimeControl,
  onStage
}: OnlineTabProps = {}): JSX.Element {
  const { settings } = useSettings()
  const state = useOnlineGame()

  // ---- setup form (local, pre-session only) --------------------------------
  // Online games must be timed (the wire refuses initialMs < 1s): seed from the
  // shared Play control when it carries a clock, else default to a friendly rapid
  // control — and forbid Unlimited at Start either way.
  const [hostTc, setHostTcState] = useState<TimeControl>(() =>
    initialTimeControl && initialTimeControl.baseMs > 0
      ? initialTimeControl
      : timeControlById('10+0')
  )
  const onTimeControlRef = useRef(onTimeControl)
  onTimeControlRef.current = onTimeControl
  const setHostTc = useCallback((tc: TimeControl) => {
    setHostTcState(tc)
    onTimeControlRef.current?.(tc)
  }, [])
  const [hostColorChoice, setHostColorChoice] = useState<ColorChoice>('white')
  const [joinCode, setJoinCode] = useState('')
  const [copied, setCopied] = useState(false)
  // Client-side form validation (empty code / unlimited TC) lives here so it's
  // not confused with a session error from the store. Cleared on any resubmit.
  const [formError, setFormError] = useState<string | null>(null)
  // Two-step Leave confirm (L10): armed only while a live undecided game is up.
  const [leaveArmed, setLeaveArmed] = useState(false)

  // Lobby buttons disable while a join/host is dialing. The store owns the
  // connection lifecycle, so "busy" is simply the connecting phase.
  const busy = state.phase === 'connecting' && !state.error

  // ---- display tree (fed from the store's move list) -----------------------
  // The store is authoritative for the live position; this local tree mirrors
  // state.moves so GameView's MoveList + history browsing keep working. It resets
  // on every new gameId and appends any moves it hasn't applied yet.
  const tree = useGameTree()
  const syncedGameIdRef = useRef<number>(-1)
  const syncedPlyRef = useRef(0)
  useEffect(() => {
    if (state.phase !== 'game') return
    if (syncedGameIdRef.current !== state.gameId) {
      tree.reset()
      syncedGameIdRef.current = state.gameId
      syncedPlyRef.current = 0
    }
    // Append any moves the tree hasn't seen. Apply against the live tip so a
    // history selection never corrupts the mainline.
    for (let i = syncedPlyRef.current; i < state.moves.length; i++) {
      let tip = tree.root
      while (tip.children[0]) tip = tip.children[0]
      const uci = state.moves[i]
      const promo = uci.length > 4 ? (ROLE_FROM_CHAR[uci[4]] as Role | undefined) : undefined
      const m = applyMove(tip.fen, uci.slice(0, 2), uci.slice(2, 4), promo)
      if (!m) break
      tree.addMove(m)
    }
    syncedPlyRef.current = state.moves.length
    // tree identity is stable across renders; keying on moves/gameId is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, state.gameId, state.moves.length])

  // ---- promotion picker (local UI state) -----------------------------------
  const [pendingPromo, setPendingPromo] = useState<{ orig: string; dest: string } | null>(null)
  const [nonce, setNonce] = useState(0)
  // A fresh game/position clears any half-finished promotion.
  useEffect(() => {
    setPendingPromo(null)
  }, [state.gameId, state.plyCount])

  // ---- stage report (width handoff; NOT a nav lock) ------------------------
  const onStageRef = useRef(onStage)
  onStageRef.current = onStage
  const stage: OnlineStage =
    state.phase === 'game' ? 'game' : state.phase === 'idle' ? 'idle' : 'lobby'
  useEffect(() => {
    onStageRef.current?.(stage)
  }, [stage])
  // Leaving THIS tab no longer tears anything down — but report 'idle' so the
  // host surface stops widening while the tab isn't shown. The session persists.
  useEffect(
    () => () => {
      onStageRef.current?.('idle')
    },
    []
  )

  // Disarm the Leave confirm whenever the game is no longer live-undecided.
  const liveUndecided = state.phase === 'game' && state.banner === null && !state.peerLeft
  useEffect(() => {
    if (!liveUndecided) setLeaveArmed(false)
  }, [liveUndecided])

  // ---- derived board data --------------------------------------------------
  const fen = tree.currentFen
  const dests = useMemo(() => destsFor(fen), [fen])
  const turn = turnColor(fen)
  const check = checkColor(fen)
  const lastMove = tree.current.move ? uciToLastMove(tree.current.move.uci) : undefined
  const atTip = tree.current.children.length === 0
  const over = state.banner !== null

  // ---- local move → store (optimistic apply + rollback lives in the store) --
  const commit = useCallback(
    (orig: string, dest: string, promotion?: Role) => {
      // Only the side to move at the live tip may move, and only when it's us and
      // the game is live. peerAway/over are blocked by the store too, but we gate
      // here for immediate feedback (fair-play: no history-position moves).
      if (over || !atTip || state.peerAway || turn !== state.myColor) {
        setNonce((n) => n + 1)
        return
      }
      const promoChar = promotion ? PROMO_CHAR[promotion] : ''
      const uci = `${orig}${dest}${promoChar}`
      // Validate locally so an illegal drag just snaps back (no store churn).
      const m = applyMove(fen, orig, dest, promotion)
      if (!m) {
        setNonce((n) => n + 1)
        return
      }
      onlineStore.playMove(uci)
    },
    [over, atTip, state.peerAway, turn, state.myColor, fen]
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
  const doHost = useCallback(() => {
    if (hostTc.baseMs <= 0) {
      setFormError('Online games need a clock — pick a time control (Unlimited is not supported online).')
      return
    }
    setFormError(null)
    const cfg: MpGameConfig = {
      tc: { initialMs: hostTc.baseMs, incrementMs: hostTc.incMs },
      hostColor: hostColorChoice
    }
    onlineStore.host(cfg)
  }, [hostTc, hostColorChoice])

  const doJoin = useCallback(() => {
    const trimmed = joinCode.trim()
    if (trimmed.length < 5) {
      setFormError('Enter the full join code your opponent shared.')
      return
    }
    setFormError(null)
    onlineStore.join(trimmed)
  }, [joinCode])

  // ---- leave / teardown ----------------------------------------------------
  // The ONLY leave paths: an explicit user command. Post-banner it's immediate;
  // mid-game (live + undecided) it goes through the two-step confirm (L10) whose
  // "Resign & leave" resigns first so the opponent gets a clean result.
  const requestLeave = useCallback(() => {
    if (liveUndecided) setLeaveArmed(true)
    else onlineStore.leave()
  }, [liveUndecided])
  const confirmResignLeave = useCallback(() => {
    setLeaveArmed(false)
    onlineStore.resign()
    onlineStore.leave()
  }, [])
  const cancelLeave = useCallback(() => setLeaveArmed(false), [])

  const copyCode = useCallback(() => {
    if (!state.code) return
    void navigator.clipboard?.writeText(state.code).then(
      () => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1600)
      },
      () => {}
    )
  }, [state.code])

  // ==========================================================================
  // RENDER
  // ==========================================================================
  if (state.phase === 'game') {
    return (
      <OnlineGame
        state={state}
        fen={fen}
        turn={turn}
        dests={dests}
        lastMove={lastMove}
        check={check}
        atTip={atTip}
        over={over}
        pendingPromo={pendingPromo}
        nonce={nonce}
        settings={settings}
        tree={tree}
        leaveArmed={leaveArmed}
        onMove={onMove}
        onPromo={onPromo}
        onPromoCancel={onPromoCancel}
        onLeaveRequest={requestLeave}
        onConfirmResignLeave={confirmResignLeave}
        onCancelLeave={cancelLeave}
      />
    )
  }

  // ---- setup / lobby -------------------------------------------------------
  return (
    <div className="online-lobby">
      <header className="online-lobby-head">
        <h2>Play online</h2>
        <p className="muted">
          One of you hosts and shares a code; the other joins — from anywhere in the world. No account,
          no setup.
        </p>
      </header>

      {(formError || state.error) && (
        <div className="online-error" role="alert">
          <AlertTriangle size={15} aria-hidden />
          <span>{formError || state.error}</span>
          <button
            className="icon-btn online-error-x"
            onClick={() => {
              setFormError(null)
              onlineStore.dismissError()
            }}
            aria-label="Dismiss"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {state.phase === 'hosting' && state.code ? (
        <HostWaiting
          code={state.code}
          copied={copied}
          onCopy={copyCode}
          onCancel={() => onlineStore.leave()}
          relays={state.relays}
        />
      ) : state.phase === 'connecting' ? (
        <div className="online-card online-connecting">
          <Loader2 className="spin" size={22} aria-hidden />
          <span>{guestStatusText(state.netStage)}</span>
          <button className="btn ghost" onClick={() => onlineStore.leave()}>
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
              onClick={doHost}
              disabled={busy || hostTc.baseMs <= 0}
            >
              <Radio size={15} /> Start &amp; get code
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
                  if (e.key === 'Enter') doJoin()
                }}
              />
              <p className="online-note">Codes look like <span className="num">A1B2C-D3E4F</span>.</p>
            </div>

            <button
              type="button"
              className="btn online-primary"
              onClick={doJoin}
              disabled={busy || joinCode.trim().length < 5}
            >
              <LogIn size={15} /> Join game
            </button>
          </section>
        </div>
      )}
    </div>
  )
}

const ROLE_FROM_CHAR: Record<string, Role> = { q: 'queen', r: 'rook', b: 'bishop', n: 'knight' }
const PROMO_CHAR: Record<Role, string> = {
  queen: 'q',
  rook: 'r',
  bishop: 'b',
  knight: 'n',
  king: '',
  pawn: ''
}

/** Guest-side staged status copy, driven by the store's netStage as we go from
 *  contacting relays → discovering the peer → the direct WebRTC handshake. */
function guestStatusText(stage: 'relays' | 'searching' | 'connecting' | null): string {
  switch (stage) {
    case 'searching':
      return 'Looking for your opponent…'
    case 'connecting':
      return 'Found them — connecting directly…'
    case 'relays':
    default:
      return 'Contacting matchmaking relays…'
  }
}

// ---------------------------------------------------------------------------
// Host "waiting for opponent" panel: big copyable code, a live relay-connection
// status line, and a plain note that the connection is direct + encrypted.
// ---------------------------------------------------------------------------
function HostWaiting({
  code,
  copied,
  onCopy,
  onCancel,
  relays
}: {
  code: string
  copied: boolean
  onCopy: () => void
  onCancel: () => void
  relays: { connected: number; total: number } | null
}): JSX.Element {
  const online = (relays?.connected ?? 0) > 0
  const relayTitle = relays
    ? `${relays.connected} of ${relays.total} matchmaking relays connected`
    : 'Connecting to matchmaking relays'

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

      <div className="online-net" role="status" title={relayTitle}>
        <span className={`online-net-dot${online ? ' is-online' : ''}`} aria-hidden />
        <span className="online-net-text">
          {online ? 'Online — waiting for your opponent' : 'Contacting matchmaking relays…'}
        </span>
      </div>

      <div className="online-note-block">
        <p className="online-note">
          <Globe size={13} aria-hidden /> This is a <strong>direct, encrypted peer-to-peer</strong> connection.
          Share the code any way you like — text, Discord, anything.
        </p>
      </div>

      <div className="online-hosting-foot">
        <button className="btn ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// The live online game. Wraps GameView with online-specific chrome, all driven
// by the store snapshot: a status/actions strip (draw offer/accept/decline,
// abort, resign-via-leave), a peer-away countdown strip, a symmetric rematch
// strip, and a Leave confirm. Host-authoritative clocks come from the store.
// ---------------------------------------------------------------------------
interface OnlineGameProps {
  state: ReturnType<typeof useOnlineGame>
  fen: string
  turn: Color
  dests: Map<Key, Key[]>
  lastMove?: [Key, Key]
  check?: Color
  atTip: boolean
  over: boolean
  pendingPromo: { orig: string; dest: string } | null
  nonce: number
  settings: ReturnType<typeof useSettings>['settings']
  tree: ReturnType<typeof useGameTree>
  leaveArmed: boolean
  onMove: (orig: Key, dest: Key) => void
  onPromo: (role: Role) => void
  onPromoCancel: () => void
  onLeaveRequest: () => void
  onConfirmResignLeave: () => void
  onCancelLeave: () => void
}

function OnlineGame({
  state,
  fen,
  turn,
  dests,
  lastMove,
  check,
  atTip,
  over,
  pendingPromo,
  nonce,
  settings,
  tree,
  leaveArmed,
  onMove,
  onPromo,
  onPromoCancel,
  onLeaveRequest,
  onConfirmResignLeave,
  onCancelLeave
}: OnlineGameProps): JSX.Element {
  const userColor = state.myColor
  const opponentColor: Color = userColor === 'white' ? 'black' : 'white'
  const opponentName = state.opponentName || 'Opponent'

  // One-shot low-time cue for OUR OWN clock (lichess behavior): the Clock's
  // interp path fires it at the per-control emergency threshold; the live
  // setting gates it here (mirrors PlayView's onLowTime).
  const { play } = useSound()
  const onLowTime = useCallback(() => {
    if (settings.lowTimeWarning) play('lowTime')
  }, [play, settings.lowTimeWarning])

  const timed = (state.config?.tc.initialMs ?? 0) > 0
  const baseMs = state.config?.tc.initialMs ?? 0
  const clockLive = timed && !over && !state.peerAway
  // Live remaining ms from the store snapshot; `interp` hands the Clock the
  // authoritative snapshot so it self-ticks at 100ms (B2/D5/MP-02) — the coarse
  // ms value keeps GameView's ClockSide contract and drives the active glow.
  const opponentClock = {
    ms: liveMs(state.clock, opponentColor),
    active: clockLive && turn === opponentColor && atTip,
    interp: state.clock ? { ...state.clock, side: opponentColor, baseMs } : undefined
  }
  const userClock = {
    ms: liveMs(state.clock, userColor),
    active: clockLive && turn === userColor && atTip,
    interp: state.clock ? { ...state.clock, side: userColor, baseMs } : undefined,
    onLowTime
  }
  const opponentSub = timed ? formatClock(opponentClock.ms) : 'Online'

  // Input is disabled while the peer is away (fair-play + no moves into a frozen
  // authority) and, obviously, once the game is over.
  const inputFrozen = over || !!state.peerAway || state.peerLeft

  // Draw cooldown: the store exposes drawBlockedUntilPly; a tooltip explains the
  // disabled Offer-draw button. Offers before ply 2 are also blocked.
  const drawCoolingDown = state.plyCount < state.drawBlockedUntilPly || state.plyCount < 2
  const drawCooldownTip = drawCoolingDown
    ? state.plyCount < 2
      ? 'Draw offers open after the first moves.'
      : 'Please wait before offering another draw.'
    : undefined

  return (
    <div className="online-game">
      {/* Slim status strip above the board: online tag, a live status message
          (in-game errors are surfaced here — never silent, L12), and the
          in-game actions (draw offer/accept/decline, abort, leave). */}
      <div className="online-statusbar">
        <span className="online-statusbar-tag">
          <Globe size={13} aria-hidden /> Online
        </span>

        {state.error ? (
          <span className="online-statusbar-msg warn">{state.error}</span>
        ) : state.drawOffered && !over ? (
          <span className="online-statusbar-msg">{opponentName} offers a draw.</span>
        ) : state.drawSent && !over ? (
          <span className="online-statusbar-msg muted">Draw offered — waiting…</span>
        ) : (
          <span className="online-statusbar-msg muted">Fair-play mode: hints &amp; takebacks are off.</span>
        )}

        <div className="online-statusbar-actions">
          {/* Incoming draw offer → Accept / Decline pair. */}
          {!over && state.drawOffered && !state.peerLeft && (
            <>
              <button
                className="btn ghost small is-accept"
                onClick={() => onlineStore.acceptDraw()}
              >
                <Handshake size={14} /> Accept draw
              </button>
              <button className="btn ghost small" onClick={() => onlineStore.declineDraw()}>
                Decline
              </button>
            </>
          )}
          {/* Offer draw (hidden while an incoming offer is pending). */}
          {!over && !state.drawOffered && !state.peerLeft && (
            <button
              className="btn ghost small"
              onClick={() => onlineStore.offerDraw()}
              disabled={state.drawSent || drawCoolingDown}
              title={drawCooldownTip}
            >
              {state.drawSent ? 'Draw sent' : 'Offer draw'}
            </button>
          )}
          {/* Abort while abortable (plyCount < 2): either side may abort. */}
          {!over && state.canAbort && !state.peerLeft && (
            <button className="btn ghost small" onClick={() => onlineStore.abort()} title="Abort — no result recorded">
              <OctagonX size={14} /> Abort
            </button>
          )}
          <button className="btn ghost small" onClick={onLeaveRequest}>
            Leave
          </button>
        </div>
      </div>

      {/* Peer-away countdown strip (MP-06): live "Ns to reconnect", then Claim
          victory / Abort once the grace expires. Reconnect swaps to peer-back. */}
      {state.peerAway && !state.peerLeft && (
        <PeerAwayStrip name={opponentName} deadlineMono={state.peerAway.deadlineMono} />
      )}
      {state.peerLeft && !over && (
        <div className="online-away-strip is-expired" role="status">
          <span className="online-away-msg">
            <WifiOff size={14} aria-hidden /> {opponentName} left the game.
          </span>
          <div className="online-away-actions">
            <button className="btn small" onClick={() => onlineStore.claimVictory()}>
              Claim victory
            </button>
            <button className="btn ghost small" onClick={() => onlineStore.abort()}>
              Abort game
            </button>
          </div>
        </div>
      )}

      <GameView
        fen={fen}
        orientation={state.orientation}
        turn={turn}
        userColor={userColor}
        dests={dests}
        lastMove={lastMove}
        check={check}
        thinking={false}
        over={over}
        atTip={atTip}
        pendingPromo={pendingPromo}
        nonce={nonce}
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
        opponentName={opponentName}
        opponentSub={opponentSub}
        opponentPhoto={null}
        clockActive={timed}
        opponentClock={opponentClock}
        userClock={userClock}
        confirmResign={settings.confirmResign}
        tree={tree}
        banner={state.banner}
        onMove={onMove}
        onPromo={onPromo}
        onPromoCancel={onPromoCancel}
        onResign={() => onlineStore.resign()}
        // Online seams: no local-play "New game" mid-game (Leave is the exit,
        // with its own confirm); input frozen while the peer is away/left.
        onlineLive
        inputFrozen={inputFrozen}
        // Board input is disabled while the peer is away (fair-play + frozen clock).
        // Post-banner the banner's New game / Rematch drive the store.
        onNewGame={() => onlineStore.leave()}
        onFlip={() => onlineStore.flip()}
        // Rematch is a symmetric offer; the banner button just sends the offer.
        onRematch={state.peerLeft ? undefined : () => onlineStore.offerRematch()}
      />

      {/* Symmetric rematch strip (MP-07): sent → "waiting" + Cancel; incoming →
          Accept / Decline. Only after the game is over and the peer is present. */}
      {over && !state.peerLeft && (
        <RematchStrip
          name={opponentName}
          sent={state.rematchSent}
          offered={state.rematchOffered}
        />
      )}

      {/* Leave confirm (L10) — only reachable while a live undecided game is up. */}
      {leaveArmed && (
        <div className="online-leave-confirm" role="alertdialog" aria-label="Leave the game?">
          <div className="online-leave-card">
            <h3>Leave the game?</h3>
            <p className="muted">Leaving forfeits the game — your opponent wins by resignation.</p>
            <div className="online-leave-actions">
              <button className="btn danger" onClick={onConfirmResignLeave}>
                Resign &amp; leave
              </button>
              <button className="btn ghost" onClick={onCancelLeave}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Peer-away countdown: a self-ticking "Ns to reconnect" line. On expiry the
// store flips peerLeft (the parent then renders the Claim victory / Abort row),
// so this component only owns the pre-expiry countdown display.
// ---------------------------------------------------------------------------
function PeerAwayStrip({ name, deadlineMono }: { name: string; deadlineMono: number }): JSX.Element {
  const [remaining, setRemaining] = useState(() => Math.max(0, deadlineMono - performance.now()))
  useEffect(() => {
    const tick = (): void => setRemaining(Math.max(0, deadlineMono - performance.now()))
    tick()
    const id = window.setInterval(tick, 250)
    return () => window.clearInterval(id)
  }, [deadlineMono])
  const secs = Math.ceil(remaining / 1000)
  return (
    <div className="online-away-strip" role="status">
      <span className="online-away-msg">
        <Wifi size={14} className="online-away-spin" aria-hidden /> {name} disconnected — {secs}s to
        reconnect…
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Symmetric rematch strip. The banner's Rematch button sends the offer; this
// strip reports the negotiation the banner can't: sent → waiting + Cancel,
// incoming → Accept / Decline.
// ---------------------------------------------------------------------------
function RematchStrip({
  name,
  sent,
  offered
}: {
  name: string
  sent: boolean
  offered: boolean
}): JSX.Element | null {
  if (offered) {
    return (
      <div className="online-rematch-strip" role="status">
        <span className="online-rematch-msg">
          <Repeat size={14} aria-hidden /> {name} wants a rematch.
        </span>
        <div className="online-rematch-actions">
          <button className="btn small" onClick={() => onlineStore.offerRematch()}>
            Accept
          </button>
          <button className="btn ghost small" onClick={() => onlineStore.declineRematch()}>
            Decline
          </button>
        </div>
      </div>
    )
  }
  if (sent) {
    return (
      <div className="online-rematch-strip" role="status">
        <span className="online-rematch-msg muted">Rematch offered — waiting for {name}…</span>
        <div className="online-rematch-actions">
          <button className="btn ghost small" onClick={() => onlineStore.declineRematch()}>
            Cancel
          </button>
        </div>
      </div>
    )
  }
  return null
}
