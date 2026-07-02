// MpSession — the one object that owns a LAN game, host or guest side.
// Electron-free by design: this file (like ./protocol.ts) stays importable from a
// bare node script (`node --experimental-strip-types` / tsx / esbuild) so the
// protocol can be smoke-tested without booting the app. All electron wiring lives
// in ../ipc/mp.ipc.ts.
//
// Roles & authority
//   HOST  — opens a WebSocketServer on an ephemeral port bound 0.0.0.0; the join
//           code encodes a LAN IPv4 + that port. The host is AUTHORITATIVE: it
//           owns the clocks (per-move timestamps, increment credit, flag on zero),
//           validates turn alternation, and relays the guest's moves.
//   GUEST — decodes the code, dials ws://ip:port, and simply renders what the host
//           tells it. It never runs a clock of its own.
//
// Perspective: every MpEvent is emitted from the RECEIVER's point of view
//   (`yourColor` is this client's color; `resign.by` is who resigned).
//
// Failure policy: nothing here ever throws to the caller. host() rejects only if
//   the server cannot bind (mp.ipc turns that into an error event); every other
//   failure — bad code, unreachable host, version mismatch, socket death,
//   malformed traffic, illegal/out-of-turn move — surfaces as an MpEvent 'error'
//   and/or 'peer-left', and the session tears itself down.

import { EventEmitter } from 'node:events'
import { WebSocket, WebSocketServer } from 'ws'
import type { MpEvent, MpGameConfig, MpColor } from '../../shared/types'
import {
  type WireMsg,
  parseWireMsg,
  encodeWireMsg,
  makeHello,
  PROTOCOL_VERSION,
  encodeJoinCode,
  decodeJoinCode,
  listLanIPv4s
} from './protocol'

export type MpRole = 'host' | 'guest'

/** How long we wait for the peer's hello before giving up (ms). */
const HANDSHAKE_TIMEOUT_MS = 10_000
/** How long the guest waits to open the TCP/ws connection before giving up (ms). */
const CONNECT_TIMEOUT_MS = 8_000
/** Heartbeat cadence: ping this often; a peer silent for ~2.5 intervals is dead. */
const HEARTBEAT_MS = 5_000
const HEARTBEAT_TIMEOUT_MS = 13_000

type Clocks = { white: number; black: number }

/** Emits a single event name, 'event', with an MpEvent payload. */
export class MpSession extends EventEmitter {
  private server: WebSocketServer | null = null
  /** The single peer socket (host: the one accepted guest; guest: the client). */
  private socket: WebSocket | null = null
  private role: MpRole | null = null
  private config: MpGameConfig | null = null
  /** This client's own color, resolved at start. */
  private myColor: MpColor | null = null

  // ---- host-only authoritative game state ------------------------------------
  /** Which color the GUEST plays (host color is the opposite). */
  private guestColor: MpColor | null = null
  /** Authoritative remaining time per side (host only). */
  private clocks: Clocks = { white: 0, black: 0 }
  /** Whose move it is right now (host only). null before start / after game end. */
  private toMove: MpColor | null = null
  /** perf/Date timestamp (ms) when the side-to-move's clock started ticking. */
  private turnStartedAt = 0
  /** Flag-fall watchdog for the side currently on move (host only). */
  private flagTimer: ReturnType<typeof setTimeout> | null = null
  /** True once the game is decided (resign/draw/flag/checkmate-by-agreement/leave)
   *  — further clock math and relays are suppressed. */
  private gameOver = false

  // ---- draw-offer bookkeeping (both sides) -----------------------------------
  /** We have a draw offer from the peer that we could accept. */
  private incomingDrawOffer = false
  /** We sent a draw offer the peer has not answered. */
  private outgoingDrawOffer = false

  // ---- heartbeat --------------------------------------------------------------
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private lastPongAt = 0

  // ============================================================================
  // HOST
  // ============================================================================

  /** Open the server side; resolves with the join code for the other player.
   *  Rejects ONLY when the socket cannot bind (mp.ipc surfaces that). */
  async host(cfg: MpGameConfig): Promise<{ code: string }> {
    this.role = 'host'
    this.config = cfg

    const ips = listLanIPv4s()
    if (ips.length === 0) {
      throw new Error('No LAN IPv4 address found — connect to a network to host.')
    }
    const ip = ips[0]

    const server = await new Promise<WebSocketServer>((resolve, reject) => {
      const s = new WebSocketServer({ port: 0, host: '0.0.0.0' })
      const onError = (err: Error): void => {
        s.removeListener('listening', onListening)
        reject(err)
      }
      const onListening = (): void => {
        s.removeListener('error', onError)
        resolve(s)
      }
      s.once('error', onError)
      s.once('listening', onListening)
    })
    this.server = server

    const addr = server.address()
    const port = typeof addr === 'object' && addr ? addr.port : 0
    if (!port) {
      server.close()
      this.server = null
      throw new Error('Failed to bind a local port for hosting.')
    }

    // Accept exactly one guest; reject any further connections.
    server.on('connection', (ws) => {
      if (this.socket) {
        // Already have our one guest — politely refuse extras.
        try {
          ws.send(encodeWireMsg({ t: 'error', message: 'host is busy' }))
        } catch {
          /* ignore */
        }
        ws.close()
        return
      }
      this.attachSocket(ws)
      this.sendHello()
      this.beginHandshakeTimeout()
    })

    // A late server error (after listening) can't reject an already-resolved
    // promise — surface it as an event and tear down.
    server.on('error', (err) => {
      this.fail(`host server error: ${err.message}`)
    })

    return { code: encodeJoinCode(ip, port) }
  }

  // ============================================================================
  // GUEST
  // ============================================================================

  /** Connect to a host by join code. Resolves {ok:false,error} — never rejects. */
  async join(code: string): Promise<{ ok: boolean; error?: string }> {
    this.role = 'guest'
    const addr = decodeJoinCode(code)
    if (!addr) return { ok: false, error: 'That code is not valid. Double-check the characters.' }

    let ws: WebSocket
    try {
      ws = new WebSocket(`ws://${addr.ip}:${addr.port}`)
    } catch (err) {
      return { ok: false, error: `Could not connect: ${(err as Error).message}` }
    }

    // Resolve once: either the socket opens (success) or it errors/times out.
    return await new Promise<{ ok: boolean; error?: string }>((resolve) => {
      let settled = false
      const done = (res: { ok: boolean; error?: string }): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(res)
      }
      const timer = setTimeout(() => {
        ws.removeAllListeners()
        ws.terminate()
        done({ ok: false, error: 'No answer from the host. Is the code right and are you on the same network?' })
      }, CONNECT_TIMEOUT_MS)

      ws.once('open', () => {
        // Connected. Wire it up, send our hello, and consider join() a success —
        // any subsequent version/handshake failure arrives as an MpEvent 'error'.
        this.attachSocket(ws)
        this.sendHello()
        this.beginHandshakeTimeout()
        done({ ok: true })
      })
      ws.once('error', (err) => {
        ws.removeAllListeners()
        done({ ok: false, error: `Could not reach the host: ${(err as Error).message}` })
      })
    })
  }

  // ============================================================================
  // Outbound actions (called by mp.ipc on behalf of the local player)
  // ============================================================================

  /** Send OUR move to the peer. On the host this is authoritative (updates clocks
   *  and relays); on the guest it's a request the host will time and relay back. */
  async sendMove(uci: string): Promise<{ ok: boolean }> {
    if (!this.socket || this.gameOver) return { ok: false }
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
    if (!this.socket || this.gameOver || !this.myColor) return { ok: false }
    this.endGame()
    this.sendWire({ t: 'resign', by: this.myColor })
    this.emitEvent({ type: 'resign', by: this.myColor })
    return { ok: true }
  }

  async offerDraw(): Promise<{ ok: boolean }> {
    if (!this.socket || this.gameOver) return { ok: false }
    // If the peer already offered, offering back = accepting.
    if (this.incomingDrawOffer) return this.acceptDraw()
    // Idempotent: a second offer while one is outstanding is a no-op (still ok).
    if (this.outgoingDrawOffer) return { ok: true }
    this.outgoingDrawOffer = true
    this.sendWire({ t: 'drawOffer' })
    return { ok: true }
  }

  async acceptDraw(): Promise<{ ok: boolean }> {
    if (!this.socket || this.gameOver || !this.incomingDrawOffer) return { ok: false }
    this.incomingDrawOffer = false
    this.endGame()
    this.sendWire({ t: 'drawAccept' })
    this.emitEvent({ type: 'drawAccept' })
    return { ok: true }
  }

  async offerRematch(): Promise<{ ok: boolean }> {
    if (!this.socket) return { ok: false }
    if (this.role === 'host') {
      // Host is authoritative on colors: swap sides and start a fresh game for
      // both. (v1 rematch is host-initiated; a guest "offer" is a request the
      // host's UI turns into this call.)
      this.startRematchAsHost()
      return { ok: true }
    }
    // Guest asks; host answers with 'rematchStart'.
    this.sendWire({ t: 'rematchOffer' })
    return { ok: true }
  }

  /** Tear everything down. Idempotent; safe before host()/join(). Sends a polite
   *  'bye' first when a socket is open so the peer gets a clean 'peer-left'. */
  close(): void {
    this.clearFlagTimer()
    this.stopHeartbeat()
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      try {
        this.socket.send(encodeWireMsg({ t: 'bye' }))
      } catch {
        /* ignore */
      }
    }
    this.socket?.removeAllListeners()
    this.socket?.close()
    this.socket = null
    this.server?.removeAllListeners()
    this.server?.close()
    this.server = null
    this.role = null
    this.config = null
    this.myColor = null
    this.guestColor = null
    this.toMove = null
    this.gameOver = false
    this.incomingDrawOffer = false
    this.outgoingDrawOffer = false
    this.removeAllListeners()
  }

  // ============================================================================
  // Internals
  // ============================================================================

  /** Typed emit — the ONLY way events leave this class. */
  protected emitEvent(ev: MpEvent): void {
    this.emit('event', ev)
  }

  private sendHello(): void {
    this.sendWire(makeHello())
  }

  private sendWire(msg: WireMsg): void {
    const ws = this.socket
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    try {
      ws.send(encodeWireMsg(msg))
    } catch {
      /* a dead socket surfaces via 'close'/'error' handlers */
    }
  }

  /** Bind the peer socket's lifecycle + message handlers. One socket per session. */
  private attachSocket(ws: WebSocket): void {
    this.socket = ws
    ws.on('message', (data) => this.onRaw(data))
    ws.on('close', () => this.onSocketClosed())
    ws.on('error', () => {
      // ws emits 'error' then 'close'; let 'close' drive the single teardown.
    })
    // ws heartbeat: reply to protocol-level pings automatically (ws does this),
    // and note liveness from pongs to our own pings.
    ws.on('pong', () => {
      this.lastPongAt = Date.now()
    })
  }

  /** If the peer never completes the hello handshake, drop it. */
  private handshakeTimer: ReturnType<typeof setTimeout> | null = null
  private helloReceived = false
  private beginHandshakeTimeout(): void {
    this.helloReceived = false
    this.handshakeTimer = setTimeout(() => {
      if (!this.helloReceived) this.fail('handshake timed out — no hello from peer')
    }, HANDSHAKE_TIMEOUT_MS)
  }
  private clearHandshakeTimer(): void {
    if (this.handshakeTimer) {
      clearTimeout(this.handshakeTimer)
      this.handshakeTimer = null
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat()
    this.lastPongAt = Date.now()
    this.heartbeatTimer = setInterval(() => {
      const ws = this.socket
      if (!ws || ws.readyState !== WebSocket.OPEN) return
      if (Date.now() - this.lastPongAt > HEARTBEAT_TIMEOUT_MS) {
        // Peer went silent — treat as a disconnect.
        this.onPeerGone()
        return
      }
      try {
        ws.ping()
      } catch {
        /* ignore */
      }
    }, HEARTBEAT_MS)
  }
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  /** Socket closed (peer disconnected or we closed). */
  private onSocketClosed(): void {
    // close() nulls this.socket before closing, so a close event with a live
    // this.socket means the PEER dropped us.
    if (this.socket) this.onPeerGone()
  }

  /** The peer vanished mid-session: report it and stop everything but keep the
   *  session object inert (mp.ipc calls close() to fully dispose). */
  private onPeerGone(): void {
    if (!this.socket) return
    this.clearHandshakeTimer()
    this.clearFlagTimer()
    this.stopHeartbeat()
    const ws = this.socket
    this.socket = null
    ws.removeAllListeners()
    try {
      ws.terminate()
    } catch {
      /* ignore */
    }
    this.emitEvent({ type: 'peer-left' })
  }

  /** Fatal error path: report and drop the peer socket (session stays inert). */
  private fail(message: string): void {
    this.emitEvent({ type: 'error', message })
    if (this.socket) {
      const ws = this.socket
      this.socket = null
      ws.removeAllListeners()
      try {
        ws.close()
      } catch {
        /* ignore */
      }
    }
    this.clearHandshakeTimer()
    this.clearFlagTimer()
    this.stopHeartbeat()
  }

  /** Translate one raw socket payload into MpEvents / drive host authority. */
  protected onRaw(raw: unknown): void {
    const msg: WireMsg | null = parseWireMsg(raw)
    if (!msg) {
      this.emitEvent({ type: 'error', message: 'malformed message from peer' })
      return
    }

    switch (msg.t) {
      case 'hello':
        this.onHello(msg.v)
        return
      case 'start':
        // Guest side: the host resolved colors and started the game.
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
      case 'error':
        this.emitEvent({ type: 'error', message: msg.message })
        return
    }
  }

  private onHello(peerVersion: number): void {
    this.clearHandshakeTimer()
    this.helloReceived = true
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
    // Handshake good — start heartbeating.
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
}
