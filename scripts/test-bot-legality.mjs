// Bot-legality sweep — hunts EVERY source of "The bot/engine offered an
// illegal move" toasts (KernelBot.tsx applyMove / VariantBot.tsx applyMove:
// a bot/engine move that spec.play rejects).
//
//   node scripts/test-bot-legality.mjs [inprocess|engine]
//
// Part A (in-process providers — exactly the KernelBot flow):
//   for every kind with an in-process provider (checkers, checkers-intl,
//   othello, connect4, hex, morris, tictactoe, gomoku) play 6 full bot-vs-bot
//   games (L1vL5, L5vL1, L3vL3 x2, L2vL4, L4vL2; capped plies), asking the
//   games/bots.ts provider for each move and applying it through spec.play —
//   assert spec.play NEVER returns null on a bot offer, and that a live
//   position never has zero legal moves (which would hang KernelBot).
//
// Part B (engine-backed kinds — the engine:playVariant boundary):
//   spawn the LOCAL fairy-stockfish (resources/engine/mac/fairy-stockfish),
//   mirror src/main/ipc/engine.ipc.ts option mapping (UCI_Variant per kind,
//   UCI_Chess960 for chess960, UCI_LimitStrength + UCI_Elo per level,
//   `position fen <state.fen>` + `go movetime 100`) and play 2 quick games per
//   kind (L1vL5, L3vL3), applying every bestmove via spec.play. Also asserts
//   each kernel FEN passes the ipc's VARIANT_FEN_RE schema (a reject there is
//   the "engine failed to move" toast). Catches codec drift: castling
//   e1h1/e1g1, promotion suffixes ('m', '+'), janggi pass, crazyhouse drops.
//
// Failures are COLLECTED (not fail-fast) and printed with full repro (kind,
// game, ply, fen/state, move). Final line: 'ALL GREEN — <counts>'. Exit 0 = green.

import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, resolve } from 'node:path'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const MODE = process.argv[2] ?? 'all' // 'inprocess' | 'engine' | 'all'

// ---- deterministic RNG (Math.random is monkey-patched per game) --------------
function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---- failure ledger -----------------------------------------------------------
const failures = []
function fail(msg) {
  failures.push(msg)
  console.log(`  ✗ ${msg}`)
}

// ---- bundle the games tree ----------------------------------------------------
const tmp = mkdtempSync(resolve(tmpdir(), 'bot-legality-'))
const entry = resolve(tmp, 'entry.mjs')
const outfile = resolve(tmp, 'bundle.mjs')
const GAMES = resolve(ROOT, 'src/renderer/src/games')
writeFileSync(
  entry,
  [
    `export { resolveBotProvider, BotUnavailableError } from ${JSON.stringify(resolve(GAMES, 'bots.ts'))}`,
    `export { getGame } from ${JSON.stringify(resolve(GAMES, 'registry.ts'))}`,
    `export { preloadFfish } from ${JSON.stringify(resolve(GAMES, 'ffish.ts'))}`
  ].join('\n')
)
await build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'node',
  jsx: 'automatic',
  external: ['*?url'],
  loader: { '.css': 'empty' },
  alias: { '@shared': resolve(ROOT, 'src/shared'), '@': resolve(ROOT, 'src/renderer/src') },
  logLevel: 'silent'
})
const mod = await import(pathToFileURL(outfile).href)
rmSync(tmp, { recursive: true, force: true })
const { resolveBotProvider, getGame, preloadFfish } = mod
const specOf = (kind) => getGame(kind).spec

const gamesPlayed = new Map() // kind -> games completed
const bump = (kind) => gamesPlayed.set(kind, (gamesPlayed.get(kind) ?? 0) + 1)

// One line of state context small enough to paste into a repro.
function describeState(kind, state) {
  if (typeof state.fen === 'string') return state.fen
  return `moves=[${state.moves.join(' ')}]`
}

// =================================================================================
// Part A — in-process providers (KernelBot flow: provider.move -> spec.play)
// =================================================================================

const PAIRINGS = [
  [1, 5],
  [5, 1],
  [3, 3],
  [3, 3],
  [2, 4],
  [4, 2]
]

// kind -> ply cap (cap reached = adjudicated draw, still a valid legality game)
const IN_PROCESS = {
  checkers: 300,
  'checkers-intl': 300,
  othello: 200,
  connect4: 60,
  hex: 130,
  morris: 400,
  tictactoe: 12,
  gomoku: 260
}

async function playInProcessGame(kind, pairing, seed) {
  const spec = specOf(kind)
  const provider = resolveBotProvider(kind)
  const cap = IN_PROCESS[kind]
  const origRandom = Math.random
  Math.random = mulberry32(seed)
  try {
    let state = spec.init()
    for (let ply = 0; ply < cap; ply++) {
      if (spec.result(state) !== null) break
      const legal = spec.legalMoves(state)
      if (legal.length === 0) {
        // KernelBot's bot effect never fires on legal.length === 0 — a live
        // position with no moves is a hang, so it must be terminal.
        fail(`${kind} [${pairing.join('v')} seed ${seed}] ply ${ply}: live position has ZERO legal moves (KernelBot hang) at ${describeState(kind, state)}`)
        break
      }
      // KernelBot: turn = spec.players[moves.length % 2]
      const level = pairing[state.moves.length % 2]
      let mv
      try {
        mv = await provider.move(state, level)
      } catch (e) {
        fail(`${kind} [${pairing.join('v')} seed ${seed}] ply ${ply} L${level}: provider threw '${e.message}' at ${describeState(kind, state)}`)
        break
      }
      const next = spec.play(state, mv)
      if (!next) {
        fail(`${kind} [${pairing.join('v')} seed ${seed}] ply ${ply} L${level}: ILLEGAL BOT OFFER '${mv}' (legal: ${legal.slice(0, 12).join(',')}${legal.length > 12 ? ',…' : ''}) at ${describeState(kind, state)}`)
        break
      }
      state = next
    }
    bump(kind)
  } finally {
    Math.random = origRandom
  }
}

if (MODE !== 'engine') {
  console.log('Part A — in-process bot-vs-bot sweep (KernelBot flow)')
  for (const kind of Object.keys(IN_PROCESS)) {
    process.stdout.write(`  ${kind}: `)
    const t0 = Date.now()
    for (let g = 0; g < PAIRINGS.length; g++) {
      await playInProcessGame(kind, PAIRINGS[g], 0xb07 + g * 7919 + kind.length * 131)
      process.stdout.write('.')
    }
    console.log(` ${gamesPlayed.get(kind)} games (${((Date.now() - t0) / 1000).toFixed(1)}s)`)
  }
}

// =================================================================================
// Part B — engine boundary (mirrors src/main/ipc/engine.ipc.ts playVariant)
// =================================================================================

// engine.ipc.ts FAIRY_UCI_VARIANT (kind -> UCI_Variant; chess960 = chess + 960)
const FAIRY_UCI_VARIANT = {
  chess960: 'chess',
  crazyhouse: 'crazyhouse',
  atomic: 'atomic',
  antichess: 'antichess',
  kingofthehill: 'kingofthehill',
  threecheck: '3check',
  horde: 'horde',
  racingkings: 'racingkings',
  xiangqi: 'xiangqi',
  shogi: 'shogi',
  janggi: 'janggi',
  makruk: 'makruk',
  placement: 'placement'
}
// engine.ipc.ts FAIRY_LEVELS elo column
const FAIRY_ELO = [600, 1000, 1400, 1850, 2300]
// engine.ipc.ts playVariantSchema fen guard — a kernel FEN failing this is the
// "engine failed to move" toast (ipc reject), so assert it per position.
const VARIANT_FEN_RE = /^[A-Za-z0-9/\[\]+~.\- ]{1,160}$/

const ENGINE_PAIRINGS = [
  [1, 5],
  [3, 3]
]
const ENGINE_PLY_CAP = 120

if (MODE !== 'inprocess') {
  const BIN = resolve(ROOT, 'resources/engine/mac/fairy-stockfish')
  if (!existsSync(BIN)) {
    console.error(`fairy-stockfish binary not found: ${BIN}`)
    process.exit(1)
  }
  console.log('Part B — engine boundary sweep (fairy-stockfish, movetime 100)')

  // ffish kinds need the WASM rules loaded (spec.preload path in VariantBot).
  await preloadFfish({ wasmBinary: readFileSync(resolve(ROOT, 'node_modules/ffish-es6/ffish.wasm')) })

  // ---- minimal line-oriented UCI driver (same shape as probe-fairy-sf.mjs) ----
  const proc = spawn(BIN, [], { stdio: ['pipe', 'pipe', 'inherit'] })
  let buf = ''
  const waiters = []
  proc.stdout.setEncoding('utf-8')
  proc.stdout.on('data', (chunk) => {
    buf += chunk
    let nl
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      if (!line) continue
      for (let i = 0; i < waiters.length; i++) {
        const v = waiters[i].test(line)
        if (v !== undefined) {
          const [w] = waiters.splice(i, 1)
          w.resolve(v)
          break
        }
      }
    }
  })
  const send = (cmd) => proc.stdin.write(cmd + '\n')
  const waitFor = (test, timeoutMs = 15000, label = 'line') =>
    new Promise((res, rej) => {
      const timer = setTimeout(() => rej(new Error(`timeout waiting for ${label}`)), timeoutMs)
      waiters.push({
        test,
        resolve: (v) => {
          clearTimeout(timer)
          res(v)
        }
      })
    })
  const expectToken = (cmd, token) => {
    const p = waitFor((l) => (l.startsWith(token) ? l : undefined), 15000, token)
    send(cmd)
    return p
  }
  const bestmove = (goCmd) => {
    const p = waitFor((l) => (l.startsWith('bestmove') ? l.split(/\s+/)[1] : undefined), 20000, 'bestmove')
    send(goCmd)
    return p
  }

  await expectToken('uci', 'uciok')
  send('setoption name Threads value 1')
  send('setoption name Hash value 64')
  await expectToken('isready', 'readyok')

  async function playEngineGame(kind, pairing, gameIdx) {
    const spec = specOf(kind)
    // FairyPool.get(variant, chess960): re-target + ucinewgame per request.
    send(`setoption name UCI_Variant value ${FAIRY_UCI_VARIANT[kind]}`)
    send(`setoption name UCI_Chess960 value ${kind === 'chess960'}`)
    send('ucinewgame')
    await expectToken('isready', 'readyok')

    let state = spec.init(kind === 'chess960' ? { positionNumber: gameIdx === 0 ? 300 : 777 } : undefined)
    for (let ply = 0; ply < ENGINE_PLY_CAP; ply++) {
      if (spec.result(state) !== null) break
      const legal = spec.legalMoves(state)
      if (legal.length === 0) {
        fail(`${kind} [engine ${pairing.join('v')} g${gameIdx}] ply ${ply}: live position has ZERO legal moves at ${state.fen}`)
        break
      }
      if (!VARIANT_FEN_RE.test(state.fen)) {
        fail(`${kind} [engine ${pairing.join('v')} g${gameIdx}] ply ${ply}: kernel fen FAILS ipc VARIANT_FEN_RE (engine:playVariant would reject): '${state.fen}'`)
        break
      }
      // VariantBot turn: fen field 1 ('b' = black), else move parity.
      const fenTurn = state.fen.split(' ')[1]
      const level = pairing[fenTurn === 'b' ? 1 : 0]
      // engine.ipc playVariant: strength options, position by bare fen, movetime.
      send('setoption name UCI_LimitStrength value true')
      send(`setoption name UCI_Elo value ${FAIRY_ELO[level - 1]}`)
      send(`position fen ${state.fen}`)
      let bm
      try {
        bm = await bestmove('go movetime 100')
      } catch (e) {
        fail(`${kind} [engine ${pairing.join('v')} g${gameIdx}] ply ${ply}: ${e.message} at ${state.fen}`)
        break
      }
      if (!bm || bm === '(none)' || bm === '0000') {
        // games/bots.ts assertPlayableMove throws on these -> "engine failed
        // to move" toast. Only OK if the spec ALSO thinks the game is over.
        fail(`${kind} [engine ${pairing.join('v')} g${gameIdx}] ply ${ply}: engine returned '${bm}' on a LIVE kernel position (${legal.length} legal: ${legal.slice(0, 8).join(',')}) at ${state.fen}`)
        break
      }
      const next = spec.play(state, bm)
      if (!next) {
        fail(`${kind} [engine ${pairing.join('v')} g${gameIdx}] ply ${ply}: ILLEGAL ENGINE OFFER '${bm}' (legal: ${legal.slice(0, 12).join(',')}${legal.length > 12 ? ',…' : ''}) at ${state.fen}`)
        break
      }
      state = next
    }
    bump(kind)
  }

  for (const kind of Object.keys(FAIRY_UCI_VARIANT)) {
    process.stdout.write(`  ${kind}: `)
    const t0 = Date.now()
    for (let g = 0; g < ENGINE_PAIRINGS.length; g++) {
      await playEngineGame(kind, ENGINE_PAIRINGS[g], g)
      process.stdout.write('.')
    }
    console.log(` ${gamesPlayed.get(kind)} games (${((Date.now() - t0) / 1000).toFixed(1)}s)`)
  }

  send('quit')
  proc.stdin.end()
}

// =================================================================================
// Report
// =================================================================================
const counts = [...gamesPlayed.entries()].map(([k, n]) => `${k}=${n}`).join(' ')
if (failures.length > 0) {
  console.log(`\n${failures.length} FAILURE(S):`)
  for (const f of failures) console.log(`  - ${f}`)
  console.log(`\ngames: ${counts}`)
  process.exit(1)
}
console.log(`\nALL GREEN — games: ${counts}`)
process.exit(0)
