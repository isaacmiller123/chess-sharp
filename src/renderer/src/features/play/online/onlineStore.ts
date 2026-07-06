// onlineStore — the app-lifetime home of a live internet game (the B1 fix).
//
// This is a PLAIN module singleton with NO React imports: it runs unchanged in
// bare node against a mocked `mp` (scripts/test-mp-store.mjs). The React binding
// lives in useOnlineGame.ts (useSyncExternalStore); OnlineTab becomes a pure view
// that reads this store and never touches the session on unmount. Navigating away
// and back re-attaches to the SAME live game (MP-01/L2).
//
// The store subscribes to `mp.onEvent` exactly ONCE at module init, for the
// lifetime of the process. Everything the session reports (§8 MpEvent v3) flows
// through the single event pump below; every action the UI can take is a method
// on the exported `onlineStore`. State is a single immutable snapshot object —
// every mutation replaces it wholesale and notifies subscribers.
//
// Authority split (unchanged from the session design): the HOST owns clocks and
// flagging; this store never runs a clock of its own for adjudication. It DOES
// interpolate a display clock (Clock.tsx) from the authoritative snapshot the
// session hands it, and it applies moves locally with chessops purely to render
// the board and to detect board-terminal endings (→ mp.gameEnded).

import type { MpColor, MpEvent, MpGameConfig, MpClocks } from '@shared/types'
import { mp } from './mpClient'
import {
  applyMove,
  hasInsufficientMaterial,
  outcome,
  turnColor,
  INITIAL_FEN,
  type Color,
  type GameResult,
  type AppliedMove
} from '../../../chess/chess'
import type { SoundName } from '../../../sound/SoundManager'
import { treeToPgn } from '../../../state/pgn'
import type { TreeNode } from '../../../state/gameTree'
import type { GameViewBanner } from '../GameView'

// ---------------------------------------------------------------------------
// Sound seam (documented for builder-ui).
//
// The store must run in bare node (test-mp-store.mjs), but the SoundManager
// module pulls Vite-only `import.meta.glob` at import time — so the store can NOT
// statically import it. Instead the store computes WHICH sound to play and hands
// the name to a registered sink. The UI wires the real sink once, from a
// top-level effect:
//   onlineStore.setSoundSink((name) => getSoundManager().play(name))
// Until registered (and always in bare node) the sink is a silent no-op.
//
// The low-time one-shot is NOT here — it lives in Clock.tsx's onLowTime hook,
// which the view gates on settings.lowTimeWarning.
// ---------------------------------------------------------------------------

/** Pure move→sound mapping (mirrors sound/useSound.soundForMove; inlined so the
 *  store stays free of the Vite-glob SoundManager import). */
function soundNameForMove(m: { san: string; capture: boolean; check: boolean }): SoundName {
  if (m.san.includes('=')) return 'promote'
  if (m.san.startsWith('O-O')) return 'castle'
  if (m.check) return 'check'
  if (m.capture) return 'capture'
  return 'move'
}

// ---------------------------------------------------------------------------
// Public state shape (§4, verbatim contract with builder-ui).
// ---------------------------------------------------------------------------

export interface OnlineClock {
  /** Remaining ms per side at `atMono`. */
  snapshot: { white: number; black: number }
  /** performance.now() instant the snapshot was taken. */
  atMono: number
  /** Side currently burning time (interpolate it down), or null when idle. */
  running: 'white' | 'black' | null
}

export interface OnlineState {
  phase: 'idle' | 'hosting' | 'connecting' | 'game'
  code: string | null
  config: MpGameConfig | null
  gameId: number
  myColor: 'white' | 'black'
  orientation: 'white' | 'black'
  moves: string[] // UCIs from startpos
  fen: string // derived incrementally (chessops)
  plyCount: number
  clock: OnlineClock | null
  banner: GameViewBanner | null
  drawOffered: boolean // the OPPONENT has an offer standing to us
  drawSent: boolean // WE have an offer standing to them
  drawBlockedUntilPly: number // our next allowed offer ply (cooldown / pre-ply-2)
  rematchOffered: boolean // the opponent offered a rematch
  rematchSent: boolean // we offered a rematch
  peerAway: { deadlineMono: number } | null
  peerLeft: boolean
  canAbort: boolean // plyCount < 2 && live
  opponentName: string // default 'Opponent'
  netStage: 'relays' | 'searching' | 'connecting' | null
  relays: { connected: number; total: number } | null
  error: string | null
}

/** Live settings the store needs but cannot read from a React context. Pushed by
 *  the UI via `setSettings` whenever they change (see useOnlineGame). */
export interface OnlineSettingsSnapshot {
  username: string
  /** Gate for the one-shot low-time sound (settings.lowTimeWarning). */
  lowTimeWarning: boolean
}

// ---------------------------------------------------------------------------
// Constants (mirrors the session's §2 rules so both sides agree locally).
// ---------------------------------------------------------------------------

/** After a decline, the SAME side waits this many plies before re-offering. */
const DRAW_COOLDOWN_PLIES = 20
/** No draw offers before this ply (game is still abortable) — lichess parity. */
const DRAW_MIN_PLY = 2
const OPPONENT_DEFAULT = 'Opponent'

// ---------------------------------------------------------------------------
// PGN name helpers (MP-09).
// ---------------------------------------------------------------------------

/** Sanitize a display name for headers/UI: trim, strip control chars, cap 24. */
function cleanName(raw: string | undefined | null): string {
  if (!raw) return ''
  // eslint-disable-next-line no-control-regex
  return raw.replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 24)
}

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

// ---------------------------------------------------------------------------
// The store.
// ---------------------------------------------------------------------------

const FRESH: OnlineState = {
  phase: 'idle',
  code: null,
  config: null,
  gameId: 0,
  myColor: 'white',
  orientation: 'white',
  moves: [],
  fen: INITIAL_FEN,
  plyCount: 0,
  clock: null,
  banner: null,
  drawOffered: false,
  drawSent: false,
  drawBlockedUntilPly: DRAW_MIN_PLY,
  rematchOffered: false,
  rematchSent: false,
  peerAway: null,
  peerLeft: false,
  canAbort: false,
  opponentName: OPPONENT_DEFAULT,
  netStage: null,
  relays: null,
  error: null
}

class OnlineStore {
  private state: OnlineState = FRESH
  private readonly subscribers = new Set<() => void>()

  /** Live settings snapshot (UI pushes it). Defaults keep bare-node tests sane. */
  private settings: OnlineSettingsSnapshot = { username: 'User', lowTimeWarning: true }

  /**
   * SAN for each committed ply (parallel to state.moves), so we can build a PGN
   * without a React game tree. Kept off the public snapshot (render doesn't need
   * it) and rebuilt on every fresh game / resync.
   */
  private sans: string[] = []
  /** True once this game's result has been persisted (save-exactly-once). */
  private saved = false

  /** Registered sound sink (UI wires it to getSoundManager().play). No-op until
   *  registered — and always in bare node, where the sound module can't load. */
  private soundSink: ((name: SoundName) => void) | null = null

  constructor() {
    // Subscribe to the session ONCE, for the app's lifetime. Never unsubscribed.
    mp.onEvent((ev) => this.onEvent(ev))
  }

  // ---- store plumbing ------------------------------------------------------

  getState(): OnlineState {
    return this.state
  }

  subscribe(cb: () => void): () => void {
    this.subscribers.add(cb)
    return () => this.subscribers.delete(cb)
  }

  /** Replace the snapshot and notify. All mutations funnel through here. */
  private set(patch: Partial<OnlineState>): void {
    this.state = { ...this.state, ...patch }
    for (const cb of this.subscribers) cb()
  }

  /** Push the live settings snapshot (username, low-time gate). UI-driven. */
  setSettings(s: OnlineSettingsSnapshot): void {
    this.settings = { username: s.username, lowTimeWarning: s.lowTimeWarning }
  }

  /** Register the sound sink (UI: getSoundManager().play). See the seam note at
   *  the top of this file. Passing null detaches it. */
  setSoundSink(sink: ((name: SoundName) => void) | null): void {
    this.soundSink = sink
  }

  // ---- derived helpers -----------------------------------------------------

  /** Whether a live, undecided game is in progress (board is playable). */
  private get live(): boolean {
    return this.state.phase === 'game' && this.state.banner === null && !this.state.peerLeft
  }

  private get myTurn(): Color {
    return turnColor(this.state.fen)
  }

  private sound(name: SoundName): void {
    this.soundSink?.(name)
  }

  // ---- clock snapshot ------------------------------------------------------

  /** Adopt an authoritative clock snapshot, timestamped to now (monotonic). The
   *  running side is whoever is on move, unless the game is over/idle (null). */
  private setClock(clocks: MpClocks, running: 'white' | 'black' | null): void {
    this.set({
      clock: { snapshot: { white: clocks.white, black: clocks.black }, atMono: performance.now(), running }
    })
  }

  // ---- game lifecycle ------------------------------------------------------

  /** Begin (or restart via rematch) a fresh game. Resets board + offer flags. */
  private beginGame(gameId: number, yourColor: MpColor, cfg: MpGameConfig, opponentName?: string): void {
    this.sans = []
    this.saved = false
    const initial = cfg.tc.initialMs
    this.set({
      phase: 'game',
      config: cfg,
      gameId,
      myColor: yourColor,
      orientation: yourColor,
      moves: [],
      fen: INITIAL_FEN,
      plyCount: 0,
      // Clocks are IDLE at start (§2 first-move rule): running = null until
      // white's first move commits.
      clock: initial > 0 ? { snapshot: { white: initial, black: initial }, atMono: performance.now(), running: null } : null,
      banner: null,
      drawOffered: false,
      drawSent: false,
      drawBlockedUntilPly: DRAW_MIN_PLY,
      rematchOffered: false,
      rematchSent: false,
      peerAway: null,
      peerLeft: false,
      canAbort: true, // plyCount 0 < 2 && live
      opponentName: cleanName(opponentName) || OPPONENT_DEFAULT,
      error: null
    })
    this.sound('gameStart')
  }

  /** Append a committed ply to the store's move/SAN/fen state. */
  private pushMove(m: AppliedMove): void {
    this.sans.push(m.san)
    const moves = [...this.state.moves, m.uci]
    this.set({ moves, fen: m.fen, plyCount: moves.length, canAbort: moves.length < 2 && this.live })
  }

  /** Raise the end banner + persist (once) + play the end sound. `save` gates
   *  persistence: aborted / abandoned-without-claim games raise a banner (or
   *  none) but are NOT saved. */
  private endGame(result: GameResult | null, reason: string, opts: { save: boolean; title?: string }): void {
    if (this.state.banner) return // already ended
    if (result) {
      const banner: GameViewBanner = {
        result,
        reason,
        outcomeForUser: outcomeForUser(result, this.state.myColor),
        ...(opts.title ? { title: opts.title } : {})
      }
      this.set({ banner, clock: this.frozenClock(), canAbort: false })
      if (opts.save) this.saveFinished(result)
    } else {
      // Aborted / neutral end: a titled banner with a synthetic draw result so
      // the view can render it, but never saved (opts.save must be false).
      const banner: GameViewBanner = {
        result: '1/2-1/2',
        reason,
        outcomeForUser: 'draw',
        title: opts.title ?? 'Game aborted'
      }
      this.set({ banner, clock: this.frozenClock(), canAbort: false })
    }
    this.sound('gameEnd')
  }

  /** Restart interpolation from the frozen snapshot: the side on move resumes
   *  burning from now. No-op when idle/over or untimed. */
  private resumedClock(): OnlineClock | null {
    const c = this.state.clock
    if (!c || !this.live) return c
    return { snapshot: { ...c.snapshot }, atMono: performance.now(), running: turnColor(this.state.fen) }
  }

  /** Freeze the current clock (stop interpolating) at its displayed value. */
  private frozenClock(): OnlineClock | null {
    const c = this.state.clock
    if (!c) return null
    if (c.running === null) return c
    const now = performance.now()
    const elapsed = Math.max(0, now - c.atMono)
    const snap = { ...c.snapshot }
    snap[c.running] = Math.max(0, snap[c.running] - elapsed)
    return { snapshot: snap, atMono: now, running: null }
  }

  /** Persist a finished game exactly once (≥2 plies + a real result). Aborted /
   *  unclaimed-abandoned games never reach here with save:true. */
  private saveFinished(result: GameResult): void {
    if (this.saved) return
    if (this.state.plyCount < 2) return // not a real game — don't archive
    this.saved = true
    const uc = this.state.myColor
    const me = cleanName(this.settings.username) || 'Anonymous'
    const opp = this.state.opponentName || OPPONENT_DEFAULT
    const whiteName = uc === 'white' ? me : opp
    const blackName = uc === 'white' ? opp : me
    const headers: Record<string, string> = {
      Event: 'Online game',
      Site: 'Chess#',
      Date: yyyymmdd(),
      White: whiteName,
      Black: blackName,
      Result: result
    }
    const pgn = treeToPgn(this.buildTree(), headers)
    // Best-effort; never block the banner on a failed save. (window.api is
    // undefined in bare-node tests — guarded.)
    void (globalThis as { window?: typeof window }).window?.api?.games
      ?.save({
        pgn,
        whiteName,
        blackName,
        userColor: uc,
        result,
        opponentKind: 'human',
        opponentLabel: opp,
        source: 'online'
      })
      .catch(() => {})
  }

  /** Rebuild a minimal linear game tree (root → mainline) from moves+sans so we
   *  can reuse the shared PGN writer without holding a React tree. */
  private buildTree(): TreeNode {
    const root: TreeNode = { id: 'r', ply: 0, fen: INITIAL_FEN, parent: null, children: [] }
    let node = root
    let fen = INITIAL_FEN
    for (let i = 0; i < this.state.moves.length; i++) {
      const uci = this.state.moves[i]
      const m = applyMove(fen, uci.slice(0, 2), uci.slice(2, 4), uciPromo(uci))
      if (!m) break // defensive: stop at the first inconsistency
      fen = m.fen
      const child: TreeNode = {
        id: `n${i + 1}`,
        ply: i + 1,
        move: { san: this.sans[i] ?? m.san, uci: m.uci, capture: m.capture, check: m.check },
        fen: m.fen,
        parent: node,
        children: []
      }
      node.children.push(child)
      node = child
    }
    return root
  }

  // ==========================================================================
  // Event pump — one entry per §8 MpEvent v3 variant.
  // ==========================================================================

  private onEvent(ev: MpEvent): void {
    switch (ev.type) {
      case 'net':
        this.set({ netStage: ev.state, ...(ev.relays ? { relays: ev.relays } : {}) })
        return

      case 'peer-joined':
        // Host only; 'start' follows immediately. Nothing to render on its own.
        return

      case 'start':
        this.beginGame(ev.gameId, ev.yourColor, ev.config, ev.opponentName)
        return

      case 'move':
        this.onRemoteMove(ev.gameId, ev.ply, ev.uci, ev.clockMs)
        return

      case 'clock':
        // Host ack after committing our move, and periodic re-sync. Trust it.
        if (ev.gameId !== this.state.gameId) return
        this.setClock(ev.clockMs, this.live ? ev.toMove : null)
        return

      case 'flag':
        this.onFlag(ev.gameId, ev.by, ev.clockMs)
        return

      case 'abort':
        if (ev.gameId !== this.state.gameId) return
        // No result, nothing saved. Neutral banner.
        this.endGame(null, 'Game aborted', {
          save: false,
          title: ev.reason === 'no-first-move' ? 'Game aborted — no first move' : 'Game aborted'
        })
        return

      case 'gameOver':
        if (ev.gameId !== this.state.gameId) return
        // Board-terminal ending confirmed by the peer. Adopt its result/reason.
        this.endGame(ev.result, ev.reason, { save: true })
        return

      case 'drawOffer':
        if (!this.live) return
        this.set({ drawOffered: true })
        this.sound('gameStart') // notify-style cue for an incoming offer
        return

      case 'drawDecline':
        // Our standing offer was declined — clear it; UI shows "declined".
        this.set({ drawSent: false })
        return

      case 'drawAccept':
        this.endGame('1/2-1/2', 'by agreement', { save: true })
        return

      case 'resign':
        // Genuine resignation only (flags come via 'flag'). Winner = other side.
        this.endGame(ev.by === 'white' ? '0-1' : '1-0', 'by resignation', { save: true })
        return

      case 'rematchOffer':
        if (!this.state.banner) return // only meaningful post-game
        this.set({ rematchOffered: true })
        this.sound('gameStart')
        return

      case 'rematchDecline':
        this.set({ rematchSent: false, rematchOffered: false })
        return

      case 'rematchStart':
        // Host committed a mutual rematch: fresh game, swapped colors, gameId+1.
        this.beginGame(ev.gameId, ev.yourColor, this.state.config as MpGameConfig, this.state.opponentName)
        return

      case 'peer-away':
        // Live undecided game froze: pause clock, start the reconnect countdown.
        this.set({
          peerAway: { deadlineMono: performance.now() + ev.graceMs },
          clock: this.frozenClock()
        })
        return

      case 'peer-back':
        // Resume immediately: re-arm the display clock for the side on move so it
        // ticks again without waiting for the host's next re-sync (which corrects
        // any drift). The snapshot value is the frozen one — we only restart it.
        this.set({
          peerAway: null,
          clock: this.resumedClock()
        })
        return

      case 'peer-left':
        // Grace expired: opponent is gone. UI offers Claim victory / Abort.
        this.set({ peerAway: null, peerLeft: true })
        return

      case 'error':
        // In-game errors surface in the status strip; lobby errors in the alert
        // row. Either way, never silent. A pre-game error drops toward the menu.
        this.set({ error: ev.message, ...(this.state.phase === 'game' ? {} : { phase: 'idle' }) })
        return
    }
  }

  /** Apply a move the REMOTE peer made (drop stale gameId / out-of-order ply). */
  private onRemoteMove(gameId: number, ply: number, uci: string, clockMs: MpClocks): void {
    if (gameId !== this.state.gameId) return
    if (ply !== this.state.plyCount) return // duplicate / out-of-order — drop (D8)
    const m = applyMove(this.state.fen, uci.slice(0, 2), uci.slice(2, 4), uciPromo(uci))
    if (!m) return // illegal against our position — ignore rather than corrupt
    this.pushMove(m)
    this.sound(soundNameForMove(m))
    // Adopt the authoritative clocks; the side now on move is the running side.
    this.setClock(clockMs, this.live ? turnColor(m.fen) : null)
    this.detectTerminal(m.fen)
  }

  /** After any local/remote move: if the board itself ended, tell the session so
   *  it stops clocks + broadcasts gameOver, and raise our banner. */
  private detectTerminal(fen: string): void {
    const out = outcome(fen)
    if (!out.over || !out.result) return
    const reason = out.reason ?? 'checkmate'
    mp.gameEnded(out.result, reason)
    this.endGame(out.result, reason, { save: true })
  }

  /** A side flagged (§2 Flag). Adjudicate the lichess insufficient-material rule
   *  on the SAME position both stores hold, so results agree. */
  private onFlag(gameId: number, by: MpColor, clockMs: MpClocks): void {
    if (gameId !== this.state.gameId) return
    // Zero the flagged side's displayed clock from the message.
    this.setClock(clockMs, null)
    const winnerColor: Color = by === 'white' ? 'black' : 'white'
    // If the side that DIDN'T flag can never mate, it's a draw on time.
    if (hasInsufficientMaterial(this.state.fen, winnerColor)) {
      this.endGame('1/2-1/2', 'time out — insufficient material', { save: true })
    } else {
      this.endGame(by === 'white' ? '0-1' : '1-0', 'on time', { save: true })
    }
  }

  // ==========================================================================
  // Actions (§4) — everything the UI can invoke.
  // ==========================================================================

  async host(cfg: MpGameConfig): Promise<void> {
    this.set({ ...FRESH, phase: 'hosting', config: cfg, error: null })
    try {
      const res = await mp.host(cfg)
      this.set({ code: res.code, phase: 'hosting' })
    } catch (err) {
      this.set({ phase: 'idle', error: err instanceof Error ? err.message : 'Could not start hosting.' })
    }
  }

  async join(code: string): Promise<void> {
    this.set({ ...FRESH, phase: 'connecting', error: null })
    try {
      const res = await mp.join(code)
      if (!res.ok) {
        this.set({ phase: 'idle', error: res.error ?? 'Could not join that game.' })
      }
      // On success, wait for the 'start' event to flip us into 'game'.
    } catch (err) {
      this.set({ phase: 'idle', error: err instanceof Error ? err.message : 'Could not join that game.' })
    }
  }

  /** Optimistically apply + send OUR move; roll back if the session rejects it
   *  (D6). Blocked while it's not our turn, the game is over, or the peer is away. */
  async playMove(uci: string): Promise<void> {
    if (!this.live || this.state.peerAway) return
    if (this.myTurn !== this.state.myColor) return
    const m = applyMove(this.state.fen, uci.slice(0, 2), uci.slice(2, 4), uciPromo(uci))
    if (!m) return

    // A move answers any pending draw exchange (offer withdrawn / declined).
    const priorMoves = this.state.moves
    const priorFen = this.state.fen
    const priorClock = this.state.clock
    const priorPly = this.state.plyCount

    this.set({ drawOffered: false, drawSent: false })
    this.pushMove(m)
    this.sound(soundNameForMove(m))

    const res = await mp.sendMove(uci)
    if (!res.ok) {
      // Roll back the optimistic apply — the session refused it.
      this.sans.pop()
      this.set({
        moves: priorMoves,
        fen: priorFen,
        clock: priorClock,
        plyCount: priorPly,
        canAbort: priorPly < 2 && this.live
      })
      return
    }
    // Committed. Optimistically flip the display clock to the side now on move
    // (§4: "snapshot updates … AND after our own committed move") so our own
    // clock stops and the opponent's starts immediately — the host's authoritative
    // 'clock' ack (or the mirrored 'move') re-anchors any drift. After ANY move
    // the side on move (turnColor(m.fen)) is running: white's own first move ends
    // the idle phase and starts black's clock, exactly per the §2 first-move rule.
    // We keep the current snapshot values (the host owns debit/increment) and only
    // re-time which side burns.
    if (this.state.clock && this.live) {
      const c = this.frozenClock()
      if (c) this.setClock(c.snapshot, turnColor(m.fen))
    }
    // The board-terminal check runs on the confirmed position.
    this.detectTerminal(m.fen)
  }

  async resign(): Promise<void> {
    if (!this.live) return
    await mp.resign()
    // The session echoes a 'resign' event back, which raises our banner.
  }

  async offerDraw(): Promise<void> {
    if (!this.live) return
    if (this.state.drawOffered) {
      await this.acceptDraw()
      return
    }
    if (this.state.plyCount < DRAW_MIN_PLY) return
    if (this.state.plyCount < this.state.drawBlockedUntilPly) return
    this.set({ drawSent: true, drawBlockedUntilPly: this.state.plyCount + DRAW_COOLDOWN_PLIES })
    await mp.offerDraw()
  }

  async acceptDraw(): Promise<void> {
    if (!this.live || !this.state.drawOffered) return
    await mp.acceptDraw()
    // 'drawAccept' echoes back to end the game on both sides.
  }

  async declineDraw(): Promise<void> {
    if (!this.state.drawOffered) return
    this.set({ drawOffered: false })
    await mp.declineDraw()
  }

  async offerRematch(): Promise<void> {
    if (!this.state.banner || this.state.peerLeft) return
    this.set({ rematchSent: true })
    await mp.offerRematch()
  }

  async declineRematch(): Promise<void> {
    if (!this.state.rematchOffered) return
    this.set({ rematchOffered: false })
    await mp.declineRematch()
  }

  /** Abort while abortable (plyCount < 2 && live). No result, nothing saved. */
  async abort(): Promise<void> {
    if (!this.state.canAbort) return
    await mp.abort()
    this.endGame(null, 'Game aborted', { save: false })
  }

  /** Claim victory after the opponent's grace expired (peer-left). Records a win. */
  async claimVictory(): Promise<void> {
    if (!this.state.peerLeft || this.state.banner) return
    await mp.claimVictory()
    const result: GameResult = this.state.myColor === 'white' ? '1-0' : '0-1'
    this.endGame(result, 'opponent left the game', { save: true })
  }

  /** The ONLY caller of mp.leave(). Tears the session down + resets the store. */
  leave(): void {
    mp.leave()
    this.sans = []
    this.saved = false
    this.set({ ...FRESH })
  }

  flip(): void {
    this.set({ orientation: this.state.orientation === 'white' ? 'black' : 'white' })
  }

  dismissError(): void {
    this.set({ error: null })
  }
}

/** Promotion role char from a UCI string, if any (e.g. 'e7e8q' → 'queen'). */
function uciPromo(uci: string): 'queen' | 'rook' | 'bishop' | 'knight' | undefined {
  if (uci.length <= 4) return undefined
  switch (uci[4]) {
    case 'q':
      return 'queen'
    case 'r':
      return 'rook'
    case 'b':
      return 'bishop'
    case 'n':
      return 'knight'
    default:
      return undefined
  }
}

/** The process-wide singleton. Import this anywhere; the React binding is
 *  useOnlineGame(). Subscribes to `mp` at construction, for the app's lifetime. */
export const onlineStore = new OnlineStore()
