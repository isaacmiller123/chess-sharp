// Wire v6 witness core (spec §3 entanglement): the witness-side game follower
// as a PURE state machine, plus the player-side incremental move-chain
// verifier mpSession uses — ONE implementation of the chain rule on both ends
// of the wire. This module is the mp↔accounts bridge: it MAY import
// segment.ts (the single source of signature truth); wire.ts stays standalone.
//
// Platform-neutral like wire.ts: ZERO node imports, no DOM globals, no ambient
// time or randomness — the witness's clock is INJECTED (`now`), so the module
// bundles into the renderer, a future witness daemon, and bare-node tests
// unchanged. Nothing here touches a transport: feed(msg) returns the messages
// to `emit` and the caller sends them.

import type { WireMsg } from './wire'
import { ed25519, toB64u, verifySigB64u } from '@shared/accounts/hash'
import {
  moveSigBytes,
  transcriptDigest,
  witnessClockBytes,
  witnessEndBytes,
  signWitnessEnd,
  makeWitnessedResult,
  type SignedMove,
} from '@shared/accounts/segment'
import type { B64u } from '@shared/accounts/types'
import type { WitnessedResultRecord } from '@shared/accounts/storage/types'

// ---------------------------------------------------------------------------
// Shared signing conventions (mpSession + witness must agree on these bytes)
// ---------------------------------------------------------------------------

/** Clock snapshot as it appears INSIDE signature bytes ({w,b}, integers). */
export interface SigClock {
  w: number
  b: number
}

/** Wire clocks are floats ({white,black} ms out of performance.now() math);
 * cjson-v1 signature bytes admit integers only. ONE rounding rule, applied by
 * signer and verifier to the SAME wire value (JSON round-trips numbers
 * exactly), keeps the signed bytes identical on both ends. */
export function sigClock(clockMs: { white: number; black: number }): SigClock {
  return { w: Math.round(clockMs.white), b: Math.round(clockMs.black) }
}

/** Terminal reasons for wire messages that carry none (resign/flag). The esig
 * signer and the witness both fold the reason into transcriptDigest, so the
 * string must be a shared convention, not free text. */
export const REASON_RESIGN = 'resign'
export const REASON_FLAG = 'flag'

type MpResult = '1-0' | '0-1' | '1/2-1/2'

// ---------------------------------------------------------------------------
// Player-side incremental verifier (used by mpSession AND the witness)
// ---------------------------------------------------------------------------

/**
 * Incremental view of the §3 interleaved move-sig chain: plies must be
 * contiguous from 0, movers alternate from `firstMover`, every sig verifies
 * against the mover's device key over moveSigBytes(game, ply, move, clockMs,
 * prevSig). `check` verifies WITHOUT advancing (so a host can verify before
 * committing a move that may still flag); `accept` verifies AND advances.
 */
export class MoveChainVerifier {
  private prev: B64u | undefined
  private readonly list: SignedMove[] = []

  constructor(
    private readonly game: B64u,
    private readonly keys: { w: B64u; b: B64u },
    private readonly firstMover: 'w' | 'b' = 'w',
  ) {}

  /** Committed (verified) plies so far. */
  get plies(): number {
    return this.list.length
  }

  /** The sig the NEXT move must chain over (undefined before ply 0). */
  get prevSig(): B64u | undefined {
    return this.prev
  }

  /** The verified SignedMove list (transcript material). */
  get moves(): readonly SignedMove[] {
    return this.list
  }

  /** The color that signs ply `ply`. */
  moverOf(ply: number): 'w' | 'b' {
    return (ply % 2 === 0) === (this.firstMover === 'w') ? 'w' : 'b'
  }

  /** Verify one move against the chain head without advancing. Returns the
   *  failure reason, or null when it verifies. */
  check(ply: number, move: string, clockMs: SigClock, sig: B64u): string | null {
    if (ply !== this.list.length) return `out-of-order ply ${ply} (expected ${this.list.length})`
    // moveSigBytes → canonicalBytes THROWS on an unencodable clock (non-safe
    // integer, -0, NaN — the wire clock schema is float-permissive for the
    // unsigned v5 path, so a signed move can still carry e.g. 1e21). Fail
    // CLOSED: a bad move is a verification failure the caller tears down on,
    // never an uncaught crash on the signed inbound path.
    let bytes: Uint8Array
    try {
      bytes = moveSigBytes(this.game, ply, move, clockMs, this.prev)
    } catch {
      return `unencodable move at ply ${ply}`
    }
    if (!verifySigB64u(sig, bytes, this.keys[this.moverOf(ply)])) return `bad move signature at ply ${ply}`
    return null
  }

  /** check() + advance the chain head on success. */
  accept(ply: number, move: string, clockMs: SigClock, sig: B64u): string | null {
    const err = this.check(ply, move, clockMs, sig)
    if (err) return err
    this.list.push({ ply, move, clockMs: { w: clockMs.w, b: clockMs.b }, sig })
    this.prev = sig
    return null
  }

  /** Advance the chain head with a move whose signature the caller ALREADY
   *  verified via check() against THIS same head with no intervening mutation
   *  (the host peeks a guest move before commit, then advances it after — the
   *  commit doesn't touch the chain). Skips the redundant ed25519 verify but
   *  still enforces ply order defensively. Returns the failure reason or null.
   *  NEVER call this on an unchecked move — it does not verify the signature. */
  advanceChecked(ply: number, move: string, clockMs: SigClock, sig: B64u): string | null {
    if (ply !== this.list.length) return `out-of-order ply ${ply} (expected ${this.list.length})`
    this.list.push({ ply, move, clockMs: { w: clockMs.w, b: clockMs.b }, sig })
    this.prev = sig
    return null
  }

  /** Drop the last accepted move, restoring the head to the prior ply. Used by
   *  the guest to discard an OPTIMISTICALLY-signed move the host never committed
   *  (it flagged the guest on it), so the guest's transcript matches the host's
   *  and the witness's. Returns the dropped SignedMove, or null if empty. */
  rollbackLast(): SignedMove | null {
    const dropped = this.list.pop() ?? null
    this.prev = this.list.length ? this.list[this.list.length - 1].sig : undefined
    return dropped
  }
}

// ---------------------------------------------------------------------------
// Witness core
// ---------------------------------------------------------------------------

export interface WitnessCoreOpts {
  /** Witness device signing private key (raw 32 bytes). */
  wpriv: Uint8Array
  /** b64u public signing key (what wclk/wend sigs verify against). */
  wkey: B64u
  /** b64u witness account root (rides in the WitnessedResultRecord). */
  wroot: B64u
  /** Injected wall clock (unix ms) — the witness's OWN time authority. */
  now: () => number
  /** Countersign the clock stream every this many verified plies. */
  wclkEveryPlies?: number
}

export interface WitnessGameInit {
  /** Wire gameId the emitted wclk/wend messages carry. */
  gameId: number
  /** The host-minted global game key (start.gameKey). */
  gameKey: B64u
  /** Both players' identities by color — roots from start.players, device
   *  signing keys from the players' hellos. */
  players: { w: { root: B64u; key: B64u }; b: { root: B64u; key: B64u } }
  /** Which color moves first (config.game.firstMover; chess = 'w'). */
  firstMover?: 'w' | 'b'
}

export interface WitnessFeedResult {
  ok: boolean
  /** Messages the caller should send to BOTH players (wclk/wend). */
  emit?: WireMsg[]
  error?: string
}

interface WitnessTerminal {
  result: MpResult
  reason: string
  transcript: B64u
  plies: number
  wts: number
  wendSig: B64u
}

/**
 * Follows one signed game move-by-move: verifies each move's sig + chain
 * incrementally, countersigns the clock stream every `wclkEveryPlies` plies,
 * and on a terminal — a gameOver/resign/flag carrying a VALID esig, or a flag
 * it observed itself (tick) from clocks it countersigned — signs the stream
 * end and can build the §3 witnessed result for both players' chains.
 *
 * A chain violation POISONS the follower: the witness refuses to countersign
 * anything further for that game (every later feed returns the sticky error).
 * A merely-invalid terminal does NOT poison — the witness may still adjudicate
 * an observed flag (the rage-quit path).
 */
export class WitnessCore {
  private readonly wpriv: Uint8Array
  private readonly wkey: B64u
  private readonly wroot: B64u
  private readonly now: () => number
  private readonly every: number

  private g: WitnessGameInit | null = null
  private verifier: MoveChainVerifier | null = null
  /** Each side's OWN last self-signed remaining clock (ms), or null before that
   *  side has moved. tick() times the to-move side against ITS OWN value only —
   *  never the opponent's echo of it. The mover controls BOTH fields of the
   *  clock it signs (the witness sees the guest's claimed clocks verbatim), so
   *  trusting the opponent's echo let a mover zero the honest player's clock and
   *  force a witnessed false-flag against them (finding A). A side under-claiming
   *  its OWN clock only hurts itself. */
  private ownClock: { w: number | null; b: number | null } = { w: null, b: null }
  /** Witness time (unix ms) the last verified move was fed at = when the
   *  to-move side's turn started. */
  private lastMoveWts = 0
  private terminal: WitnessTerminal | null = null
  private aborted = false
  private poisonedWith: string | null = null
  /** A DRAW is witnessed only once BOTH players have countersigned it (neither
   *  is a "loser" whose lone sig suffices), collected across the two forwarded
   *  gameOver messages. A losing player can produce only its OWN esig, so it
   *  cannot unilaterally escape a loss into a witnessed draw (finding C). */
  private drawSigned: { w: boolean; b: boolean } = { w: false, b: false }
  /** The result named by a DECISIVE terminal whose esig was absent/invalid
   *  (recorded WITHOUT poisoning, so a pure rage-quit tick can still adjudicate).
   *  Once set, tick() must never finalize a CONTRADICTING decisive result — else
   *  a loser who omits its esig lets tick() flag the to-move WINNER (finding D). */
  private claimedDecisive: MpResult | null = null

  constructor(opts: WitnessCoreOpts) {
    this.wpriv = opts.wpriv
    this.wkey = opts.wkey
    this.wroot = opts.wroot
    this.now = opts.now
    this.every = opts.wclkEveryPlies ?? 4
  }

  /** Start following one game. Call again for a rematch (fresh gameKey). */
  init(init: WitnessGameInit): void {
    this.g = init
    this.verifier = new MoveChainVerifier(init.gameKey, {
      w: init.players.w.key,
      b: init.players.b.key,
    }, init.firstMover ?? 'w')
    this.ownClock = { w: null, b: null }
    this.lastMoveWts = 0
    this.terminal = null
    this.aborted = false
    this.poisonedWith = null
    this.drawSigned = { w: false, b: false }
    this.claimedDecisive = null
  }

  /** The verified transcript so far. */
  get moves(): readonly SignedMove[] {
    return this.verifier ? this.verifier.moves : []
  }

  /** Terminal stream signature for BOTH players' SegmentPayload.wstream, or
   *  null while the game is still live (or ended without a witnessed result). */
  wstream(): { wkey: B64u; sig: B64u } | null {
    return this.terminal ? { wkey: this.wkey, sig: this.terminal.wendSig } : null
  }

  /** The §3 witnessed result record (rage-quit denial), or null pre-terminal. */
  buildWitnessedResult(): WitnessedResultRecord | null {
    if (!this.g || !this.terminal) return null
    return makeWitnessedResult(this.wpriv, this.wroot, this.wkey, {
      game: this.g.gameKey,
      players: { w: this.g.players.w.root, b: this.g.players.b.root },
      result: this.terminal.result,
      reason: this.terminal.reason,
      transcript: this.terminal.transcript,
      plies: this.terminal.plies,
      wts: this.terminal.wts,
    })
  }

  /** Feed one observed wire message. `nowWts` overrides the injected clock. */
  feed(msg: WireMsg, nowWts?: number): WitnessFeedResult {
    if (!this.g || !this.verifier) return { ok: false, error: 'witness not initialized' }
    if (this.poisonedWith) return { ok: false, error: this.poisonedWith }
    if (this.terminal || this.aborted) return { ok: true } // settled; late traffic is noise
    const wts = Math.round(nowWts ?? this.now())

    switch (msg.t) {
      case 'start':
      case 'rematchStart':
        // Consistency only — the caller inits explicitly. A different (or
        // absent) game key means we are NOT following this game: poison.
        if (msg.gameKey !== this.g.gameKey) return this.poison('start does not carry our game key')
        return { ok: true }

      case 'move': {
        if (msg.gameId !== this.g.gameId) return { ok: true } // stale game — ignore
        if (msg.sig === undefined) return this.poison(`unsigned move at ply ${msg.ply} in a signed game`)
        const clock = sigClock(msg.clockMs)
        const err = this.verifier.accept(msg.ply, msg.uci, clock, msg.sig)
        if (err) return this.poison(err)
        // Record only the MOVER's OWN self-signed remaining; the mover's echo of
        // the opponent's clock is ignored (see ownClock / finding A).
        this.ownClock[this.verifier.moverOf(msg.ply)] = clock[this.verifier.moverOf(msg.ply)]
        this.lastMoveWts = wts
        if (this.verifier.plies % this.every === 0) {
          const ply = this.verifier.plies - 1
          const sig = toB64u(ed25519.sign(witnessClockBytes(this.g.gameKey, ply, clock, wts), this.wpriv))
          return {
            ok: true,
            emit: [{ t: 'wclk', gameId: this.g.gameId, ply, clockMs: { white: clock.w, black: clock.b }, wts, sig }],
          }
        }
        return { ok: true }
      }

      case 'gameOver':
        if (msg.gameId !== this.g.gameId) return { ok: true }
        return this.onTerminal(msg.result, msg.reason, msg.esig, wts)
      case 'resign':
        if (msg.gameId !== this.g.gameId) return { ok: true }
        return this.onTerminal(msg.by === 'white' ? '0-1' : '1-0', REASON_RESIGN, msg.esig, wts)
      case 'flag':
        if (msg.gameId !== this.g.gameId) return { ok: true }
        return this.onTerminal(msg.by === 'white' ? '0-1' : '1-0', REASON_FLAG, msg.esig, wts)

      case 'abort':
        if (msg.gameId !== this.g.gameId) return { ok: true }
        this.aborted = true // no result to witness
        return { ok: true }

      default:
        return { ok: true } // clock/draw/heartbeat chatter — nothing to countersign
    }
  }

  /**
   * Observed-flag check (the §3 rage-quit closer): from the clocks the witness
   * itself countersigned, the side to move has flagged once more witness time
   * passed since the last verified move than that side had remaining. Plain
   * Fischer only (byo-yomi adjudication is an A6 refinement — see report).
   * Call periodically; emits the wend when a flag is observed.
   */
  tick(nowWts?: number): WitnessFeedResult {
    if (!this.g || !this.verifier || this.terminal || this.aborted || this.poisonedWith) return { ok: true }
    // A decisive terminal was already claimed (esig absent/invalid, so not
    // finalized): the game's direction is asserted. Do NOT let an observed flag
    // finalize a possibly-contradicting result — better to leave no witnessed
    // result than to flag the winner (finding D). A pure rage-quit (no terminal
    // at all) leaves claimedDecisive null, so tick still adjudicates it.
    if (this.claimedDecisive !== null) return { ok: true }
    // A draw was countersigned by at least one side: the game is ending in a
    // draw (real once BOTH sign; unresolved if only one). Either way, halt
    // observed-flag adjudication so tick() can't mint a phantom flag-loss over
    // an agreed/claimed draw (finding I). A lone malicious draw esig halting
    // into no-result is strictly safer than an inverted flag.
    if (this.drawSigned.w || this.drawSigned.b) return { ok: true }
    const wts = Math.round(nowWts ?? this.now())
    const toMove = this.verifier.moverOf(this.verifier.plies)
    // Time the to-move side against ITS OWN last self-signed clock. null = that
    // side has not moved yet (incl. a first-move no-show), so there is no
    // self-signed budget and the witness cannot adjudicate a flag — that case is
    // an ABORT the host watchdog + witness abort-mirror close, not a loss.
    const budget = this.ownClock[toMove]
    if (budget === null) return { ok: true }
    if (wts - this.lastMoveWts <= budget) return { ok: true }
    return this.finalize(toMove === 'w' ? '0-1' : '1-0', REASON_FLAG, wts)
  }

  // ---- internals -------------------------------------------------------------

  private poison(error: string): WitnessFeedResult {
    this.poisonedWith = error
    return { ok: false, error }
  }

  /**
   * A terminal wire message. Signature rules by result kind, both rooted in the
   * identity-blindness of witnessEndBytes (it covers only game/result/plies/
   * transcript, never the signer), so any accepted key is a FULL authorization:
   *
   *  - DECISIVE (1-0 / 0-1): only the LOSER's device key. Accepting either key
   *    (as the first version did) let a winner mint a witness-blessed loss for
   *    the opponent (black sends resign{by:'white'} with BLACK's own 0-1 esig).
   *    The loser's countersignature — or its absence — IS the §3 rage-quit
   *    pivot. An absent/invalid esig is NOT poison (an observed flag can still
   *    adjudicate a pure rage-quit) but it DOES record the claimed result so
   *    tick() can never later finalize a CONTRADICTING one (finding D: a loser
   *    who omits its esig must not let tick() flag the to-move winner).
   *  - DRAW (1/2-1/2): neither party is a loser whose lone sig suffices, and
   *    accepting a single key let a losing player unilaterally escape into a
   *    witness-blessed draw (finding C). A draw is witnessed only once BOTH
   *    players have countersigned it — a losing player can produce only its own
   *    esig. The two esigs arrive across the host's own mirror + its forward of
   *    the peer's gameOver (board draws: both engines detect it; agreed draws:
   *    both sides sign — see mpSession acceptDraw / drawAccept).
   */
  private onTerminal(result: MpResult, reason: string, esig: string | undefined, wts: number): WitnessFeedResult {
    if (!this.g || !this.verifier) return { ok: false, error: 'witness not initialized' }
    if (reason.length < 1 || reason.length > 64) return { ok: false, error: 'terminal reason out of bounds' }
    const loser = result === '1-0' ? 'b' : result === '0-1' ? 'w' : null

    if (loser === null) return this.onDrawTerminal(result, reason, esig, wts)

    // DECISIVE: only the loser's key. Record the claimed result on any
    // absent/invalid esig (without poisoning) to fence tick().
    if (esig === undefined) {
      this.claimedDecisive = result
      return { ok: false, error: 'terminal message lacks a countersignature' }
    }
    const transcript = transcriptDigest(this.g.gameKey, this.verifier.moves, result, reason)
    const bytes = witnessEndBytes(this.g.gameKey, result, this.verifier.plies, transcript)
    if (!verifySigB64u(esig, bytes, this.g.players[loser].key)) {
      this.claimedDecisive = result
      return { ok: false, error: 'invalid terminal countersignature' }
    }
    return this.finalize(result, reason, wts)
  }

  /** A 1/2-1/2 terminal — witnessed only once BOTH players' esigs are in. */
  private onDrawTerminal(result: MpResult, reason: string, esig: string | undefined, wts: number): WitnessFeedResult {
    if (!this.g || !this.verifier) return { ok: false, error: 'witness not initialized' }
    if (esig === undefined) return { ok: false, error: 'draw terminal lacks a countersignature' }
    const transcript = transcriptDigest(this.g.gameKey, this.verifier.moves, result, reason)
    const bytes = witnessEndBytes(this.g.gameKey, result, this.verifier.plies, transcript)
    // Which player countersigned this draw? (The reason string is cosmetic to
    // the security property — a loser can produce only ITS OWN esig regardless.)
    let signer: 'w' | 'b' | null = null
    if (verifySigB64u(esig, bytes, this.g.players.w.key)) signer = 'w'
    else if (verifySigB64u(esig, bytes, this.g.players.b.key)) signer = 'b'
    if (signer === null) return { ok: false, error: 'invalid draw countersignature' }
    this.drawSigned[signer] = true
    if (!this.drawSigned.w || !this.drawSigned.b) return { ok: true } // waiting for the other side
    return this.finalize(result, reason, wts)
  }

  private finalize(result: MpResult, reason: string, wts: number): WitnessFeedResult {
    if (!this.g || !this.verifier) return { ok: false, error: 'witness not initialized' }
    const plies = this.verifier.plies
    const transcript = transcriptDigest(this.g.gameKey, this.verifier.moves, result, reason)
    const { sig } = signWitnessEnd(this.wpriv, this.wkey, this.g.gameKey, result, plies, transcript)
    this.terminal = { result, reason, transcript, plies, wts, wendSig: sig }
    return {
      ok: true,
      emit: [{ t: 'wend', gameId: this.g.gameId, result, reason, plies, transcript, sig }],
    }
  }
}
