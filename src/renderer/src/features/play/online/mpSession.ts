// MpNetSession — the one object that owns an internet game, host or guest side.
// PURE session/authority logic: it imports ONLY the isomorphic wire protocol, the
// shared types, and the (type-erased + pure) time-control helper. NO trystero, NO
// electron, NO node — so it bundles standalone into the renderer and runs unchanged
// under bare node for tests. The actual signaling + WebRTC lives behind an injected
// MpTransport (see rtcTransport.ts).
//
// Roles & authority
//   HOST  — creates the room; the join code IS the room key. The host is
//           AUTHORITATIVE: it owns the gameId, the monotonic clocks (per-move
//           timestamps, increment credit, flag on zero, lag compensation),
//           validates turn alternation, and relays the guest's moves. It accepts
//           the FIRST peer that appears; extras get a targeted error and are
//           otherwise ignored.
//   GUEST — joins by code and renders what the host tells it. It never runs an
//           authoritative clock. A guest hearing hello{role:'guest'} knows nobody
//           is hosting and fails immediately; no host at all within 30s → friendly
//           give-up.
//
// Perspective: every MpEvent is emitted from the RECEIVER's point of view
//   (`yourColor` is this client's color; `resign.by`/`flag.by` is who lost).
//
// Time base (D3): ALL elapsed measurement uses a monotonic clock (performance.now(),
//   injectable for tests). It excludes mac sleep, so a sleeping host charges no one.
//   Flag/abort watchdog callbacks NEVER trust timer punctuality: on fire they
//   recompute the remaining time from the monotonic base and re-arm for any residual.
//
// Failure policy: nothing here throws to the caller. host()/join() resolve; every
//   other failure — bad code, no host, version mismatch, peer gone, malformed
//   traffic, illegal/out-of-turn move — surfaces as an MpEvent and tears down.

import type { MpEvent, MpGameConfig, MpColor, MpClocks } from '@shared/types'
import {
  type WireMsg,
  parseWireMsg,
  encodeWireMsg,
  makeHello,
  sanitizeName,
  PROTOCOL_VERSION,
  generateRoomCode,
  normalizeRoomCode
} from '@shared/mp/wire'
import { timeControlCategory, type TimeControl } from '../timeControl'

export type MpRole = 'host' | 'guest'

/** Host-side legality seam (wire v4): the session itself relays OPAQUE move
 *  strings and knows NO game rules. The store registers a validator backed by
 *  the game kernel; the session consults it before committing a GUEST move.
 *  `moves` is the committed move list so far (the position is derivable from
 *  it); return false to silently drop the move (same as an out-of-turn move).
 *  Default (nothing registered) = accept, preserving pre-v4 behavior. */
export type MpMoveValidator = (moves: readonly string[], move: string) => boolean

// ---- Injected transport contract (implemented by rtcTransport.ts) -------------

export interface MpTransportListeners {
  onMessage(text: string, fromPeer: string): void
  onPeerJoin(peerId: string): void
  onPeerLeave(peerId: string): void
  /** Optional relay-connectivity ticks: how many signaling relays are open. */
  onRelayStatus?(connected: number, total: number): void
  /** A queued send failed (dead/closed channel). The session treats it like
   *  heartbeat trouble (suspend path), never an unhandled rejection (T6). */
  onSendError?(err: unknown): void
}

export interface MpTransport {
  /** Send wire text to a specific peer, or broadcast to the room if omitted. */
  send(text: string, toPeer?: string): void
  /** Stop the relay-connectivity poll early (once handshaken; T8). Optional so a
   *  minimal/test transport need not implement it. */
  stopRelayPoll?(): void
  close(): void
  /** Resolves once the underlying room has fully left, so a same-code rejoin can
   *  await settle before re-creating the transport (T7). Optional. */
  closed?: Promise<void>
}

export type MpTransportFactory = (
  roomCode: string,
  listeners: MpTransportListeners
) => MpTransport | Promise<MpTransport>

// ---- Timing constants ---------------------------------------------------------
// Grouped into one mutable MP_TIMING record (production defaults below). They live
// on an object rather than as bare `const`s for exactly ONE reason: the headless
// suite (scripts/test-mp.mjs) must shrink the multi-second watchdog windows to a
// few ms so it can exercise the abort/flag/handshake/discovery/heartbeat timers
// deterministically instead of sleeping tens of seconds. `__setMpTimingForTests`
// is the ONLY writer; production code never mutates it and reads the same fields.

export interface MpTimingConfig {
  /** How long the guest waits to discover the host before giving up (ms). */
  DISCOVERY_TIMEOUT_MS: number
  /** Host: after bonding a peer on presence, unbond if no valid hello lands within
   *  this window and accept the next peer (L8). */
  HANDSHAKE_WATCHDOG_MS: number
  /** First-move grace: white must move within this of start, and black must reply
   *  within this of white's first move, else the game aborts (D1/MP-03). */
  FIRST_MOVE_ABORT_MS: number
  /** Heartbeat cadence: send a ping this often once handshaken. */
  HEARTBEAT_MS: number
  /** Declare the peer away only after this much silence AND two failed evals (D4). */
  PEER_SILENCE_MS: number
  /** Max lag forgiven per guest move debit (D11). */
  MAX_LAG_FORGIVE_MS: number
  /** Reconnect grace by speed category (MP-06). */
  GRACE_BY_CATEGORY: Record<string, number>
}

/** Production timing defaults. Mutated ONLY by __setMpTimingForTests (tests). */
const MP_TIMING: MpTimingConfig = {
  DISCOVERY_TIMEOUT_MS: 30_000,
  HANDSHAKE_WATCHDOG_MS: 15_000,
  FIRST_MOVE_ABORT_MS: 30_000,
  HEARTBEAT_MS: 5_000,
  PEER_SILENCE_MS: 15_000,
  MAX_LAG_FORGIVE_MS: 250,
  GRACE_BY_CATEGORY: {
    Bullet: 20_000,
    Blitz: 30_000,
    Rapid: 45_000,
    Classical: 60_000,
    Unlimited: 45_000
  }
}

/** TEST-ONLY: shallow-merge overrides into MP_TIMING so the headless suite can
 *  shrink watchdog windows without a real 30s wait. Never called in production. */
export function __setMpTimingForTests(overrides: Partial<MpTimingConfig>): void {
  Object.assign(MP_TIMING, overrides)
}

/** The friendly message shown when nobody is hosting the entered code. */
const NO_HOST_MESSAGE =
  "Nobody's hosting with that code right now. Double-check it, and make sure " +
  'your opponent still has their game open.'

type Clocks = MpClocks

export interface MpSessionOptions {
  /** Monotonic time source (ms). Defaults to performance.now(). Injected in tests. */
  now?: () => number
}

export class MpNetSession {
  private readonly makeTransport: MpTransportFactory
  private readonly now: () => number
  private transport: MpTransport | null = null
  /** The `closed` promise of the transport we most recently tore down, so a
   *  same-code rejoin can await the room's full settle before re-creating one (T7). */
  private pendingClose: Promise<void> | null = null

  private role: MpRole | null = null
  private config: MpGameConfig | null = null
  /** Our display name (sanitized), sent in hello/start. */
  private myName: string | undefined
  /** The peer's display name, learned from their hello. */
  private peerName: string | undefined
  /** This client's own color, resolved at start. */
  private myColor: MpColor | null = null

  /** The single bonded peer id (host: the accepted guest; guest: the host). */
  private peerId: string | null = null
  /** A peer we suspended on (peer-away): its traffic is dropped except hello, and
   *  a rebond from the SAME id resumes rather than restarts (T3/T2). */
  private ghostPeerId: string | null = null
  /** True once the peer's hello has been validated (both sides). */
  private handshaked = false

  // ---- authoritative game state ----------------------------------------------
  /** Host-owned game id: monotonic per session, starts 1, +1 per rematch. Guest
   *  adopts the host's value. In-game wire messages carry it; mismatches drop. */
  private gameId = 0
  /** Which color the GUEST plays (host color is the opposite). */
  private guestColor: MpColor | null = null
  /** Authoritative remaining time per side (host only). */
  private clocks: Clocks = { white: 0, black: 0 }
  /** Whose move it is right now. null before start / after game end. */
  private toMove: MpColor | null = null
  /** Monotonic time (ms) when the side-to-move's clock started ticking. 0 while
   *  the clock is IDLE (before white's first move, or paused during suspend). */
  private turnStartedAt = 0
  /** 0-based half-move count committed so far (both sides track it). */
  private plyCount = 0
  /** Full move list (UCIs from startpos) — host keeps it for resync. */
  private moves: string[] = []
  /** True once the game is decided — further clock math and relays are suppressed. */
  private over = false
  /** True while a game is live and undecided (drives suspend eligibility). */
  private inGame = false

  /** Flag-fall watchdog for the side currently on move (host only). */
  private flagTimer: ReturnType<typeof setTimeout> | null = null
  /** First-move abort watchdog (host only). */
  private abortTimer: ReturnType<typeof setTimeout> | null = null
  /** Host handshake watchdog (unbond a silent peer). */
  private handshakeTimer: ReturnType<typeof setTimeout> | null = null

  // ---- draw-offer bookkeeping ------------------------------------------------
  private incomingDrawOffer = false
  private outgoingDrawOffer = false
  /** Ply before which the given side may not (re-)offer a draw. Host-enforced:
   *  no offers before ply 2; +20 plies after a decline for the declined side. */
  private drawBlockedUntilPly: Record<MpColor, number> = { white: 0, black: 0 }

  // ---- rematch bookkeeping (symmetric) ---------------------------------------
  private myRematchOffer = false
  private peerRematchOffer = false

  // ---- suspend / resume ------------------------------------------------------
  /** When set, the game is paused waiting for the ghost peer to rebond. */
  private suspended = false
  /** Grace-expiry timer while suspended. */
  private graceTimer: ReturnType<typeof setTimeout> | null = null

  // ---- heartbeat + discovery timers ------------------------------------------
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private discoveryTimer: ReturnType<typeof setTimeout> | null = null
  /** Last time we heard ANY message from the bonded peer (monotonic). */
  private lastPeerMsgAt = 0
  /** Last time our own heartbeat tick fired (monotonic) — self-stall detector. */
  private lastTickAt = 0
  /** Consecutive failed heartbeat evaluations (two-strike rule). */
  private missedEvals = 0
  /** Rolling round-trip estimate (ms) from timestamped ping/pong. */
  private rtt = 0

  // ---- event fan-out ----------------------------------------------------------
  private listeners = new Set<(ev: MpEvent) => void>()

  /** Registered host-side move validator (kernel seam). null = accept all. */
  private moveValidator: MpMoveValidator | null = null

  constructor(makeTransport: MpTransportFactory, opts: MpSessionOptions = {}) {
    this.makeTransport = makeTransport
    this.now =
      opts.now ??
      (typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? () => performance.now()
        : () => Date.now())
  }

  /** Register the host-side move validator (kernel seam, wire v4). The store
   *  registers a game-kernel-backed check; the session calls it before
   *  committing a GUEST move. null (or never called) = accept everything, so
   *  behavior without a registered kernel is identical to pre-v4. Survives
   *  resetState() — registration lifetime belongs to the registrant, like
   *  event listeners (L1). */
  setMoveValidator(fn: MpMoveValidator | null): void {
    this.moveValidator = fn
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
  async host(cfg: MpGameConfig, name?: string): Promise<{ code: string }> {
    this.teardownTransport()
    this.resetState()
    await this.awaitPreviousClose()
    this.role = 'host'
    this.config = cfg
    this.myName = sanitizeName(name)
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
  async join(code: string, name?: string): Promise<{ ok: boolean; error?: string }> {
    const normalized = normalizeRoomCode(code)
    if (!normalized) {
      return { ok: false, error: 'That code is not valid. Double-check the characters.' }
    }
    this.teardownTransport()
    this.resetState()
    await this.awaitPreviousClose()
    this.role = 'guest'
    this.myName = sanitizeName(name)
    this.transport = await this.makeTransport(normalized, this.transportListeners())
    // We're contacting relays; the transport reports counts as they connect.
    this.emitEvent({ type: 'net', state: 'relays' })
    // Give up if no host answers within the discovery window.
    this.discoveryTimer = setTimeout(() => {
      this.fail(NO_HOST_MESSAGE)
    }, MP_TIMING.DISCOVERY_TIMEOUT_MS)
    return { ok: true }
  }

  // ============================================================================
  // Outbound actions (called by the UI on behalf of the local player)
  // ============================================================================

  /** Send OUR move to the peer. On the host this is authoritative (updates clocks
   *  and relays); on the guest it's a request the host will time and relay back.
   *  Blocked while suspended (the store also freezes the board). */
  async sendMove(uci: string): Promise<{ ok: boolean }> {
    if (!this.peerId || this.over || this.suspended) return { ok: false }
    // A move answers any pending draw exchange (offer withdrawn / declined).
    this.incomingDrawOffer = false
    this.outgoingDrawOffer = false

    if (this.role === 'host') {
      // We're the authority: apply our own move to the clocks and relay it.
      if (!this.myColor || this.toMove !== this.myColor) return { ok: false } // not our turn
      const ply = this.plyCount
      const clocks = this.commitMove(this.myColor, uci, 0)
      if (!clocks) return { ok: false } // flagged during commit — handled inside
      this.sendWire({ t: 'move', gameId: this.gameId, ply, uci, clockMs: clocks })
      return { ok: true }
    }

    // Guest: it must be our turn (the host re-validates, but gate locally so our
    // ply bookkeeping stays honest for the next host move / a resumeReq).
    if (!this.myColor || this.toMove !== this.myColor) return { ok: false }
    // Hand the move to the host (clockMs is a courtesy hint it ignores; it recomputes
    // authoritatively). Record it locally + advance our ply/turn OPTIMISTICALLY so
    // the host's next relayed move isn't dropped as out-of-order; the host's `clock`
    // ack corrects our clocks. The store rolls the board back if this returns false.
    this.sendWire({ t: 'move', gameId: this.gameId, ply: this.plyCount, uci, clockMs: { ...this.clocks } })
    this.recordMove(uci)
    this.toMove = this.myColor === 'white' ? 'black' : 'white'
    return { ok: true }
  }

  async resign(): Promise<{ ok: boolean }> {
    if (!this.peerId || this.over || !this.myColor || !this.inGame) return { ok: false }
    const gid = this.gameId
    this.endGame()
    this.sendWire({ t: 'resign', gameId: gid, by: this.myColor })
    this.emitEvent({ type: 'resign', by: this.myColor })
    return { ok: true }
  }

  async offerDraw(): Promise<{ ok: boolean }> {
    if (!this.peerId || this.over || !this.myColor || this.suspended || !this.inGame) {
      return { ok: false }
    }
    // If the peer already offered, offering back = accepting.
    if (this.incomingDrawOffer) return this.acceptDraw()
    // Gate: no offers before ply 2, and none until our post-decline cooldown lapses.
    if (this.plyCount < 2) return { ok: false }
    if (this.plyCount < this.drawBlockedUntilPly[this.myColor]) return { ok: false }
    // Idempotent: a second offer while one is outstanding is a no-op (still ok).
    if (this.outgoingDrawOffer) return { ok: true }
    this.outgoingDrawOffer = true
    this.sendWire({ t: 'drawOffer', gameId: this.gameId })
    return { ok: true }
  }

  async acceptDraw(): Promise<{ ok: boolean }> {
    if (!this.peerId || this.over || !this.incomingDrawOffer) return { ok: false }
    this.incomingDrawOffer = false
    const gid = this.gameId
    this.endGame()
    this.sendWire({ t: 'drawAccept', gameId: gid })
    this.emitEvent({ type: 'drawAccept' })
    return { ok: true }
  }

  async declineDraw(): Promise<{ ok: boolean }> {
    if (!this.peerId || this.over || !this.incomingDrawOffer) return { ok: false }
    this.incomingDrawOffer = false
    // The offerer (the peer) must wait a cooldown before re-offering. Host owns
    // the ledger; a guest's decline is enforced when the host receives drawOffer.
    const offerer: MpColor = this.myColor === 'white' ? 'black' : 'white'
    this.drawBlockedUntilPly[offerer] = this.plyCount + 20
    this.sendWire({ t: 'drawDecline', gameId: this.gameId })
    this.emitEvent({ type: 'drawDecline' })
    return { ok: true }
  }

  /** Board-terminal ending detected by the store (checkmate/stalemate/insufficient/…).
   *  The session ends the game, stops clocks, and tells the peer (D7). Spec API:
   *  mp.gameEnded(result, reason). */
  async gameEnded(result: '1-0' | '0-1' | '1/2-1/2', reason: string): Promise<{ ok: boolean }> {
    if (!this.peerId || this.over || !this.inGame) return { ok: false }
    const gid = this.gameId
    this.endGame()
    this.sendWire({ t: 'gameOver', gameId: gid, result, reason })
    this.emitEvent({ type: 'gameOver', gameId: gid, result, reason })
    return { ok: true }
  }

  /** Manual abort while the game hasn't really begun (plyCount < 2). No result. */
  async abort(): Promise<{ ok: boolean }> {
    if (!this.peerId || this.over || !this.inGame || this.plyCount >= 2) return { ok: false }
    const gid = this.gameId
    this.endGame()
    this.sendWire({ t: 'abort', gameId: gid, reason: 'manual' })
    this.emitEvent({ type: 'abort', gameId: gid, reason: 'manual' })
    return { ok: true }
  }

  async offerRematch(): Promise<{ ok: boolean }> {
    if (!this.peerId || !this.over) return { ok: false }
    this.myRematchOffer = true
    // Tell the peer we want a rematch (both roles send the same offer).
    this.sendWire({ t: 'rematchOffer' })
    // The host starts the game only once BOTH sides have offered.
    if (this.role === 'host' && this.peerRematchOffer) this.startRematchAsHost()
    return { ok: true }
  }

  async declineRematch(): Promise<{ ok: boolean }> {
    if (!this.peerId) return { ok: false }
    this.myRematchOffer = false
    this.peerRematchOffer = false
    this.sendWire({ t: 'rematchDecline' })
    this.emitEvent({ type: 'rematchDecline' })
    return { ok: true }
  }

  /** Grace expired and the local player claims the win (opponent left). Host-only
   *  in effect (only the still-present side calls it). Emits gameOver with reason
   *  'opponent left' and sends it best-effort (the peer is likely gone). */
  async claimVictory(): Promise<{ ok: boolean }> {
    if (this.over || !this.myColor || !this.inGame) return { ok: false }
    const gid = this.gameId
    const result: '1-0' | '0-1' = this.myColor === 'white' ? '1-0' : '0-1'
    this.endGame()
    // Best-effort — the ghost is probably gone, but a straggler should still hear it.
    this.sendGhost({ t: 'gameOver', gameId: gid, result, reason: 'opponent left' })
    this.emitEvent({ type: 'gameOver', gameId: gid, result, reason: 'opponent left' })
    return { ok: true }
  }

  /** Tear everything down. Idempotent; safe before host()/join(). Sends a polite
   *  'bye' first when connected so the peer gets a clean 'peer-left'. MUST NOT
   *  clear event listeners — subscription lifetime belongs to the subscriber (L1). */
  leave(): void {
    if (this.peerId) {
      // Best-effort goodbye; the transport swallows a send after close.
      this.sendWire({ t: 'bye' })
    }
    this.teardownTransport()
    this.resetState()
  }

  // ============================================================================
  // Transport wiring
  // ============================================================================

  private transportListeners(): MpTransportListeners {
    return {
      onMessage: (text, fromPeer) => this.onRaw(text, fromPeer),
      onPeerJoin: (id) => this.onPeerJoin(id),
      onPeerLeave: (id) => this.onPeerLeave(id),
      onSendError: (err) => this.onSendError(err),
      onRelayStatus: (connected, total) => {
        // Relay-status 'net' events only while we haven't handshaked (T8).
        if (this.handshaked) return
        this.emitEvent({ type: 'net', state: 'relays', relays: { connected, total } })
        // Guest: once at least one relay is open we're actively searching for the
        // host. (Harmless if emitted repeatedly; the UI just shows "searching".)
        if (this.role === 'guest' && !this.peerId && connected > 0) {
          this.emitEvent({ type: 'net', state: 'searching' })
        }
      }
    }
  }

  /** A peer appeared in the room. Bond to the first; refuse the rest (unless it's
   *  the ghost rebonding, which trystero re-pairs with the same id — T2). */
  private onPeerJoin(id: string): void {
    // Ghost rebond: the SAME peer we suspended on came back. Re-adopt it and let
    // the resume handshake run; do NOT restart the game.
    if (this.suspended && id === this.ghostPeerId) {
      this.rebond(id)
      return
    }
    if (this.peerId) {
      // Already have our one opponent — politely refuse extras (targeted).
      if (this.role === 'host') {
        this.transport?.send(encodeWireMsg({ t: 'error', message: 'host is busy' }), id)
      }
      return
    }
    // A brand-new peer arriving while a game is suspended: the seat is taken.
    if (this.suspended && this.role === 'host') {
      this.transport?.send(encodeWireMsg({ t: 'error', message: 'game in progress' }), id)
      return
    }
    this.peerId = id
    this.lastPeerMsgAt = this.now()
    // Peer found: the hello handshake / WebRTC is now in flight.
    if (this.role === 'guest') this.emitEvent({ type: 'net', state: 'connecting' })
    // Host arms a handshake watchdog: unbond a peer that never says a valid hello.
    if (this.role === 'host') this.armHandshakeWatchdog()
    // Both sides greet immediately; the game starts once the peer's hello lands.
    this.sendWire(this.makeOurHello())
  }

  /** A peer left the room. Only the bonded (or ghost) peer matters. */
  private onPeerLeave(id: string): void {
    if (id === this.peerId) this.onPeerGone()
    // A ghost fully leaving the room is fine — the grace timer still governs.
  }

  private onSendError(err: unknown): void {
    // A dead channel is heartbeat trouble: enter the suspend/away path rather than
    // letting the rejection go unhandled (T6). Ignore before/after a live game.
    void err
    if (!this.inGame || this.suspended || this.over) return
    this.enterSuspend()
  }

  private makeOurHello(): WireMsg {
    return makeHello(this.role === 'host' ? 'host' : 'guest', this.myName)
  }

  private sendWire(msg: WireMsg): void {
    if (!this.transport || !this.peerId) return
    this.transport.send(encodeWireMsg(msg), this.peerId)
  }

  /** Best-effort send to the ghost peer id (used when claiming a left game). */
  private sendGhost(msg: WireMsg): void {
    const target = this.peerId ?? this.ghostPeerId
    if (!this.transport || !target) return
    this.transport.send(encodeWireMsg(msg), target)
  }

  // ============================================================================
  // Inbound: translate one wire message into events / drive host authority
  // ============================================================================

  protected onRaw(text: string, fromPeer: string): void {
    const msg: WireMsg | null = parseWireMsg(text)
    if (!msg) {
      // Only complain about garbage from our bonded peer; ignore strangers.
      if (!this.peerId || fromPeer === this.peerId) {
        this.emitEvent({ type: 'error', message: 'malformed message from peer' })
      }
      return
    }
    // While suspended, drop ALL ghost traffic except a hello (which re-bonds).
    if (this.suspended && fromPeer === this.ghostPeerId && msg.t !== 'hello') return
    // Ignore chatter from any peer that isn't our bonded opponent (T3), except a
    // hello, which is how a rebond announces itself.
    if (this.peerId && fromPeer !== this.peerId && msg.t !== 'hello') return

    // Any traffic from the (bonded/ghost) peer counts as liveness.
    if (fromPeer === this.peerId || fromPeer === this.ghostPeerId) this.lastPeerMsgAt = this.now()

    // Drop stale in-game traffic addressed to a different game (D8) or out-of-
    // order plies (a move with the wrong ply, e.g. a duplicate/lag delivery).
    if (this.isInGameMsg(msg) && 'gameId' in msg && msg.gameId !== this.gameId) return

    switch (msg.t) {
      case 'hello':
        this.onHello(msg.v, msg.role, msg.name, fromPeer)
        return
      case 'start':
        this.onStart(msg.gameId, msg.yourColor, msg.config, msg.name)
        return
      case 'move':
        this.onWireMove(msg.ply, msg.uci, msg.clockMs)
        return
      case 'clock':
        this.onWireClock(msg.clockMs, msg.toMove)
        return
      case 'flag':
        // Trust the host's flag verdict (guest); the host doesn't receive its own.
        this.applyFlag(msg.by, msg.clockMs)
        return
      case 'abort':
        this.applyAbort(msg.reason)
        return
      case 'gameOver':
        this.applyGameOver(msg.result, msg.reason)
        return
      case 'drawOffer':
        this.onWireDrawOffer()
        return
      case 'drawDecline':
        this.onWireDrawDecline()
        return
      case 'drawAccept':
        // Peer accepted OUR offer — game drawn.
        this.outgoingDrawOffer = false
        if (this.over) return
        this.endGame()
        this.emitEvent({ type: 'drawAccept' })
        return
      case 'resign':
        if (this.over) return
        this.endGame()
        this.emitEvent({ type: 'resign', by: msg.by })
        return
      case 'rematchOffer':
        this.onWireRematchOffer()
        return
      case 'rematchDecline':
        this.myRematchOffer = false
        this.peerRematchOffer = false
        this.emitEvent({ type: 'rematchDecline' })
        return
      case 'rematchStart':
        // Guest side: host started a rematch; adopt the (swapped) color + gameId.
        this.onRematchStart(msg.gameId, msg.yourColor)
        return
      case 'resumeReq':
        this.onResumeReq(msg.gameId, msg.havePly)
        return
      case 'resync':
        this.onResync(msg.gameId, msg.moves, msg.clockMs, msg.toMove, msg.yourColor, msg.config)
        return
      case 'bye':
        this.onPeerGone()
        return
      case 'ping':
        // Echo the sender's timestamp so THEY can measure RTT.
        this.sendWire({ t: 'pong', ts: msg.ts })
        return
      case 'pong':
        // Our ping came back: update the rolling RTT estimate.
        this.onPong(msg.ts)
        return
      case 'error':
        this.onWireError(msg.message)
        return
    }
  }

  /** Which wire messages carry a gameId that must match the current game. */
  private isInGameMsg(msg: WireMsg): boolean {
    switch (msg.t) {
      case 'move':
      case 'clock':
      case 'flag':
      case 'abort':
      case 'gameOver':
      case 'resign':
      case 'drawOffer':
      case 'drawDecline':
      case 'drawAccept':
      case 'resumeReq':
        return true
      // start/resync/rematchStart CARRY a new gameId (they set it) — never drop.
      default:
        return false
    }
  }

  private onWireError(message: string): void {
    // A guest×guest collision or a busy/in-progress host: friendly failure + drop.
    this.fail(message)
  }

  // ---- handshake -------------------------------------------------------------

  private onHello(peerVersion: number, peerRole: MpRole, peerName: string | undefined, fromPeer: string): void {
    if (peerVersion !== PROTOCOL_VERSION) {
      // Version mismatch: tell the peer, tell our UI, and drop.
      this.sendWire({ t: 'error', message: `version mismatch (host expects v${PROTOCOL_VERSION})` })
      this.fail(
        `The other player is running an incompatible version (protocol v${peerVersion} vs v${PROTOCOL_VERSION}).`
      )
      return
    }
    // Role sanity: a guest that hears another guest knows nobody is hosting (T5).
    if (this.role === 'guest' && peerRole !== 'host') {
      this.fail("That code has no host — it looks like you both joined. One of you needs to Host.")
      return
    }
    if (this.role === 'host' && peerRole !== 'guest') {
      // Two hosts on the same code: refuse this stranger, keep hosting.
      this.transport?.send(encodeWireMsg({ t: 'error', message: 'that code is already hosted' }), fromPeer)
      return
    }
    this.peerName = peerName

    // Ghost hello during suspend: the SAME peer is back → RESUME, never restart
    // (D9). rebond() restores the bond, re-anchors the clock, restarts the
    // heartbeat, and emits peer-back. The guest then asks for a resync.
    if (this.suspended && fromPeer === this.ghostPeerId) {
      this.rebond(fromPeer)
      this.handshaked = true
      if (this.role === 'guest') {
        this.sendWire({ t: 'resumeReq', gameId: this.gameId, havePly: this.plyCount })
      }
      return
    }

    if (this.handshaked) return // ignore a duplicate hello mid-game

    // Handshake good — stop the discovery/handshake clocks and start heartbeating.
    this.handshaked = true
    this.clearDiscoveryTimer()
    this.clearHandshakeWatchdog()
    this.transport?.stopRelayPoll?.()
    this.startHeartbeat()

    if (this.suspended) {
      // Suspended but this hello isn't from the ghost — shouldn't happen (a new
      // peer while suspended is refused in onPeerJoin), but never start a game.
      return
    }

    // A live game already exists (e.g. onPeerJoin re-bonded the ghost first, then
    // its hello arrived): this is a RESUME, never a restart (D9). The host waits
    // for the guest's resumeReq; the guest asks for a resync.
    if (this.inGame && !this.over) {
      if (this.role === 'guest') {
        this.sendWire({ t: 'resumeReq', gameId: this.gameId, havePly: this.plyCount })
      }
      return
    }

    if (this.role === 'host') {
      // Host resolves colors now and starts the game for both sides.
      this.startGameAsHost()
    }
    // Guest waits for the host's 'start'.
  }

  private armHandshakeWatchdog(): void {
    this.clearHandshakeWatchdog()
    this.handshakeTimer = setTimeout(() => {
      if (this.handshaked || !this.peerId) return
      // The bonded peer never greeted us: unbond and accept the next one (L8).
      const stale = this.peerId
      this.peerId = null
      this.emitEvent({ type: 'net', state: 'searching' })
      void stale
    }, MP_TIMING.HANDSHAKE_WATCHDOG_MS)
  }

  private clearHandshakeWatchdog(): void {
    if (this.handshakeTimer) {
      clearTimeout(this.handshakeTimer)
      this.handshakeTimer = null
    }
  }

  // ---- host: game start ------------------------------------------------------

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
    this.gameId += 1 // first game → 1
    this.beginGame()
    // Tell the guest their color + config + our name; emit our own start.
    this.sendWire({
      t: 'start',
      gameId: this.gameId,
      yourColor: guestColor,
      config: this.config,
      ...(this.myName ? { name: this.myName } : {})
    })
    this.emitEvent({ type: 'peer-joined' })
    this.emitEvent({
      type: 'start',
      gameId: this.gameId,
      yourColor: hostColor,
      config: this.config,
      ...(this.peerName ? { opponentName: this.peerName } : {})
    })
  }

  /** Reset per-game state for a fresh game (host + guest). Clocks IDLE, white to
   *  move but its clock not yet running (first-move rule). Arms the abort watchdog. */
  private beginGame(): void {
    const initial = this.config?.tc.initialMs ?? 0
    this.clocks = { white: initial, black: initial }
    this.over = false
    this.inGame = true
    this.suspended = false
    this.incomingDrawOffer = false
    this.outgoingDrawOffer = false
    this.myRematchOffer = false
    this.peerRematchOffer = false
    this.drawBlockedUntilPly = { white: 0, black: 0 }
    this.plyCount = 0
    this.moves = []
    // Clocks IDLE: white is to move but turnStartedAt stays 0 (no debit, no flag)
    // until white's first move commits (D1/MP-03).
    this.toMove = 'white'
    this.turnStartedAt = 0
    this.clearFlagTimer()
    // The host owns the abort watchdog for the missing first move.
    if (this.role === 'host') this.armAbortWatchdog()
  }

  /** Whether this game runs a clock at all (initialMs 0 ⇒ untimed/unlimited). */
  private get timed(): boolean {
    return (this.config?.tc.initialMs ?? 0) > 0
  }

  private currentTimeControl(): TimeControl {
    const initial = this.config?.tc.initialMs ?? 0
    const inc = this.config?.tc.incrementMs ?? 0
    return { id: 'mp', label: 'mp', baseMs: initial, incMs: inc }
  }

  // ---- clocks + move authority ------------------------------------------------

  /** Commit `mover`'s move: record it, debit its elapsed time (with lag forgiveness
   *  for guest moves), credit the increment, flip the turn, re-arm watchdogs.
   *  Returns the fresh authoritative clocks, or null if the mover just flagged
   *  (game ended + flag emitted/relayed inside). Host-only. */
  private commitMove(mover: MpColor, uci: string, lagForgiveMs: number): Clocks | null {
    const isFirstWhiteMove = this.plyCount === 0 && mover === 'white'

    if (!this.timed) {
      this.recordMove(uci)
      this.toMove = mover === 'white' ? 'black' : 'white'
      this.clearAbortWatchdog()
      // Black's reply after white's first move still needs its own abort window.
      if (this.plyCount === 1) this.armAbortWatchdog()
      return { ...this.clocks }
    }

    if (isFirstWhiteMove) {
      // White's first move debits 0 and credits NO increment; it starts black's
      // clock. (Verified lichess/scalachess.)
      this.recordMove(uci)
      this.toMove = 'black'
      this.turnStartedAt = this.now()
      this.clearAbortWatchdog()
      this.armAbortWatchdog() // black must reply within the grace window
      this.armFlagTimer()
      return { ...this.clocks }
    }

    // Normal Fischer debit + increment from black's move 1 onward.
    const now = this.now()
    const elapsed = Math.max(0, now - this.turnStartedAt - Math.max(0, lagForgiveMs))
    const remaining = this.clocks[mover] - elapsed
    if (remaining < 0) {
      // Flag fall on the mover's own clock — they lose on time.
      this.clocks[mover] = 0
      this.flagLoss(mover)
      return null
    }
    const inc = this.config?.tc.incrementMs ?? 0
    this.clocks[mover] = remaining + inc
    this.recordMove(uci)
    // Flip the turn; the other side's clock now starts ticking.
    this.toMove = mover === 'white' ? 'black' : 'white'
    this.turnStartedAt = now
    // Once black has replied (ply ≥ 2) the game is truly underway: no more abort.
    this.clearAbortWatchdog()
    this.armFlagTimer()
    return { ...this.clocks }
  }

  private recordMove(uci: string): void {
    this.moves.push(uci)
    this.plyCount += 1
  }

  /** Arm a watchdog that fires when the side-to-move would flag. On fire it
   *  RECOMPUTES remaining from the monotonic base and re-arms for any residual
   *  (never trusts the timer's punctuality — D3). Host-only. */
  private armFlagTimer(): void {
    this.clearFlagTimer()
    if (!this.timed || this.over || !this.toMove || this.turnStartedAt === 0) return
    const side = this.toMove
    const fireIn = Math.max(0, this.clocks[side] - (this.now() - this.turnStartedAt))
    this.flagTimer = setTimeout(() => {
      this.flagTimer = null
      if (this.over || this.suspended || this.toMove !== side || this.turnStartedAt === 0) return
      const remaining = this.clocks[side] - (this.now() - this.turnStartedAt)
      if (remaining > 0) {
        // Fired early (timer imprecision / throttling): re-arm for the residual.
        this.armFlagTimer()
        return
      }
      this.clocks[side] = 0
      this.flagLoss(side)
    }, fireIn)
  }

  private clearFlagTimer(): void {
    if (this.flagTimer) {
      clearTimeout(this.flagTimer)
      this.flagTimer = null
    }
  }

  /** The side `loser` ran out of time. Its own event: flag{by, clocks} with the
   *  loser zeroed; the store adjudicates insufficient-material draw vs win. */
  private flagLoss(loser: MpColor): void {
    if (this.over) return
    const gid = this.gameId
    this.clocks[loser] = 0
    this.endGame()
    const clockMs = { ...this.clocks }
    this.sendWire({ t: 'flag', gameId: gid, by: loser, clockMs })
    this.emitEvent({ type: 'flag', gameId: gid, by: loser, clockMs })
  }

  /** Arm the first-move abort watchdog (host-only). Fires if the side that owes
   *  the move (white pre-move-1, or black pre-reply) never plays within grace. */
  private armAbortWatchdog(): void {
    this.clearAbortWatchdog()
    if (this.over || this.plyCount >= 2) return
    this.abortTimer = setTimeout(() => {
      this.abortTimer = null
      if (this.over || this.suspended || this.plyCount >= 2) return
      const gid = this.gameId
      this.endGame()
      this.sendWire({ t: 'abort', gameId: gid, reason: 'no-first-move' })
      this.emitEvent({ type: 'abort', gameId: gid, reason: 'no-first-move' })
    }, MP_TIMING.FIRST_MOVE_ABORT_MS)
  }

  private clearAbortWatchdog(): void {
    if (this.abortTimer) {
      clearTimeout(this.abortTimer)
      this.abortTimer = null
    }
  }

  /** Mark the game decided and stop the clock/abort watchdogs. */
  private endGame(): void {
    this.over = true
    this.inGame = false
    this.toMove = null
    this.turnStartedAt = 0
    this.suspended = false
    this.clearFlagTimer()
    this.clearAbortWatchdog()
    this.clearGraceTimer()
  }

  // ---- inbound move / clock ---------------------------------------------------

  /** A 'move' wire message arrived. Host: it's the guest's move — enforce turn +
   *  ply order, time it with lag forgiveness, relay the authoritative clocks.
   *  Guest: it's the host's authoritative move. Both drop out-of-order plies. */
  private onWireMove(ply: number, uci: string, clockMs: Clocks): void {
    if (this.over || this.suspended) return
    // Reject duplicates / out-of-order: the next expected ply is plyCount.
    if (ply !== this.plyCount) return

    if (this.role === 'host') {
      // The guest moved. Enforce turn order; ignore their clock hint entirely.
      if (this.toMove !== this.guestColor) return
      // Kernel seam (v4): the wire no longer proves legality (moves are opaque
      // game-codec strings) — ask the registered validator before committing.
      // Silently drop an illegal move, exactly like an out-of-turn one. The
      // guest's optimistic local state stays consistent because ITS store also
      // validated locally; a truly malicious guest just gets ignored.
      if (this.moveValidator && !this.moveValidator(this.moves, uci)) return
      // Lag compensation: forgive up to min(rtt/2, 250ms) of the guest's debit.
      const lagForgive = Math.min(this.rtt / 2, MP_TIMING.MAX_LAG_FORGIVE_MS)
      const committedPly = this.plyCount
      const authoritative = this.commitMove(this.guestColor as MpColor, uci, lagForgive)
      if (!authoritative) return // guest flagged; flagLoss already fired
      // Surface the guest's move to the HOST renderer with authoritative clocks…
      this.emitEvent({ type: 'move', gameId: this.gameId, ply: committedPly, uci, clockMs: authoritative })
      // …and ack the guest with the authoritative clocks (D5) so its clock updates.
      if (this.toMove) {
        this.sendWire({ t: 'clock', gameId: this.gameId, clockMs: authoritative, toMove: this.toMove })
      }
    } else {
      // Guest: trust the host's move AND its authoritative clocks (clockMs is
      // authoritative host→guest). Record it, adopt the clocks, flip the turn.
      this.clocks = { ...clockMs }
      this.recordMove(uci)
      this.toMove = this.plyCount % 2 === 0 ? 'white' : 'black'
      this.emitEvent({ type: 'move', gameId: this.gameId, ply, uci, clockMs: { ...clockMs } })
    }
  }

  /** Host→guest clock ack/resync. Guest mirrors the authoritative snapshot. */
  private onWireClock(clockMs: Clocks, toMove: MpColor): void {
    if (this.role === 'host' || this.over) return
    this.clocks = { ...clockMs }
    this.toMove = toMove
    this.emitEvent({ type: 'clock', gameId: this.gameId, clockMs: { ...clockMs }, toMove })
  }

  private onStart(gameId: number, yourColor: MpColor, config: MpGameConfig, name: string | undefined): void {
    // Guest adopts its color + the game config + host id/name; clocks arrive via
    // move/clock events. Ignore a re-`start` for a game we already have.
    if (this.role !== 'guest') return
    this.config = config
    this.myColor = yourColor
    this.gameId = gameId
    if (name) this.peerName = name
    this.beginGame()
    this.emitEvent({
      type: 'start',
      gameId,
      yourColor,
      config,
      ...(this.peerName ? { opponentName: this.peerName } : {})
    })
  }

  // ---- inbound draw ----------------------------------------------------------

  private onWireDrawOffer(): void {
    if (this.over) return
    // Host enforces the offer gate against the OFFERER (the peer) on receipt.
    if (this.role === 'host') {
      const offerer: MpColor = this.guestColor ?? 'black'
      if (this.plyCount < 2 || this.plyCount < this.drawBlockedUntilPly[offerer]) {
        // Illegal offer (too early / in cooldown): silently drop it.
        return
      }
    }
    this.incomingDrawOffer = true
    this.emitEvent({ type: 'drawOffer' })
  }

  private onWireDrawDecline(): void {
    // The peer declined OUR offer. Clear it and honor our own cooldown.
    if (!this.outgoingDrawOffer) return
    this.outgoingDrawOffer = false
    if (this.myColor) this.drawBlockedUntilPly[this.myColor] = this.plyCount + 20
    this.emitEvent({ type: 'drawDecline' })
  }

  // ---- inbound flag / abort / gameOver ---------------------------------------

  private applyFlag(by: MpColor, clockMs: Clocks): void {
    if (this.over) return
    this.clocks = { ...clockMs }
    this.endGame()
    this.emitEvent({ type: 'flag', gameId: this.gameId, by, clockMs: { ...clockMs } })
  }

  private applyAbort(reason: 'no-first-move' | 'manual'): void {
    if (this.over) return
    const gid = this.gameId
    this.endGame()
    this.emitEvent({ type: 'abort', gameId: gid, reason })
  }

  private applyGameOver(result: '1-0' | '0-1' | '1/2-1/2', reason: string): void {
    if (this.over) return
    const gid = this.gameId
    this.endGame()
    this.emitEvent({ type: 'gameOver', gameId: gid, result, reason })
  }

  // ---- rematch ----------------------------------------------------------------

  private onWireRematchOffer(): void {
    this.peerRematchOffer = true
    this.emitEvent({ type: 'rematchOffer' })
    // Host starts only on MUTUAL offers (its own click counts as its offer).
    if (this.role === 'host' && this.myRematchOffer) this.startRematchAsHost()
  }

  private startRematchAsHost(): void {
    if (!this.config || !this.myColor || !this.guestColor) return
    // Swap colors; keep the same time control; bump the gameId.
    const newHostColor: MpColor = this.myColor === 'white' ? 'black' : 'white'
    const newGuestColor: MpColor = newHostColor === 'white' ? 'black' : 'white'
    this.myColor = newHostColor
    this.guestColor = newGuestColor
    this.gameId += 1
    this.beginGame()
    this.sendWire({ t: 'rematchStart', gameId: this.gameId, yourColor: newGuestColor })
    this.emitEvent({ type: 'rematchStart', gameId: this.gameId, yourColor: newHostColor })
  }

  private onRematchStart(gameId: number, yourColor: MpColor): void {
    if (!this.config || this.role !== 'guest') return
    this.myColor = yourColor
    this.gameId = gameId
    this.beginGame()
    this.emitEvent({ type: 'rematchStart', gameId, yourColor })
  }

  // ============================================================================
  // Suspend / resume (T2/T3/T4/L6/D9/MP-06)
  // ============================================================================

  /** The peer went silent mid-game: pause the clock, keep the room open, remember
   *  the ghost, and grant a speed-scaled grace window. */
  private enterSuspend(): void {
    if (!this.inGame || this.over || this.suspended || !this.peerId) return
    this.suspended = true
    this.ghostPeerId = this.peerId
    this.peerId = null
    // Pause the authoritative clock: freeze how much of the current turn elapsed
    // by folding it into the remaining time, and stop turnStartedAt from ticking.
    if (this.role === 'host' && this.timed && this.toMove && this.turnStartedAt > 0) {
      const elapsed = Math.max(0, this.now() - this.turnStartedAt)
      this.clocks[this.toMove] = Math.max(0, this.clocks[this.toMove] - elapsed)
      this.turnStartedAt = 0
    }
    this.clearFlagTimer()
    this.clearAbortWatchdog()
    this.stopHeartbeat()
    const graceMs = this.graceMs()
    this.emitEvent({ type: 'peer-away', graceMs })
    this.clearGraceTimer()
    this.graceTimer = setTimeout(() => {
      this.graceTimer = null
      if (!this.suspended) return
      // Grace expired: the peer is gone. Unbind and let the UI claim/abort.
      this.ghostPeerId = null
      this.suspended = false
      this.handshaked = false
      this.emitEvent({ type: 'peer-left' })
    }, graceMs)
  }

  private graceMs(): number {
    const category = timeControlCategory(this.currentTimeControl())
    return MP_TIMING.GRACE_BY_CATEGORY[category] ?? MP_TIMING.GRACE_BY_CATEGORY.Rapid
  }

  /** The ghost peer re-appeared (onPeerJoin or a hello): restore the bond. The
   *  host answers the peer's resumeReq with a resync; the clock resumes on the
   *  first fresh turn tick (turnStartedAt re-anchored below). */
  private rebond(id: string): void {
    if (!this.suspended) return
    this.clearGraceTimer()
    this.suspended = false
    this.peerId = id
    this.ghostPeerId = null
    this.lastPeerMsgAt = this.now()
    this.handshaked = false // re-run a lightweight handshake
    // Re-anchor the running clock so paused time isn't charged.
    if (this.role === 'host' && this.timed && this.toMove && this.plyCount >= 1) {
      this.turnStartedAt = this.now()
    }
    this.startHeartbeat()
    this.emitEvent({ type: 'peer-back' })
    // Greet again so the peer's transport re-learns us and the handshake reruns.
    this.sendWire(this.makeOurHello())
    // Host re-arms its watchdogs for the resumed position.
    if (this.role === 'host') {
      if (this.plyCount < 2) this.armAbortWatchdog()
      this.armFlagTimer()
    }
  }

  /** Host: a rejoining guest asks to resume. Answer with the full authoritative
   *  snapshot (NEVER a fresh start — never wipe a live game, D9). */
  private onResumeReq(gameId: number, havePly: number): void {
    if (this.role !== 'host' || this.over || !this.guestColor) return
    if (gameId !== this.gameId) return
    void havePly
    this.sendWire({
      t: 'resync',
      gameId: this.gameId,
      moves: [...this.moves],
      clockMs: { ...this.clocks },
      toMove: this.toMove ?? 'white',
      yourColor: this.guestColor,
      // v4: carry the game config (kind + options) so a resumed guest can
      // rebuild any game, not just chess.
      ...(this.config ? { config: this.config } : {})
    })
  }

  /** Guest: adopt the host's authoritative snapshot after a rebond. Re-anchors the
   *  move list, clocks, and turn to the host's truth. The store keeps its own board
   *  across the suspend (it's a module singleton, L2), and the suspend froze BOTH
   *  sides so no moves were missed — so resync only needs to re-authority the clocks
   *  (delivered via a `clock` event). `moves`/plyCount are re-synced defensively. */
  private onResync(
    gameId: number,
    moves: string[],
    clockMs: Clocks,
    toMove: MpColor,
    yourColor: MpColor,
    config?: MpGameConfig
  ): void {
    if (this.role !== 'guest') return
    // v4: adopt the game config when it rides along (kind + options survive the
    // JSON round-trip untouched — z.unknown() passes the blob through).
    if (config) this.config = config
    this.gameId = gameId
    this.moves = [...moves]
    this.plyCount = moves.length
    this.clocks = { ...clockMs }
    this.toMove = toMove
    this.myColor = yourColor
    this.over = false
    this.inGame = true
    this.suspended = false
    // Surface the authoritative clocks + turn immediately (peer-back already fired
    // on rebond); the store re-anchors its clock snapshot from this.
    this.emitEvent({ type: 'clock', gameId, clockMs: { ...clockMs }, toMove })
  }

  private clearGraceTimer(): void {
    if (this.graceTimer) {
      clearTimeout(this.graceTimer)
      this.graceTimer = null
    }
  }

  // ============================================================================
  // Heartbeat + teardown
  // ============================================================================

  private startHeartbeat(): void {
    this.stopHeartbeat()
    this.lastPeerMsgAt = this.now()
    this.lastTickAt = this.now()
    this.missedEvals = 0
    this.heartbeatTimer = setInterval(() => this.heartbeatTick(), MP_TIMING.HEARTBEAT_MS)
  }

  /** One heartbeat tick (D4): SEND a ping first, then evaluate. Self-stall
   *  forgiveness — if our own gap since last fire was > 2× cadence we were
   *  suspended, so skip judgment this tick. Declare peer-away only after ≥15s
   *  silence AND two consecutive failed evaluations. */
  private heartbeatTick(): void {
    if (!this.peerId || this.suspended || this.over) return
    const now = this.now()
    const tickGap = now - this.lastTickAt
    this.lastTickAt = now
    // Ping FIRST, even if we're about to judge. The ping timestamp deliberately
    // uses REAL monotonic time, not the injectable game clock: RTT is a network
    // property, and measuring it with the injected clock lets a test's (or any
    // future consumer's) clock advance masquerade as network lag — a real
    // Windows-CI failure where a heartbeat straddling a fake 500ms advance
    // produced rtt=500 and silently forgave 250ms of think time.
    this.sendWire({ t: 'ping', ts: performance.now() })
    // Self-stall: our own timer was frozen (throttled/suspended machine). Give the
    // peer a clean slate — don't punish them for OUR gap.
    if (tickGap > 2 * MP_TIMING.HEARTBEAT_MS) {
      this.lastPeerMsgAt = now
      this.missedEvals = 0
      return
    }
    const silence = now - this.lastPeerMsgAt
    if (silence > MP_TIMING.PEER_SILENCE_MS) {
      this.missedEvals += 1
      if (this.missedEvals >= 2) {
        // Two strikes: the peer is away. Enter the suspend/grace path.
        this.enterSuspend()
      }
    } else {
      this.missedEvals = 0
    }
  }

  private onPong(sentTs: number): void {
    // Real monotonic time, matching the ping timestamp — see heartbeatTick.
    const sample = Math.max(0, performance.now() - sentTs)
    // Exponential moving average so a single spike doesn't dominate forgiveness.
    this.rtt = this.rtt === 0 ? sample : this.rtt * 0.7 + sample * 0.3
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

  /** The peer vanished mid-session. During a live undecided game this enters the
   *  suspend/grace path (keep the room open for a rebond); otherwise (pre-game or
   *  post-game) it's a clean peer-left. */
  private onPeerGone(): void {
    if (!this.peerId) return
    if (this.inGame && !this.over && !this.suspended) {
      this.enterSuspend()
      return
    }
    this.peerId = null
    this.handshaked = false
    this.clearFlagTimer()
    this.clearAbortWatchdog()
    this.stopHeartbeat()
    this.emitEvent({ type: 'peer-left' })
  }

  /** Fatal error path: report and tear down the transport (session stays inert
   *  until the UI calls leave()). */
  private fail(message: string): void {
    this.emitEvent({ type: 'error', message })
    this.teardownTransport()
    this.peerId = null
    this.ghostPeerId = null
    this.handshaked = false
    this.suspended = false
    this.clearAllTimers()
  }

  private teardownTransport(): void {
    this.clearAllTimers()
    if (this.transport) {
      // Remember the room's settle so a same-code rejoin can await it (T7).
      this.pendingClose = this.transport.closed ?? null
      try {
        this.transport.close()
      } catch {
        /* ignore */
      }
      this.transport = null
    }
  }

  private clearAllTimers(): void {
    this.clearDiscoveryTimer()
    this.clearHandshakeWatchdog()
    this.clearFlagTimer()
    this.clearAbortWatchdog()
    this.clearGraceTimer()
    this.stopHeartbeat()
  }

  /** Await the previous room's full teardown before re-creating a transport on the
   *  same code (T7); bounded so a stuck close can't wedge host()/join() forever. */
  private async awaitPreviousClose(): Promise<void> {
    const pending = this.pendingClose
    this.pendingClose = null
    if (!pending) return
    await Promise.race([pending, new Promise<void>((res) => setTimeout(res, 1_500))])
  }

  /** Reset all per-game state so a session instance can be reused across a
   *  host()/join() cycle. Clears all timers FIRST (D10). Does NOT clear event
   *  listeners (subscription lifetime belongs to the subscriber — L1). */
  private resetState(): void {
    this.clearAllTimers()
    this.role = null
    this.config = null
    this.myName = undefined
    this.peerName = undefined
    this.myColor = null
    this.peerId = null
    this.ghostPeerId = null
    this.handshaked = false
    this.gameId = 0
    this.guestColor = null
    this.clocks = { white: 0, black: 0 }
    this.toMove = null
    this.turnStartedAt = 0
    this.plyCount = 0
    this.moves = []
    this.over = false
    this.inGame = false
    this.suspended = false
    this.incomingDrawOffer = false
    this.outgoingDrawOffer = false
    this.myRematchOffer = false
    this.peerRematchOffer = false
    this.drawBlockedUntilPly = { white: 0, black: 0 }
    this.lastPeerMsgAt = 0
    this.lastTickAt = 0
    this.missedEvals = 0
    this.rtt = 0
  }
}
