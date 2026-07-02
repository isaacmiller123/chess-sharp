// MpNetSession — the one object that owns an internet game, host or guest side.
// PURE session/authority logic: it imports ONLY the isomorphic wire protocol and
// the shared types. NO trystero, NO electron, NO node — so it bundles standalone
// into the renderer and runs unchanged under bare node for tests. The actual
// signaling + WebRTC lives behind an injected MpTransport (see rtcTransport.ts).
//
// Roles & authority (ported verbatim-in-spirit from the old main-process session.ts)
//   HOST  — creates the room; the join code IS the room key. The host is
//           AUTHORITATIVE: it owns the clocks (per-move timestamps, increment
//           credit, flag on zero), validates turn alternation, and relays the
//           guest's moves. It accepts the FIRST peer that appears; any extra peer
//           gets a targeted 'host is busy' error and is otherwise ignored.
//   GUEST — joins the room by code and simply renders what the host tells it. It
//           never runs a clock of its own. If no host answers within 30s, it
//           gives up with a friendly error.
//
// Perspective: every MpEvent is emitted from the RECEIVER's point of view
//   (`yourColor` is this client's color; `resign.by` is who resigned).
//
// Failure policy: nothing here throws to the caller. host()/join() resolve; every
//   other failure — bad code, no host, version mismatch, peer gone, malformed
//   traffic, illegal/out-of-turn move — surfaces as an MpEvent and tears down.

import type { MpEvent, MpGameConfig, MpColor } from '@shared/types'
import {
  type WireMsg,
  parseWireMsg,
  encodeWireMsg,
  makeHello,
  PROTOCOL_VERSION,
  generateRoomCode,
  normalizeRoomCode
} from '@shared/mp/wire'

export type MpRole = 'host' | 'guest'

// ---- Injected transport contract (implemented by rtcTransport.ts) -------------

export interface MpTransportListeners {
  onMessage(text: string, fromPeer: string): void
  onPeerJoin(peerId: string): void
  onPeerLeave(peerId: string): void
  /** Optional relay-connectivity ticks: how many signaling relays are open. */
  onRelayStatus?(connected: number, total: number): void
}

export interface MpTransport {
  /** Send wire text to a specific peer, or broadcast to the room if omitted. */
  send(text: string, toPeer?: string): void
  close(): void
}

export type MpTransportFactory = (
  roomCode: string,
  listeners: MpTransportListeners
) => MpTransport | Promise<MpTransport>

// ---- Timing constants ---------------------------------------------------------

/** How long the guest waits to discover the host before giving up (ms). */
const DISCOVERY_TIMEOUT_MS = 30_000
/** Heartbeat cadence: ping this often once handshaken; a peer silent for
 *  ~2.5 intervals is considered gone. */
const HEARTBEAT_MS = 5_000
const HEARTBEAT_TIMEOUT_MS = 13_000

/** The friendly message shown when nobody is hosting the entered code. */
const NO_HOST_MESSAGE =
  "Nobody's hosting with that code right now. Double-check it, and make sure " +
  'your opponent still has their game open.'

type Clocks = { white: number; black: number }

export class MpNetSession {
  private readonly makeTransport: MpTransportFactory
  private transport: MpTransport | null = null

  private role: MpRole | null = null
  private config: MpGameConfig | null = null
  /** This client's own color, resolved at start. */
  private myColor: MpColor | null = null

  /** The single bonded peer id (host: the accepted guest; guest: the host). */
  private peerId: string | null = null
  /** True once the peer's hello has been validated (both sides). */
  private handshaked = false

  // ---- host-only authoritative game state ------------------------------------
  /** Which color the GUEST plays (host color is the opposite). */
  private guestColor: MpColor | null = null
  /** Authoritative remaining time per side (host only). */
  private clocks: Clocks = { white: 0, black: 0 }
  /** Whose move it is right now (host only). null before start / after game end. */
  private toMove: MpColor | null = null
  /** timestamp (ms) when the side-to-move's clock started ticking. */
  private turnStartedAt = 0
  /** Flag-fall watchdog for the side currently on move (host only). */
  private flagTimer: ReturnType<typeof setTimeout> | null = null
  /** True once the game is decided — further clock math and relays are suppressed. */
  private gameOver = false

  // ---- draw-offer bookkeeping (both sides) -----------------------------------
  private incomingDrawOffer = false
  private outgoingDrawOffer = false

  // ---- heartbeat + discovery timers ------------------------------------------
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private discoveryTimer: ReturnType<typeof setTimeout> | null = null
  private lastPeerMsgAt = 0

  // ---- event fan-out ----------------------------------------------------------
  private listeners = new Set<(ev: MpEvent) => void>()

  constructor(makeTransport: MpTransportFactory) {
    this.makeTransport = makeTransport
  }

  /** Subscribe to session events; returns the unsubscriber. */
  onEvent(cb: (ev: MpEvent) => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  private emitEvent(ev: MpEvent): void {
    for (const cb of this.listeners) cb(ev)
  }

  // ============================================================================
  // HOST
  // ============================================================================

  /** Create the room; resolves with the join code as soon as the transport is up.
   *  The host then waits indefinitely for a guest. */
  async host(cfg: MpGameConfig): Promise<{ code: string }> {
    this.resetState()
    this.role = 'host'
    this.config = cfg
    const code = generateRoomCode()
    this.transport = await this.makeTransport(code, this.transportListeners())
    return { code }
  }

  // ============================================================================
  // GUEST
  // ============================================================================

  /** Join a room by code. Resolves {ok:true} once the transport is up (bad codes
   *  resolve {ok:false} without creating one); never rejects. A missing host
   *  surfaces later as an 'error' event via the discovery timeout. */
  async join(code: string): Promise<{ ok: boolean; error?: string }> {
    const normalized = normalizeRoomCode(code)
    if (!normalized) {
      return { ok: false, error: 'That code is not valid. Double-check the characters.' }
    }
    this.resetState()
    this.role = 'guest'
    this.transport = await this.makeTransport(normalized, this.transportListeners())
    // We're contacting relays; the transport reports counts as they connect.
    this.emitEvent({ type: 'net', state: 'relays' })
    // Give up if no host answers within the discovery window.
    this.discoveryTimer = setTimeout(() => {
      this.fail(NO_HOST_MESSAGE)
    }, DISCOVERY_TIMEOUT_MS)
    return { ok: true }
  }

  // ============================================================================
  // Outbound actions (called by the UI on behalf of the local player)
  // ============================================================================

  /** Send OUR move to the peer. On the host this is authoritative (updates clocks
   *  and relays); on the guest it's a request the host will time and relay back. */
  async sendMove(uci: string): Promise<{ ok: boolean }> {
    if (!this.peerId || this.gameOver) return { ok: false }
    // A move answers any pending draw exchange (offer withdrawn / declined).
    this.incomingDrawOffer = false
    this.outgoingDrawOffer = false

    if (this.role === 'host') {
      // We're the authority: apply our own move to the clocks and relay it.
      if (!this.myColor || this.toMove !== this.myColor) return { ok: false } // not our turn
      const clocks = this.commitMove(this.myColor)
      if (!clocks) return { ok: false } // flagged during commit — handled inside
      this.sendWire({ t: 'move', uci, clockMs: clocks })
      return { ok: true }
    }

    // Guest: hand the move to the host. clockMs is a courtesy hint the host
    // ignores (it recomputes authoritatively); send our current view of it.
    this.sendWire({ t: 'move', uci, clockMs: { ...this.clocks } })
    return { ok: true }
  }

  async resign(): Promise<{ ok: boolean }> {
    if (!this.peerId || this.gameOver || !this.myColor) return { ok: false }
    this.endGame()
    this.sendWire({ t: 'resign', by: this.myColor })
    this.emitEvent({ type: 'resign', by: this.myColor })
    return { ok: true }
  }

  async offerDraw(): Promise<{ ok: boolean }> {
    if (!this.peerId || this.gameOver) return { ok: false }
    // If the peer already offered, offering back = accepting.
    if (this.incomingDrawOffer) return this.acceptDraw()
    // Idempotent: a second offer while one is outstanding is a no-op (still ok).
    if (this.outgoingDrawOffer) return { ok: true }
    this.outgoingDrawOffer = true
    this.sendWire({ t: 'drawOffer' })
    return { ok: true }
  }

  async acceptDraw(): Promise<{ ok: boolean }> {
    if (!this.peerId || this.gameOver || !this.incomingDrawOffer) return { ok: false }
    this.incomingDrawOffer = false
    this.endGame()
    this.sendWire({ t: 'drawAccept' })
    this.emitEvent({ type: 'drawAccept' })
    return { ok: true }
  }

  async offerRematch(): Promise<{ ok: boolean }> {
    if (!this.peerId) return { ok: false }
    if (this.role === 'host') {
      // Host is authoritative on colors: swap sides and start a fresh game for
      // both. (A guest "offer" is a request the host's UI turns into this call.)
      this.startRematchAsHost()
      return { ok: true }
    }
    // Guest asks; host answers with 'rematchStart'.
    this.sendWire({ t: 'rematchOffer' })
    return { ok: true }
  }

  /** Tear everything down. Idempotent; safe before host()/join(). Sends a polite
   *  'bye' first when connected so the peer gets a clean 'peer-left'. */
  leave(): void {
    if (this.peerId) {
      // Best-effort goodbye; the transport swallows a send after close.
      this.sendWire({ t: 'bye' })
    }
    this.teardownTransport()
    this.resetState()
    this.listeners.clear()
  }

  // ============================================================================
  // Transport wiring
  // ============================================================================

  private transportListeners(): MpTransportListeners {
    return {
      onMessage: (text, fromPeer) => this.onRaw(text, fromPeer),
      onPeerJoin: (id) => this.onPeerJoin(id),
      onPeerLeave: (id) => this.onPeerLeave(id),
      onRelayStatus: (connected, total) => {
        this.emitEvent({ type: 'net', state: 'relays', relays: { connected, total } })
        // Guest: once at least one relay is open we're actively searching for the
        // host. (Harmless if emitted repeatedly; the UI just shows "searching".)
        if (this.role === 'guest' && !this.peerId && connected > 0) {
          this.emitEvent({ type: 'net', state: 'searching' })
        }
      }
    }
  }

  /** A peer appeared in the room. Bond to the first; refuse the rest. */
  private onPeerJoin(id: string): void {
    if (this.peerId) {
      // Already have our one opponent — politely refuse extras (targeted).
      if (this.role === 'host') {
        this.transport?.send(encodeWireMsg({ t: 'error', message: 'host is busy' }), id)
      }
      return
    }
    this.peerId = id
    this.lastPeerMsgAt = Date.now()
    // Peer found: the hello handshake / WebRTC is now in flight.
    if (this.role === 'guest') this.emitEvent({ type: 'net', state: 'connecting' })
    // Both sides greet immediately; the game starts once the peer's hello lands.
    this.sendWire(makeHello())
  }

  /** A peer left the room. Only the bonded peer matters. */
  private onPeerLeave(id: string): void {
    if (id !== this.peerId) return
    this.onPeerGone()
  }

  private sendWire(msg: WireMsg): void {
    if (!this.transport || !this.peerId) return
    this.transport.send(encodeWireMsg(msg), this.peerId)
  }

  // ============================================================================
  // Inbound: translate one wire message into events / drive host authority
  // ============================================================================

  protected onRaw(text: string, fromPeer: string): void {
    // Ignore chatter from any peer that isn't our bonded opponent.
    if (this.peerId && fromPeer !== this.peerId) return
    const msg: WireMsg | null = parseWireMsg(text)
    if (!msg) {
      this.emitEvent({ type: 'error', message: 'malformed message from peer' })
      return
    }
    // Any traffic from the peer counts as liveness.
    this.lastPeerMsgAt = Date.now()

    switch (msg.t) {
      case 'hello':
        this.onHello(msg.v)
        return
      case 'start':
        this.onStart(msg.yourColor, msg.config)
        return
      case 'move':
        this.onWireMove(msg.uci, msg.clockMs)
        return
      case 'drawOffer':
        this.incomingDrawOffer = true
        this.emitEvent({ type: 'drawOffer' })
        return
      case 'drawAccept':
        // Peer accepted OUR offer — game drawn.
        this.outgoingDrawOffer = false
        this.endGame()
        this.emitEvent({ type: 'drawAccept' })
        return
      case 'resign':
        this.endGame()
        this.emitEvent({ type: 'resign', by: msg.by })
        return
      case 'rematchOffer':
        // Host receives a guest's rematch request; surface it so the host UI can
        // decide. (The host commits the rematch via offerRematch().)
        this.emitEvent({ type: 'rematchOffer' })
        return
      case 'rematchStart':
        // Guest side: host started a rematch; adopt the (swapped) color.
        this.onRematchStart(msg.yourColor)
        return
      case 'bye':
        this.onPeerGone()
        return
      case 'ping':
        // Answer heartbeats immediately.
        this.sendWire({ t: 'pong' })
        return
      case 'pong':
        // Liveness already recorded above; nothing more to do.
        return
      case 'error':
        this.emitEvent({ type: 'error', message: msg.message })
        return
    }
  }

  private onHello(peerVersion: number): void {
    if (this.handshaked) return // ignore a duplicate hello
    if (peerVersion !== PROTOCOL_VERSION) {
      // Version mismatch: tell the peer, tell our UI, and drop.
      this.sendWire({
        t: 'error',
        message: `version mismatch (host expects v${PROTOCOL_VERSION})`
      })
      this.fail(
        `The other player is running an incompatible version (protocol v${peerVersion} vs v${PROTOCOL_VERSION}).`
      )
      return
    }
    // Handshake good — stop the discovery clock and start heartbeating.
    this.handshaked = true
    this.clearDiscoveryTimer()
    this.startHeartbeat()
    if (this.role === 'host') {
      // Host resolves colors now and starts the game for both sides.
      this.startGameAsHost()
    }
    // Guest waits for the host's 'start'.
  }

  // ---- host: game start / clocks ---------------------------------------------

  private resolveColors(): { hostColor: MpColor; guestColor: MpColor } {
    const choice = this.config?.hostColor ?? 'white'
    const hostColor: MpColor =
      choice === 'random' ? (Math.random() < 0.5 ? 'white' : 'black') : choice
    const guestColor: MpColor = hostColor === 'white' ? 'black' : 'white'
    return { hostColor, guestColor }
  }

  private startGameAsHost(): void {
    if (!this.config) return
    const { hostColor, guestColor } = this.resolveColors()
    this.myColor = hostColor
    this.guestColor = guestColor
    this.initClocks()
    // Tell the guest their color + config; emit our own peer-joined + start.
    this.sendWire({ t: 'start', yourColor: guestColor, config: this.config })
    this.emitEvent({ type: 'peer-joined' })
    this.emitEvent({ type: 'start', yourColor: hostColor, config: this.config })
  }

  private initClocks(): void {
    const initial = this.config?.tc.initialMs ?? 0
    this.clocks = { white: initial, black: initial }
    this.gameOver = false
    this.incomingDrawOffer = false
    this.outgoingDrawOffer = false
    // White always moves first; its clock starts now (only meaningful when timed).
    this.toMove = 'white'
    this.turnStartedAt = Date.now()
    this.armFlagTimer()
  }

  /** Whether this game runs a clock at all (initialMs 0 ⇒ untimed/unlimited). */
  private get timed(): boolean {
    return (this.config?.tc.initialMs ?? 0) > 0
  }

  /** Debit the moving side's elapsed time, credit its increment, flip the turn.
   *  Returns the fresh authoritative clocks, or null if that side just flagged
   *  (in which case the game is ended and a resign-by-flag is emitted/relayed). */
  private commitMove(mover: MpColor): Clocks | null {
    if (!this.timed) {
      // Untimed: no debit, just flip whose move it is (turn-order authority).
      this.toMove = mover === 'white' ? 'black' : 'white'
      return { ...this.clocks }
    }
    const now = Date.now()
    const elapsed = Math.max(0, now - this.turnStartedAt)
    const remaining = this.clocks[mover] - elapsed
    if (remaining <= 0) {
      // Flag fall on the mover's own clock — they lose on time.
      this.clocks[mover] = 0
      this.flagLoss(mover)
      return null
    }
    const inc = this.config?.tc.incrementMs ?? 0
    this.clocks[mover] = remaining + inc
    // Flip the turn; the other side's clock now starts ticking.
    this.toMove = mover === 'white' ? 'black' : 'white'
    this.turnStartedAt = now
    this.armFlagTimer()
    return { ...this.clocks }
  }

  /** Arm a watchdog that fires exactly when the side-to-move would flag, so a
   *  player who simply stops moving still loses on time (host authority). */
  private armFlagTimer(): void {
    this.clearFlagTimer()
    if (!this.timed || this.gameOver || !this.toMove) return
    const side = this.toMove
    const budget = this.clocks[side]
    this.flagTimer = setTimeout(() => {
      if (this.gameOver || this.toMove !== side) return
      this.clocks[side] = 0
      this.flagLoss(side)
    }, Math.max(0, budget))
  }

  private clearFlagTimer(): void {
    if (this.flagTimer) {
      clearTimeout(this.flagTimer)
      this.flagTimer = null
    }
  }

  /** The side `loser` ran out of time. Model it as a resignation by that side
   *  (the contract has no distinct 'timeout' event; `by` is who lost). */
  private flagLoss(loser: MpColor): void {
    if (this.gameOver) return
    this.endGame()
    this.sendWire({ t: 'resign', by: loser })
    this.emitEvent({ type: 'resign', by: loser })
  }

  /** Mark the game decided and stop the clock watchdog. */
  private endGame(): void {
    this.gameOver = true
    this.toMove = null
    this.clearFlagTimer()
  }

  // ---- move relay -------------------------------------------------------------

  /** A 'move' wire message arrived. Host: it's the guest's move — time it and
   *  relay the authoritative clocks. Guest: it's the host's authoritative move —
   *  render it. */
  private onWireMove(uci: string, clockMs: Clocks): void {
    if (this.gameOver) return
    if (this.role === 'host') {
      // The guest moved. Enforce turn order; ignore their clock hint entirely.
      if (this.toMove !== this.guestColor) {
        // Out-of-turn / duplicate — drop it (don't corrupt authoritative state).
        return
      }
      const authoritative = this.commitMove(this.guestColor as MpColor)
      if (!authoritative) return // guest flagged; flagLoss already fired
      // Surface the guest's move to the HOST renderer with authoritative clocks.
      this.emitEvent({ type: 'move', uci, clockMs: authoritative })
    } else {
      // Guest: trust the host's clocks verbatim and mirror them locally so our
      // own next move's courtesy hint is sane.
      this.clocks = { ...clockMs }
      this.emitEvent({ type: 'move', uci, clockMs })
    }
  }

  private onStart(yourColor: MpColor, config: MpGameConfig): void {
    // Guest adopts its color + the game config; clocks arrive via move events.
    this.config = config
    this.myColor = yourColor
    this.clocks = { white: config.tc.initialMs, black: config.tc.initialMs }
    this.gameOver = false
    this.incomingDrawOffer = false
    this.outgoingDrawOffer = false
    this.emitEvent({ type: 'start', yourColor, config })
  }

  // ---- rematch ----------------------------------------------------------------

  private startRematchAsHost(): void {
    if (!this.config || !this.myColor || !this.guestColor) return
    // Swap colors; keep the same time control.
    const newHostColor: MpColor = this.myColor === 'white' ? 'black' : 'white'
    const newGuestColor: MpColor = newHostColor === 'white' ? 'black' : 'white'
    this.myColor = newHostColor
    this.guestColor = newGuestColor
    this.initClocks()
    this.sendWire({ t: 'rematchStart', yourColor: newGuestColor })
    this.emitEvent({ type: 'rematchStart', yourColor: newHostColor })
  }

  private onRematchStart(yourColor: MpColor): void {
    if (!this.config) return
    this.myColor = yourColor
    this.clocks = { white: this.config.tc.initialMs, black: this.config.tc.initialMs }
    this.gameOver = false
    this.incomingDrawOffer = false
    this.outgoingDrawOffer = false
    this.emitEvent({ type: 'rematchStart', yourColor })
  }

  // ============================================================================
  // Heartbeat + teardown
  // ============================================================================

  private startHeartbeat(): void {
    this.stopHeartbeat()
    this.lastPeerMsgAt = Date.now()
    this.heartbeatTimer = setInterval(() => {
      if (!this.peerId) return
      if (Date.now() - this.lastPeerMsgAt > HEARTBEAT_TIMEOUT_MS) {
        // Peer went silent — treat as a disconnect (same as onPeerLeave).
        this.onPeerGone()
        return
      }
      this.sendWire({ t: 'ping' })
    }, HEARTBEAT_MS)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  private clearDiscoveryTimer(): void {
    if (this.discoveryTimer) {
      clearTimeout(this.discoveryTimer)
      this.discoveryTimer = null
    }
  }

  /** The peer vanished mid-session: report it and stop game timers, but keep the
   *  session object usable (the UI calls leave() to fully dispose). */
  private onPeerGone(): void {
    if (!this.peerId) return
    this.peerId = null
    this.handshaked = false
    this.clearFlagTimer()
    this.stopHeartbeat()
    this.emitEvent({ type: 'peer-left' })
  }

  /** Fatal error path: report and tear down the transport (session stays inert
   *  until the UI calls leave()). */
  private fail(message: string): void {
    this.emitEvent({ type: 'error', message })
    this.teardownTransport()
    this.peerId = null
    this.handshaked = false
    this.clearDiscoveryTimer()
    this.clearFlagTimer()
    this.stopHeartbeat()
  }

  private teardownTransport(): void {
    this.clearDiscoveryTimer()
    this.clearFlagTimer()
    this.stopHeartbeat()
    if (this.transport) {
      try {
        this.transport.close()
      } catch {
        /* ignore */
      }
      this.transport = null
    }
  }

  /** Reset all per-game state so a session instance can be reused across a
   *  host()/join() cycle. Does NOT clear event listeners (leave() does that). */
  private resetState(): void {
    this.role = null
    this.config = null
    this.myColor = null
    this.peerId = null
    this.handshaked = false
    this.guestColor = null
    this.clocks = { white: 0, black: 0 }
    this.toMove = null
    this.turnStartedAt = 0
    this.gameOver = false
    this.incomingDrawOffer = false
    this.outgoingDrawOffer = false
    this.lastPeerMsgAt = 0
  }
}
