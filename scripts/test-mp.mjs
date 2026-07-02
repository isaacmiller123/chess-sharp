// Headless smoke test for the LAN-multiplayer transport (src/main/mp/session.ts).
//
// We esbuild-bundle session.ts (+ protocol.ts) to a temp ESM file — that strips
// the TypeScript types and proves the module is electron-free — then in ONE node
// process we:
//   1. spin up an MpSession HOST,
//   2. dial it with a RAW `ws` client acting as the guest (no MpSession, so we
//      exercise the real wire protocol, not a mirror of the same code),
//   3. run the full choreography and assert on host events + wire traffic:
//        - hello handshake both ways, host 'start'/'peer-joined', guest 'start'
//        - 6 moves alternating (host↔guest) with authoritative clocks that
//          decrease monotonically per side and show the increment credit
//        - a draw offer + accept ends the game
//        - a rematch swaps colors
//        - the guest disconnecting yields host 'peer-left'
//        - a garbage join code is rejected by MpSession.join()
//
// Exit code 0 = all green. Any assertion failure throws and exits non-zero.

import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { mkdtempSync, rmSync, readFileSync, mkdirSync } from 'node:fs'
import { WebSocket } from 'ws'

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

/** Wait for the next MpSession 'event' matching `pred` (with a timeout). */
function waitEvent(events, pred, { timeout = 4000, label = 'event' } = {}) {
  return new Promise((res, rej) => {
    const deadline = Date.now() + timeout
    const tick = () => {
      const idx = events.findIndex(pred)
      if (idx >= 0) {
        const [ev] = events.splice(idx, 1)
        return res(ev)
      }
      if (Date.now() > deadline) return rej(new Error(`timeout waiting for ${label}`))
      setTimeout(tick, 15)
    }
    tick()
  })
}

/** A raw ws guest that speaks the wire protocol directly. */
function rawGuest(url) {
  const ws = new WebSocket(url)
  const inbox = [] // parsed WireMsgs, in order
  ws.on('message', (data) => {
    try {
      inbox.push(JSON.parse(data.toString()))
    } catch {
      inbox.push({ t: '__unparseable__' })
    }
  })
  const send = (obj) => ws.send(JSON.stringify(obj))
  const waitMsg = (pred, { timeout = 4000, label = 'wire msg' } = {}) =>
    new Promise((res, rej) => {
      const deadline = Date.now() + timeout
      const tick = () => {
        const idx = inbox.findIndex(pred)
        if (idx >= 0) {
          const [m] = inbox.splice(idx, 1)
          return res(m)
        }
        if (Date.now() > deadline) return rej(new Error(`timeout waiting for ${label}`))
        setTimeout(tick, 15)
      }
      tick()
    })
  const open = new Promise((res, rej) => {
    ws.once('open', res)
    ws.once('error', rej)
  })
  return { ws, send, waitMsg, open, inbox }
}

async function main() {
  // ---- 1. bundle session.ts (proves it's electron-free & type-strips) -------
  // Output INSIDE the project tree so node's resolver still finds node_modules
  // (ws/zod stay external — bundling those CJS deps into ESM breaks their
  // require() of node builtins; keeping them external is both correct and faster).
  const cacheRoot = resolve(ROOT, 'node_modules/.cache/mp-test')
  mkdirSync(cacheRoot, { recursive: true })
  const outdir = mkdtempSync(resolve(cacheRoot, 'run-'))
  const outfile = resolve(outdir, 'session.mjs')
  console.log('· bundling src/main/mp/session.ts …')
  // packages:'external' keeps ws/zod as bare imports; `electron` is external too
  // — if session.ts or its graph ever imported electron, the bundle would carry
  // an `import "electron"` that fails at load, so a clean import IS the
  // electron-free proof. We also scan the output text below.
  await build({
    entryPoints: [resolve(ROOT, 'src/main/mp/session.ts')],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    packages: 'external',
    absWorkingDir: ROOT,
    logLevel: 'warning'
  })
  const bundleSrc = readFileSync(outfile, 'utf8')
  ok(!/from\s*["']electron["']/.test(bundleSrc), 'session bundle has no electron import (electron-free)')
  const { MpSession } = await import(outfile)
  ok(typeof MpSession === 'function', 'session.ts bundled & MpSession exported')

  // Bundle protocol.ts too, so the guest can decode the join code exactly like
  // the app would (also proves protocol.ts is independently electron-free).
  const protoOut = resolve(outdir, 'protocol.mjs')
  await build({
    entryPoints: [resolve(ROOT, 'src/main/mp/protocol.ts')],
    outfile: protoOut,
    bundle: true,
    format: 'esm',
    platform: 'node',
    packages: 'external',
    absWorkingDir: ROOT,
    logLevel: 'warning'
  })
  const { decodeJoinCode } = await import(protoOut)

  // ---- 2. host a timed game -------------------------------------------------
  console.log('\n· hosting a 3+2 game (host = white) …')
  const INITIAL = 180_000
  const INC = 2_000
  const host = new MpSession()
  const hostEvents = []
  host.on('event', (ev) => hostEvents.push(ev))
  const { code } = await host.host({
    tc: { initialMs: INITIAL, incrementMs: INC },
    hostColor: 'white'
  })
  ok(/^[0-9A-Z]{5}-[0-9A-Z]{5}$/.test(code), `host returned a join code: ${code}`)

  // Decode the code the same way a guest would, to reach the server.
  const addr = decodeJoinCode(code)
  ok(addr && addr.port > 0, `code decodes to ${addr.ip}:${addr.port}`)
  // The host binds 0.0.0.0; connect over loopback regardless of the LAN IP baked
  // into the code (the code advertises a routable LAN address, not necessarily
  // one reachable from this same box's default route).
  const guest = rawGuest(`ws://127.0.0.1:${addr.port}`)
  await guest.open

  // ---- handshake ------------------------------------------------------------
  console.log('\n· handshake …')
  const hostHello = await guest.waitMsg((m) => m.t === 'hello', { label: 'host hello' })
  eq(hostHello.v, 1, 'host hello carries protocol v1')
  guest.send({ t: 'hello', v: 1 })

  const peerJoined = await waitEvent(hostEvents, (e) => e.type === 'peer-joined', {
    label: 'host peer-joined'
  })
  ok(peerJoined, 'host emitted peer-joined')
  const hostStart = await waitEvent(hostEvents, (e) => e.type === 'start', { label: 'host start' })
  eq(hostStart.yourColor, 'white', 'host start: host is white')
  eq(hostStart.config.tc.initialMs, INITIAL, 'host start carries the time control')
  const guestStart = await guest.waitMsg((m) => m.t === 'start', { label: 'guest start' })
  eq(guestStart.yourColor, 'black', 'guest start: guest is black')

  // ---- 3. six moves, alternating, with clock checks -------------------------
  console.log('\n· 6 moves both directions (clock authority) …')
  // A short real, legal opening so a UI replay would be valid too.
  const moves = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'a7a6']
  // The clock invariant with increment is  new = old - elapsed + INC  (elapsed>0),
  // so a fast move can leave the clock ABOVE `old` (you bank net time). "Monotone
  // decrease" therefore applies to the raw thinking time — old+INC minus new — which
  // must be strictly positive every move and roughly equal to the wall time we slept.
  // We use a deliberate ~THINK_MS pause so the debit is unambiguous.
  const THINK_MS = 250
  let lastWhite = INITIAL
  let lastBlack = INITIAL

  const assertClock = (prev, next, sleptMs, side) => {
    const spent = prev + INC - next // wall time actually debited from this side
    ok(spent > 0, `${side}: raw time was debited (spent ${spent}ms > 0)`)
    // The debit should be close to the wall time we waited (generous window for
    // timer jitter / scheduling), and never absurd.
    ok(
      spent >= sleptMs - 60 && spent <= sleptMs + 1500,
      `${side}: debit ≈ think time (spent ${spent}ms for a ${sleptMs}ms think)`
    )
    // Never gain more than a full increment on a single move.
    ok(next <= prev + INC, `${side}: clock never gains more than the increment (${next} ≤ ${prev + INC})`)
  }

  for (let i = 0; i < moves.length; i++) {
    const uci = moves[i]
    const hostToMove = i % 2 === 0 // white=host on even plies
    if (hostToMove) {
      await sleep(THINK_MS)
      await host.sendMove(uci)
      const m = await guest.waitMsg((x) => x.t === 'move' && x.uci === uci, {
        label: `guest sees host move ${uci}`
      })
      ok(m.clockMs, `host move ${uci} carried clocks`)
      assertClock(lastWhite, m.clockMs.white, THINK_MS, 'white')
      lastWhite = m.clockMs.white
      eq(m.clockMs.black, lastBlack, 'black clock unchanged on white move')
    } else {
      // Guest plays a raw wire move; the host must relay it to the HOST renderer
      // with AUTHORITATIVE clocks (crediting black's increment), ignoring the
      // guest's own clockMs hint.
      await sleep(THINK_MS)
      guest.send({ t: 'move', uci, clockMs: { white: 999, black: 999 } }) // bogus hint
      const ev = await waitEvent(hostEvents, (e) => e.type === 'move' && e.uci === uci, {
        label: `host sees guest move ${uci}`
      })
      ok(ev.clockMs, `guest move ${uci} surfaced to host with clocks`)
      ok(ev.clockMs.black > 1000, 'host ignored the guest bogus clock hint (recomputed authoritatively)')
      assertClock(lastBlack, ev.clockMs.black, THINK_MS, 'black')
      lastBlack = ev.clockMs.black
      eq(ev.clockMs.white, lastWhite, 'white clock unchanged on black move')
    }
  }
  // After 3 quick moves each, both sides banked net time (increment > tiny thinks).
  ok(lastWhite > INITIAL && lastWhite <= INITIAL + 3 * INC, 'white banked net time over 3 fast moves')
  ok(lastBlack > INITIAL && lastBlack <= INITIAL + 3 * INC, 'black banked net time over 3 fast moves')

  // ---- 4. draw offer + accept ends the game ---------------------------------
  console.log('\n· draw offer / accept …')
  // Guest offers a draw; host UI should see drawOffer.
  guest.send({ t: 'drawOffer' })
  await waitEvent(hostEvents, (e) => e.type === 'drawOffer', { label: 'host drawOffer' })
  ok(true, 'host received the draw offer')
  // Host accepts.
  const acc = await host.acceptDraw()
  eq(acc.ok, true, 'host.acceptDraw() ok')
  await waitEvent(hostEvents, (e) => e.type === 'drawAccept', { label: 'host drawAccept (local)' })
  const guestDraw = await guest.waitMsg((m) => m.t === 'drawAccept', { label: 'guest drawAccept' })
  ok(guestDraw, 'guest received drawAccept — game drawn')
  // A move after game-over must be rejected.
  eq((await host.sendMove('d2d4')).ok, false, 'host.sendMove after draw is refused')

  // ---- 5. rematch swaps colors ----------------------------------------------
  console.log('\n· rematch (colors swap) …')
  await host.offerRematch()
  const reEv = await waitEvent(hostEvents, (e) => e.type === 'rematchStart', {
    label: 'host rematchStart'
  })
  eq(reEv.yourColor, 'black', 'host rematch: host is now black (swapped)')
  const guestRe = await guest.waitMsg((m) => m.t === 'rematchStart', { label: 'guest rematchStart' })
  eq(guestRe.yourColor, 'white', 'guest rematch: guest is now white (swapped)')
  // New game is live: black=host to move? No — white moves first, and white is now
  // the GUEST. Host (black) moving out of turn must be refused.
  eq((await host.sendMove('e2e4')).ok, false, 'host (black) cannot move first in rematch')
  // Guest (white) opens; host should see it, and the clocks must have RESET to
  // INITIAL for the new game (then this one fast move banks a bit of increment).
  await sleep(120)
  guest.send({ t: 'move', uci: 'd2d4', clockMs: { white: INITIAL, black: INITIAL } })
  const firstRe = await waitEvent(hostEvents, (e) => e.type === 'move' && e.uci === 'd2d4', {
    label: 'host sees guest opening in rematch'
  })
  // Black (host) hasn't moved yet, so black is still exactly INITIAL — proof of reset.
  eq(firstRe.clockMs.black, INITIAL, 'rematch reset both clocks to initial')
  const whiteSpent = INITIAL + INC - firstRe.clockMs.white
  ok(whiteSpent > 0 && whiteSpent < 2_000, 'rematch: white ticked from a fresh INITIAL')

  // ---- 6. guest disconnect -> host peer-left --------------------------------
  console.log('\n· guest disconnect → host peer-left …')
  guest.ws.terminate() // hard drop (no polite bye) — exercises the heartbeat/close path
  await waitEvent(hostEvents, (e) => e.type === 'peer-left', {
    label: 'host peer-left',
    timeout: 6000
  })
  ok(true, 'host emitted peer-left after guest vanished')
  host.close()

  // ---- 7. bad code rejected -------------------------------------------------
  console.log('\n· bad join code rejected …')
  const badGuest = new MpSession()
  const r1 = await badGuest.join('!!!!!-@@@@@')
  eq(r1.ok, false, 'garbage code → join ok:false')
  ok(!!r1.error, 'garbage code → an error message is provided')
  const r2 = await badGuest.join('ABC') // too short
  eq(r2.ok, false, 'short code → join ok:false')
  badGuest.close()

  // ---- done -----------------------------------------------------------------
  rmSync(outdir, { recursive: true, force: true })
  console.log(`\n✅ ALL GREEN — ${passed} assertions passed.`)
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(`\n❌ ${err.stack || err}`)
    process.exit(1)
  }
)
