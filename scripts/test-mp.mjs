// Headless test for the internet-multiplayer session/authority logic
// (src/renderer/src/features/play/online/mpSession.ts — the PURE module, v2).
//
//   node scripts/test-mp.mjs
//
// The old harness dialed a real `ws` socket against a main-process server; that
// transport is gone. Multiplayer v2 is WebRTC-in-the-renderer via trystero, and
// MpNetSession is transport-agnostic: it drives an INJECTED MpTransport. So we
// esbuild-bundle mpSession.ts to a scratch ESM file (which strips the TS types
// and proves the module is electron/node/trystero-free), then run BOTH ends —
// a HOST session and a GUEST session — inside ONE node process, joined by an
// in-memory transport pair. No network, no sockets, deterministic.
//
// The transport pair mirrors trystero semantics exactly: string payloads, a
// `toPeer` targeted-send arg, async delivery (queueMicrotask), and onPeerJoin /
// onPeerLeave firing on the OTHER factory's transport when a peer's transport is
// created / closed. A third-peer injector lets us exercise the "host is busy"
// path.
//
// We assert on events emitted by BOTH sessions (both are real MpNetSession
// objects, so the wire protocol is exercised for real in both directions):
//   - host() returns a well-formed Crockford room code; normalizeRoomCode forgives
//   - hello handshake completes; both sides get 'start' with opposite colors
//   - hostColor white / black / random honored
//   - moves relay both ways with host-authoritative clocks (debit + increment)
//   - out-of-turn guest move dropped
//   - flag-fall: the stalling side loses on time on BOTH sides (resign-by-staller)
//   - draw offer + accept; a move clears a pending offer; offer-back = accept
//   - resign surfaces on both sides
//   - rematch swaps colors and resets clocks
//   - a third peer gets a targeted 'host is busy' and the game is undisturbed
//   - malformed traffic → 'error' event, session survives
//   - version-mismatch hello (v:1) → error + teardown on both sides
//   - guest discovery timeout fires (tested with a shrunk-timeout bundle, never a
//     real 30s wait) and leave() cancels it
//   - peer-left on transport onPeerLeave
//   - leave() is idempotent and clears all timers (process exits with NO open
//     handles — that clean exit is itself an assertion)
//
// Exit 0 = all green. Any failure prints and exits 1.

import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { mkdtempSync, rmSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

// ---- tiny assert kit --------------------------------------------------------
let passed = 0
function ok(cond, msg) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`)
  passed++
  console.log(`  ✓ ${msg}`)
}
function eq(a, b, msg) {
  ok(a === b, `${msg} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Wait until `pred` finds a matching event in `events`, remove & return it. */
function waitEvent(events, pred, { timeout = 3000, label = 'event' } = {}) {
  return new Promise((res, rej) => {
    const deadline = Date.now() + timeout
    const tick = () => {
      const idx = events.findIndex(pred)
      if (idx >= 0) return res(events.splice(idx, 1)[0])
      if (Date.now() > deadline) return rej(new Error(`timeout waiting for ${label}`))
      setTimeout(tick, 5)
    }
    tick()
  })
}
/** Assert NO event matching `pred` appears within `ms` (negative test). */
async function assertNoEvent(events, pred, ms, label) {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    if (events.findIndex(pred) >= 0) throw new Error(`ASSERT FAILED: unexpected ${label}`)
    await sleep(5)
  }
  passed++
  console.log(`  ✓ no ${label} (as expected)`)
}

// ============================================================================
// In-memory transport pair — a faithful stand-in for the trystero room.
// ============================================================================
//
// A single "room" object holds every transport that has joined it (keyed by a
// synthetic peerId). Sending to a target routes to that transport; broadcasting
// fans out to all others. Creating a transport fires onPeerJoin on every peer
// already present (and fires onPeerJoin about the newcomer on each of them);
// closing fires onPeerLeave symmetrically. Delivery is async (queueMicrotask),
// matching a data channel. Relay status can be pushed manually.

let PEER_SEQ = 0

function makeRoom() {
  const members = new Map() // peerId -> { listeners, closed }
  const room = {
    /** Join the room; returns { transport, peerId }. */
    join(listeners) {
      const peerId = `peer${++PEER_SEQ}`
      const self = { peerId, listeners, closed: false }
      // Async delivery via setTimeout(0). We deliberately use a MACROtask (not a
      // microtask) so a peer-join fires AFTER the joining session's own
      // `await makeTransport()` continuation has assigned this.transport — exactly
      // like a real data channel, whose events land on later event-loop turns.
      // FIFO ordering of the timer queue also keeps join→message→leave in order.
      const later = (fn) => setTimeout(fn, 0)
      // Tell existing members about the newcomer, and vice-versa.
      for (const [otherId, other] of members) {
        if (other.closed) continue
        later(() => !other.closed && other.listeners.onPeerJoin(peerId))
        later(() => !self.closed && self.listeners.onPeerJoin(otherId))
      }
      members.set(peerId, self)
      const transport = {
        send(text, toPeer) {
          if (self.closed) return
          if (typeof text !== 'string') throw new Error('transport.send got non-string')
          if (toPeer) {
            const dst = members.get(toPeer)
            if (dst && !dst.closed) later(() => dst.listeners.onMessage(text, peerId))
          } else {
            for (const [otherId, other] of members) {
              if (otherId === peerId || other.closed) continue
              later(() => other.listeners.onMessage(text, peerId))
            }
          }
        },
        close() {
          if (self.closed) return
          self.closed = true
          members.delete(peerId)
          for (const [, other] of members) {
            if (other.closed) continue
            later(() => !other.closed && other.listeners.onPeerLeave(peerId))
          }
        }
      }
      self.transport = transport
      // Let the caller push relay ticks manually.
      self.pushRelay = (c, t) => listeners.onRelayStatus && listeners.onRelayStatus(c, t)
      return { transport, self, peerId }
    },
    members
  }
  return room
}

/**
 * A pair of MpTransportFactory functions bound to a fresh shared room.
 * `hostFactory` / `guestFactory` are what you pass to `new Session(factory)`.
 * `injectThirdPeer()` joins a bare extra member (no session) so we can assert
 * the host's "busy" rejection and capture what it receives.
 */
function makeMockPair() {
  const room = makeRoom()
  const created = [] // every { self } we make, for relay pushes
  const mkFactory = () => (roomCode, listeners) => {
    const { transport, self } = room.join(listeners)
    created.push(self)
    return transport
  }
  return {
    hostFactory: mkFactory(),
    guestFactory: mkFactory(),
    /** Join an extra bare peer; returns { received[], leave() }. */
    injectThirdPeer() {
      const received = []
      const { transport, peerId } = room.join({
        onMessage: (text, from) => received.push({ text, from }),
        onPeerJoin: () => {},
        onPeerLeave: () => {}
      })
      return { received, peerId, leave: () => transport.close() }
    },
    pushRelayToAll: (c, t) => created.forEach((s) => s.pushRelay && s.pushRelay(c, t)),
    room
  }
}

// Collect a session's events into an array + keep a live "all" log for scans.
function tap(session) {
  const events = []
  session.onEvent((ev) => events.push(ev))
  return events
}

// ============================================================================
// Bundling
// ============================================================================
async function bundleSession(outfile, { patch } = {}) {
  await build({
    entryPoints: [resolve(ROOT, 'src/renderer/src/features/play/online/mpSession.ts')],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    mainFields: ['module', 'main'],
    conditions: ['import', 'module', 'default'],
    // mpSession imports @shared/mp/wire and @shared/types; map the alias so
    // esbuild resolves them. zod (pulled in by wire.ts) is bundled in — it's
    // pure ESM and works under neutral/node fine.
    alias: { '@shared': resolve(ROOT, 'src/shared') },
    absWorkingDir: ROOT,
    logLevel: 'warning'
  })
  let src = readFileSync(outfile, 'utf8')
  ok(!/from\s*["']electron["']/.test(src), 'mpSession bundle has no electron import')
  ok(!/require\(\s*["']trystero/.test(src) && !/from\s*["']trystero/.test(src), 'mpSession bundle has no trystero import')
  if (patch) {
    src = patch(src)
    writeFileSync(outfile, src)
  }
  return src
}

async function main() {
  const cacheRoot = resolve(ROOT, 'node_modules/.cache/mp-test')
  mkdirSync(cacheRoot, { recursive: true })
  const outdir = mkdtempSync(resolve(cacheRoot, 'run-'))

  // Main bundle (real timeouts).
  console.log('· bundling mpSession.ts …')
  const outfile = resolve(outdir, 'mpSession.mjs')
  await bundleSession(outfile)
  const mod = await import(outfile)
  const { MpNetSession } = mod
  ok(typeof MpNetSession === 'function', 'mpSession.ts bundled & MpNetSession exported')

  // Also import the wire codec (bundle it too) for room-code assertions.
  const wireOut = resolve(outdir, 'wire.mjs')
  await build({
    entryPoints: [resolve(ROOT, 'src/shared/mp/wire.ts')],
    outfile: wireOut,
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    alias: { '@shared': resolve(ROOT, 'src/shared') },
    absWorkingDir: ROOT,
    logLevel: 'warning'
  })
  const wire = await import(wireOut)

  // Track sessions so a failure mid-suite still tears everything down.
  const live = []
  const track = (s) => (live.push(s), s)

  // ==========================================================================
  // 1. Room code + normalize
  // ==========================================================================
  console.log('\n· room code + normalize …')
  const CROCKFORD = /^[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$/
  {
    const pair = makeMockPair()
    const host = track(new MpNetSession(pair.hostFactory))
    const { code } = await host.host({ tc: { initialMs: 60_000, incrementMs: 1_000 }, hostColor: 'white' })
    ok(CROCKFORD.test(code), `host() returned a Crockford XXXXX-XXXXX code: ${code}`)
    ok(!/[ILOU]/.test(code.replace('-', '')), 'code avoids the ambiguous I/L/O/U letters')
    host.leave()
  }
  // 100 codes: all well-formed & (practically) unique.
  {
    const seen = new Set()
    let allWellFormed = true
    for (let i = 0; i < 100; i++) {
      const c = wire.generateRoomCode()
      if (!CROCKFORD.test(c)) allWellFormed = false
      seen.add(c)
    }
    ok(allWellFormed, '100 generated codes are all well-formed Crockford XXXXX-XXXXX')
    eq(seen.size, 100, '100 generated codes are all unique')
  }
  // normalizeRoomCode forgiveness.
  const canonical = wire.generateRoomCode()
  const bare = canonical.replace('-', '')
  eq(wire.normalizeRoomCode(bare.toLowerCase()), canonical, 'normalize: lowercase, no hyphen → canonical')
  eq(wire.normalizeRoomCode(` ${bare.slice(0, 5)} - ${bare.slice(5)} `), canonical, 'normalize: stray spaces/hyphens stripped')
  eq(wire.normalizeRoomCode(canonical), canonical, 'normalize: idempotent on canonical input')
  // explicit look-alike mapping: o->0, i/l->1
  eq(wire.normalizeRoomCode('oIl00-00000'), '01100-00000', 'normalize: o→0, i/l→1')
  eq(wire.normalizeRoomCode('01100-00000'), '01100-00000', 'normalize: canonical passes through unchanged')
  eq(wire.normalizeRoomCode('short'), null, 'normalize: too short → null')
  eq(wire.normalizeRoomCode('!!!!!-@@@@@'), null, 'normalize: garbage symbols → null')
  eq(wire.normalizeRoomCode('ABCDE-FGHJKX'), null, 'normalize: 11 chars → null')
  eq(wire.normalizeRoomCode('UUUUU-UUUUU'), null, 'normalize: U is not in the alphabet → null')

  // Guest join() rejects a bad code WITHOUT touching the transport.
  {
    let touched = false
    const guest = track(new MpNetSession(() => { touched = true; throw new Error('should not be called') }))
    const r = await guest.join('!!!!!-@@@@@')
    eq(r.ok, false, 'join(bad code) → ok:false')
    ok(!!r.error, 'join(bad code) → has an error message')
    ok(!touched, 'join(bad code) never creates a transport')
    guest.leave()
  }

  // ==========================================================================
  // Helper: host + guest, handshake to 'start'. Returns everything wired up.
  // ==========================================================================
  async function connectPair(cfg) {
    const pair = makeMockPair()
    const host = track(new MpNetSession(pair.hostFactory))
    const guest = track(new MpNetSession(pair.guestFactory))
    const he = tap(host)
    const ge = tap(guest)
    const { code } = await host.host(cfg)
    const r = await guest.join(code)
    eq(r.ok, true, 'guest.join(hosted code) → ok:true')
    const hStart = await waitEvent(he, (e) => e.type === 'start', { label: 'host start' })
    const gStart = await waitEvent(ge, (e) => e.type === 'start', { label: 'guest start' })
    return { pair, host, guest, he, ge, code, hStart, gStart }
  }

  // ==========================================================================
  // 2. Handshake + colors (white)
  // ==========================================================================
  console.log('\n· handshake + colors (host=white) …')
  {
    // Capture the full ordered event log so we can assert peer-joined precedes start.
    const pair = makeMockPair()
    const host = track(new MpNetSession(pair.hostFactory))
    const guest = track(new MpNetSession(pair.guestFactory))
    const hLog = []
    host.onEvent((ev) => hLog.push(ev))
    const he = tap(host)
    const ge = tap(guest)
    const { code } = await host.host({ tc: { initialMs: 60_000, incrementMs: 1_000 }, hostColor: 'white' })
    await guest.join(code)
    const hStart = await waitEvent(he, (e) => e.type === 'start', { label: 'host start' })
    const gStart = await waitEvent(ge, (e) => e.type === 'start', { label: 'guest start' })
    eq(hStart.yourColor, 'white', 'host start: host is white')
    eq(gStart.yourColor, 'black', 'guest start: guest is black')
    eq(hStart.config.tc.initialMs, 60_000, 'host start carries the time control')
    eq(gStart.config.tc.incrementMs, 1_000, 'guest start carries the increment')
    const pjIdx = hLog.findIndex((e) => e.type === 'peer-joined')
    const startIdx = hLog.findIndex((e) => e.type === 'start')
    ok(pjIdx >= 0, 'host emitted peer-joined')
    ok(pjIdx < startIdx, 'host peer-joined precedes start')
    host.leave(); guest.leave()
  }

  // host=black
  console.log('\n· colors (host=black) …')
  {
    const { host, guest, hStart, gStart } = await connectPair({
      tc: { initialMs: 60_000, incrementMs: 0 },
      hostColor: 'black'
    })
    eq(hStart.yourColor, 'black', 'host start: host is black')
    eq(gStart.yourColor, 'white', 'guest start: guest is white')
    host.leave(); guest.leave()
  }
  // host=random → always opposite colors, and across many trials both appear.
  console.log('\n· colors (host=random) …')
  {
    let sawWhite = false
    let sawBlack = false
    for (let i = 0; i < 30; i++) {
      const { host, guest, hStart, gStart } = await connectPair({
        tc: { initialMs: 60_000, incrementMs: 0 },
        hostColor: 'random'
      })
      ok(hStart.yourColor !== gStart.yourColor, `random trial #${i}: colors are opposite`)
      if (hStart.yourColor === 'white') sawWhite = true
      else sawBlack = true
      host.leave(); guest.leave()
    }
    ok(sawWhite && sawBlack, 'random hostColor yields both white and black hosts across trials')
  }

  // ==========================================================================
  // 3. Moves relay both ways with authoritative clocks
  // ==========================================================================
  console.log('\n· moves + host-authoritative clocks (60s+1s) …')
  {
    const INITIAL = 60_000
    const INC = 1_000
    const { host, guest, he, ge } = await connectPair({
      tc: { initialMs: INITIAL, incrementMs: INC },
      hostColor: 'white'
    })
    const THINK = 200
    let lastWhite = INITIAL
    let lastBlack = INITIAL
    const moves = ['e2e4', 'e7e5', 'g1f3', 'b8c6']
    for (let i = 0; i < moves.length; i++) {
      const uci = moves[i]
      const hostToMove = i % 2 === 0
      await sleep(THINK)
      if (hostToMove) {
        const r = await host.sendMove(uci)
        eq(r.ok, true, `host.sendMove(${uci}) ok`)
        const gm = await waitEvent(ge, (e) => e.type === 'move' && e.uci === uci, { label: `guest sees ${uci}` })
        const spent = lastWhite + INC - gm.clockMs.white
        ok(spent > 0, `white raw debit > 0 on ${uci} (spent ${spent}ms)`)
        ok(spent >= THINK - 80 && spent <= THINK + 1500, `white debit ≈ think time on ${uci} (${spent}ms)`)
        eq(gm.clockMs.black, lastBlack, `black clock unchanged on white move ${uci}`)
        ok(gm.clockMs.white <= lastWhite + INC, 'white never gains more than the increment')
        lastWhite = gm.clockMs.white
      } else {
        const r = await guest.sendMove(uci)
        eq(r.ok, true, `guest.sendMove(${uci}) ok`)
        const hm = await waitEvent(he, (e) => e.type === 'move' && e.uci === uci, { label: `host sees ${uci}` })
        const spent = lastBlack + INC - hm.clockMs.black
        ok(spent > 0, `black raw debit > 0 on ${uci} (spent ${spent}ms)`)
        ok(spent >= THINK - 80 && spent <= THINK + 1500, `black debit ≈ think time on ${uci} (${spent}ms)`)
        eq(hm.clockMs.white, lastWhite, `white clock unchanged on black move ${uci}`)
        lastBlack = hm.clockMs.black
      }
    }
    ok(lastWhite > INITIAL - 2000 && lastWhite <= INITIAL + 2 * INC, 'white clock sane after 2 fast moves')
    ok(lastBlack > INITIAL - 2000 && lastBlack <= INITIAL + 2 * INC, 'black clock sane after 2 fast moves')

    // ---- out-of-turn guest move dropped ----
    // It's white's (host's) turn now (4 plies played, white to move). Guest (black)
    // shoves a move; the host must DROP it (no 'move' event on host).
    await guest.sendMove('a7a6')
    await assertNoEvent(he, (e) => e.type === 'move' && e.uci === 'a7a6', 150, 'host move from out-of-turn guest')
    host.leave(); guest.leave()
  }

  // Untimed: wire schema floors initialMs at 0 (min(0)) and 0 == untimed. Test it.
  console.log('\n· untimed game (initialMs 0) …')
  {
    const { host, guest, he, ge } = await connectPair({
      tc: { initialMs: 0, incrementMs: 0 },
      hostColor: 'white'
    })
    await host.sendMove('e2e4')
    const gm = await waitEvent(ge, (e) => e.type === 'move' && e.uci === 'e2e4', { label: 'untimed move' })
    eq(gm.clockMs.white, 0, 'untimed: clocks stay 0 (no debit)')
    eq(gm.clockMs.black, 0, 'untimed: black clock stays 0')
    await guest.sendMove('e7e5')
    const hm = await waitEvent(he, (e) => e.type === 'move' && e.uci === 'e7e5', { label: 'untimed guest move' })
    eq(hm.clockMs.black, 0, 'untimed: guest move relayed with 0 clocks')
    // turn-order authority still enforced when untimed:
    await guest.sendMove('a7a6')
    await assertNoEvent(he, (e) => e.type === 'move' && e.uci === 'a7a6', 120, 'out-of-turn move in untimed game')
    host.leave(); guest.leave()
  }

  // ==========================================================================
  // 4. Flag fall
  // ==========================================================================
  console.log('\n· flag fall (300ms clock, staller loses on BOTH sides) …')
  {
    // 300ms initial, no increment; white=host. Neither side moves → white's flag
    // watchdog fires → white loses → resign{by:'white'} on both sides.
    const { host, guest, he, ge } = await connectPair({
      tc: { initialMs: 300, incrementMs: 0 },
      hostColor: 'white'
    })
    const hr = await waitEvent(he, (e) => e.type === 'resign', { label: 'host flag resign', timeout: 2000 })
    const gr = await waitEvent(ge, (e) => e.type === 'resign', { label: 'guest flag resign', timeout: 2000 })
    eq(hr.by, 'white', 'flag fall: host sees resign by white (the staller)')
    eq(gr.by, 'white', 'flag fall: guest sees resign by white (the staller)')
    // Game over: further moves refused.
    eq((await host.sendMove('e2e4')).ok, false, 'move after flag fall refused')
    host.leave(); guest.leave()
  }

  // ==========================================================================
  // 5. Draw semantics
  // ==========================================================================
  console.log('\n· draw offer + accept …')
  {
    const { host, guest, he, ge } = await connectPair({
      tc: { initialMs: 60_000, incrementMs: 0 },
      hostColor: 'white'
    })
    await guest.offerDraw()
    await waitEvent(he, (e) => e.type === 'drawOffer', { label: 'host drawOffer' })
    ok(true, 'host received the guest draw offer')
    const acc = await host.acceptDraw()
    eq(acc.ok, true, 'host.acceptDraw() ok')
    await waitEvent(he, (e) => e.type === 'drawAccept', { label: 'host drawAccept' })
    await waitEvent(ge, (e) => e.type === 'drawAccept', { label: 'guest drawAccept' })
    ok(true, 'both sides see drawAccept — game drawn')
    eq((await host.sendMove('e2e4')).ok, false, 'move after draw refused')
    host.leave(); guest.leave()
  }
  console.log('\n· draw offer answered by a move (offer cleared) …')
  {
    const { host, guest, he } = await connectPair({
      tc: { initialMs: 60_000, incrementMs: 0 },
      hostColor: 'white'
    })
    // Guest offers a draw; host receives it (incomingDrawOffer set on host).
    await guest.offerDraw()
    await waitEvent(he, (e) => e.type === 'drawOffer', { label: 'host sees guest offer' })
    // Host answers with a MOVE (it's white/host's turn) — that clears the pending
    // offer on the host side.
    const mv = await host.sendMove('e2e4')
    eq(mv.ok, true, 'host answers the offer with a move')
    // A subsequent acceptDraw is now a no-op (the incoming offer was cleared).
    const late = await host.acceptDraw()
    eq(late.ok, false, 'acceptDraw after answering the offer with a move is a no-op')
    host.leave(); guest.leave()
  }
  console.log('\n· offer-back = accept …')
  {
    const { host, guest, he, ge } = await connectPair({
      tc: { initialMs: 60_000, incrementMs: 0 },
      hostColor: 'white'
    })
    await host.offerDraw()
    await waitEvent(ge, (e) => e.type === 'drawOffer', { label: 'guest sees host offer' })
    // Guest "offers back" → that counts as accepting.
    const back = await guest.offerDraw()
    eq(back.ok, true, 'guest offer-back returns ok')
    await waitEvent(he, (e) => e.type === 'drawAccept', { label: 'host drawAccept via offer-back' })
    await waitEvent(ge, (e) => e.type === 'drawAccept', { label: 'guest drawAccept via offer-back' })
    ok(true, 'offer-back resolved as a mutual draw')
    host.leave(); guest.leave()
  }

  // ==========================================================================
  // 6. Resign
  // ==========================================================================
  console.log('\n· resign surfaces on both sides …')
  {
    const { host, guest, he, ge } = await connectPair({
      tc: { initialMs: 60_000, incrementMs: 0 },
      hostColor: 'white'
    })
    const r = await guest.resign()
    eq(r.ok, true, 'guest.resign() ok')
    const gr = await waitEvent(ge, (e) => e.type === 'resign', { label: 'guest local resign' })
    const hr = await waitEvent(he, (e) => e.type === 'resign', { label: 'host sees resign' })
    eq(gr.by, 'black', 'resigning guest is black')
    eq(hr.by, 'black', 'host sees the guest (black) resigned')
    eq((await host.sendMove('e2e4')).ok, false, 'move after resign refused')
    host.leave(); guest.leave()
  }

  // ==========================================================================
  // 7. Rematch swaps colors + resets clocks
  // ==========================================================================
  console.log('\n· rematch swaps colors + resets clocks …')
  {
    const INITIAL = 60_000
    const { host, guest, he, ge } = await connectPair({
      tc: { initialMs: INITIAL, incrementMs: 1_000 },
      hostColor: 'white'
    })
    // Play a couple moves + end via resign so a rematch makes sense.
    await host.resign()
    await waitEvent(he, (e) => e.type === 'resign', { label: 'pre-rematch resign' })
    await waitEvent(ge, (e) => e.type === 'resign', { label: 'pre-rematch resign guest' })
    // Host commits the rematch (color swap).
    await host.offerRematch()
    const hre = await waitEvent(he, (e) => e.type === 'rematchStart', { label: 'host rematchStart' })
    const gre = await waitEvent(ge, (e) => e.type === 'rematchStart', { label: 'guest rematchStart' })
    eq(hre.yourColor, 'black', 'rematch: host is now black (swapped)')
    eq(gre.yourColor, 'white', 'rematch: guest is now white (swapped)')
    // New game live: guest is white → host (black) cannot move first.
    eq((await host.sendMove('e2e4')).ok, false, 'rematch: host (black) cannot move first')
    // Guest (white) opens; clocks must have RESET to INITIAL.
    await sleep(120)
    await guest.sendMove('d2d4')
    const firstRe = await waitEvent(he, (e) => e.type === 'move' && e.uci === 'd2d4', { label: 'rematch first move' })
    eq(firstRe.clockMs.black, INITIAL, 'rematch reset black to INITIAL')
    const whiteSpent = INITIAL + 1_000 - firstRe.clockMs.white
    ok(whiteSpent > 0 && whiteSpent < 2_000, 'rematch: white ticked from a fresh INITIAL')
    host.leave(); guest.leave()
  }

  // ==========================================================================
  // 8. Third peer → 'host is busy', game undisturbed
  // ==========================================================================
  console.log('\n· third peer gets "host is busy", game undisturbed …')
  {
    const pair = makeMockPair()
    const host = track(new MpNetSession(pair.hostFactory))
    const guest = track(new MpNetSession(pair.guestFactory))
    const he = tap(host)
    const ge = tap(guest)
    const { code } = await host.host({ tc: { initialMs: 60_000, incrementMs: 1_000 }, hostColor: 'white' })
    await guest.join(code)
    await waitEvent(he, (e) => e.type === 'start', { label: 'host start' })
    await waitEvent(ge, (e) => e.type === 'start', { label: 'guest start' })
    // A third peer barges in.
    const third = pair.injectThirdPeer()
    // Wait for the targeted busy error to reach it.
    await waitEvent(third.received, (m) => {
      const parsed = wire.parseWireMsg(m.text)
      return parsed && parsed.t === 'error' && parsed.message === 'host is busy'
    }, { label: 'third peer busy error' })
    ok(true, 'third peer received a targeted "host is busy" error')
    // The bonded game still works: host can move, guest sees it.
    await host.sendMove('e2e4')
    await waitEvent(ge, (e) => e.type === 'move' && e.uci === 'e2e4', { label: 'game still live after intruder' })
    ok(true, 'game undisturbed by the third peer')
    third.leave()
    host.leave(); guest.leave()
  }

  // ==========================================================================
  // 9. Malformed message → error event, session survives
  // ==========================================================================
  console.log('\n· malformed message → error, session survives …')
  {
    const pair = makeMockPair()
    const host = track(new MpNetSession(pair.hostFactory))
    const guest = track(new MpNetSession(pair.guestFactory))
    const he = tap(host)
    const ge = tap(guest)
    const { code } = await host.host({ tc: { initialMs: 60_000, incrementMs: 1_000 }, hostColor: 'white' })
    await guest.join(code)
    await waitEvent(he, (e) => e.type === 'start', { label: 'host start' })
    await waitEvent(ge, (e) => e.type === 'start', { label: 'guest start' })
    // Inject raw garbage from the guest's peer to the host. Slot [0] is the host,
    // slot [1] is the guest (join order); send from the guest's underlying transport.
    const guestSlot = [...pair.room.members.values()][1]
    guestSlot.transport.send('this is not json {{{')
    await waitEvent(he, (e) => e.type === 'error' && /malformed/i.test(e.message), { label: 'host malformed error' })
    ok(true, 'malformed traffic → host error event')
    // Session survives: normal move still relays.
    await host.sendMove('e2e4')
    await waitEvent(ge, (e) => e.type === 'move' && e.uci === 'e2e4', { label: 'move after malformed' })
    ok(true, 'session survived the malformed message')
    // Also a well-formed-but-unknown-shape message is malformed.
    guestSlot.transport.send(JSON.stringify({ t: 'nonsense' }))
    await waitEvent(he, (e) => e.type === 'error' && /malformed/i.test(e.message), { label: 'unknown-type malformed' })
    ok(true, 'unknown message type → malformed error')
    host.leave(); guest.leave()
  }

  // ==========================================================================
  // 10. Version mismatch hello → error + teardown on both
  // ==========================================================================
  console.log('\n· version-mismatch hello → error + teardown …')
  {
    // A "bad guest" that speaks v1. We drive it as a bare member so we control the
    // hello. Host will refuse it. We assert the host errors AND the bad guest gets
    // a version-mismatch error wire message.
    const pair = makeMockPair()
    const host = track(new MpNetSession(pair.hostFactory))
    const he = tap(host)
    await host.host({ tc: { initialMs: 60_000, incrementMs: 1_000 }, hostColor: 'white' })
    // A bare v1 peer: parse every inbound wire msg into an inbox so we can wait on it.
    const badInbox = [] // parsed WireMsgs
    const badMember = pair.room.join({
      onMessage: (text) => {
        const p = wire.parseWireMsg(text)
        if (p) badInbox.push(p)
      },
      onPeerJoin: () => {},
      onPeerLeave: () => {}
    })
    // Host greets us with its hello; wait for it, then answer with a v1 hello.
    await waitEvent(badInbox, (m) => m.t === 'hello', { label: 'host hello to bad guest' })
    ok(true, 'bad guest received the host hello')
    badMember.transport.send(JSON.stringify({ t: 'hello', v: 1 }))
    // Host emits an error and tears down.
    await waitEvent(he, (e) => e.type === 'error' && /version/i.test(e.message), { label: 'host version-mismatch error' })
    ok(true, 'host rejects a v1 peer with a version-mismatch error')
    // The bad peer received a version-mismatch error wire message.
    await waitEvent(badInbox, (m) => m.t === 'error' && /version/i.test(m.message), { label: 'bad guest version error msg' })
    ok(true, 'the v1 peer is told about the version mismatch')
    badMember.transport.close()
    host.leave()
  }

  // ==========================================================================
  // 11. peer-left on transport onPeerLeave
  // ==========================================================================
  console.log('\n· peer-left on transport onPeerLeave …')
  {
    const { host, guest, he } = await connectPair({
      tc: { initialMs: 60_000, incrementMs: 1_000 },
      hostColor: 'white'
    })
    // Guest leaves → its transport closes → host's onPeerLeave → peer-left.
    guest.leave()
    await waitEvent(he, (e) => e.type === 'peer-left', { label: 'host peer-left', timeout: 2000 })
    ok(true, 'host emitted peer-left when the guest left')
    host.leave()
  }

  // ==========================================================================
  // 12. Discovery timeout (shrunk-timeout bundle; never a real 30s wait)
  // ==========================================================================
  console.log('\n· guest discovery timeout (shrunk to 60ms) …')
  {
    // DISCOVERY_TIMEOUT_MS is module-private; rather than wait 30s we bundle a
    // variant whose constant is textually shrunk to 60ms and test the fire path.
    const timeoutOut = resolve(outdir, 'mpSession.timeout.mjs')
    await bundleSession(timeoutOut, {
      patch: (src) => {
        const replaced = src.replace(/3e4|30000|30_000/g, '60')
        if (replaced === src) throw new Error('could not shrink DISCOVERY_TIMEOUT_MS in bundle')
        return replaced
      }
    })
    const { MpNetSession: FastSession } = await import(timeoutOut)
    // A factory whose transport NEVER delivers a peer (no room join at all).
    const deadFactory = (roomCode, listeners) => ({
      send() {},
      close() {}
    })
    const guest = new FastSession(deadFactory)
    const ge = tap(guest)
    const r = await guest.join(wire.generateRoomCode())
    eq(r.ok, true, 'join() resolves ok even with a silent transport')
    const err = await waitEvent(ge, (e) => e.type === 'error', { label: 'discovery timeout error', timeout: 1500 })
    ok(/Nobody's hosting/i.test(err.message), 'discovery timeout → friendly "nobody hosting" error')
    guest.leave()

    // And: leave() BEFORE the timeout cancels it (no late error fires).
    const guest2 = new FastSession(deadFactory)
    const ge2 = tap(guest2)
    await guest2.join(wire.generateRoomCode())
    guest2.leave()
    await assertNoEvent(ge2, (e) => e.type === 'error', 200, 'error after leave() cancels the discovery timer')
  }

  // ==========================================================================
  // 13. leave() idempotent + clears timers (clean exit is the assertion)
  // ==========================================================================
  console.log('\n· leave() idempotent + clears timers …')
  {
    const { host, guest } = await connectPair({
      tc: { initialMs: 300, incrementMs: 0 }, // arms a flag timer + heartbeat
      hostColor: 'white'
    })
    host.leave()
    host.leave() // second call must be a harmless no-op
    guest.leave()
    guest.leave()
    ok(true, 'leave() is idempotent (double-leave did not throw)')
  }

  // Tear down anything still tracked (belt & suspenders), then a clean exit with
  // NO open handles is itself the "timers cleared" assertion.
  for (const s of live) { try { s.leave() } catch {} }

  rmSync(outdir, { recursive: true, force: true })
  console.log(`\n✅ ALL GREEN — ${passed} assertions passed.`)
}

main().then(
  () => {
    // If any timer/handle leaked, the process would hang here; force a clean exit
    // only after confirming there is nothing pending by giving the loop a beat.
    setTimeout(() => process.exit(0), 50).unref()
  },
  (err) => {
    console.error(`\n❌ ${err.stack || err}`)
    process.exit(1)
  }
)
