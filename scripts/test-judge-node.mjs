// Headless test for the Node judge-WASM harness (server/judge/nodeEngine.ts +
// server/judge/contentHash.ts — phase A2 "Node harness for the pinned judge
// WASM", spec §11). This is the operator-peer / A5 prerequisite: prove the
// pinned single-thread Stockfish WASM runs UNDER NODE, deterministically, at
// fixed node counts.
//
//   node scripts/test-judge-node.mjs
//   CAPTURE=1 node scripts/test-judge-node.mjs   # print goldens, skip asserts
//
// Bundles the server/judge TS on the fly with esbuild (platform node), imports
// it from a temp dir, and drives:
//   (1) load the WASM under node, run a fixed-node MultiPV search, parse it;
//   (2) DETERMINISM GATE — same FEN + same fixed nodes yields BIT-IDENTICAL
//       search output across (a) two fresh instances, (b) a warm instance after
//       analysing OTHER positions first (ucinewgame + Clear Hash between, spec
//       §8 "replay-after-warmup identical"), (c) recorded golden vectors for
//       three fixed FENs at a fixed node count (future-run / cross-machine gate);
//   (3) the content-hash constant matches the shipped wasm.
//
// Style: failures counter, section banners, per-assert one-line, exit(failures?1:0).

import { build } from 'esbuild'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const JUDGE = resolve(ROOT, 'server/judge').replace(/\\/g, '/')
const ENGINE_JS = resolve(ROOT, 'node_modules/stockfish/bin/stockfish-18-lite-single.js')
const ENGINE_WASM = resolve(ROOT, 'node_modules/stockfish/bin/stockfish-18-lite-single.wasm')
const CAPTURE = !!process.env.CAPTURE

// ---- tiny check kit ---------------------------------------------------------
let passed = 0
let failures = 0
function ok(cond, msg) {
  if (cond) {
    passed++
    console.log(`  ✓ ${msg}`)
  } else {
    failures++
    console.log(`  ✗ ${msg}`)
  }
}
function eq(a, b, msg) {
  ok(a === b, a === b ? msg : `${msg} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`)
}
function section(t) {
  console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 60 - t.length))}`)
}
async function rejects(p, msg) {
  try {
    await p
    ok(false, `${msg} (did not reject)`)
  } catch {
    ok(true, msg)
  }
}

// ---- fixtures ---------------------------------------------------------------
const N = 100000 // fixed node cap — modest so the suite runs well under a minute
const MPV = 3
const HASH = 16

// Deterministic-surface canonicalization of an AnalysisResult: search-determined
// fields only (NO time/nps — those never enter AnalysisLine). This is the exact
// byte surface the determinism gate compares and freezes as goldens.
function canon(r) {
  const lines = r.lines.map((l) => {
    const score = l.mate !== undefined ? `mate ${l.mate}` : `cp ${l.scoreCp}`
    const bound = l.bound ? ` ${l.bound}bound` : ''
    return `mpv${l.multipv} d${l.depth} sd${l.seldepth} ${score}${bound} nodes${l.nodes} pv ${l.pv.join(' ')}`
  })
  lines.push(`bestmove ${r.bestmove}${r.ponder ? ` ponder ${r.ponder}` : ''}`)
  return lines.join('\n')
}

const FENS = {
  sicilian: 'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
  kiwipete: 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',
  endgame: '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1',
}

// Golden canonical outputs at (nodes=N, MultiPV=MPV, Hash=HASH). Recorded from a
// green run of the pinned WASM (content hash below); a future run on any machine
// that produces different bits fails this gate (spec §8 determinism claim).
const GOLDENS = {
  sicilian:
    'mpv1 d13 sd21 cp 37 upperbound nodes100098 pv g1f3 e7e6\n' +
    'mpv2 d12 sd21 cp 33 nodes100098 pv d2d4 c5d4 g1f3 b8c6 f3d4 g8f6 b1c3 e7e6 d4c6 b7c6 e4e5 f6d5 c3e4 d8c7 d1h5 f8e7 f1d3\n' +
    'mpv3 d12 sd19 cp 32 nodes100098 pv b1c3 b8c6 g1e2 e7e6 d2d4 c5d4 e2d4 f8e7 c1e3 g8f6 f1d3 e8g8\n' +
    'bestmove g1f3 ponder e7e6',
  kiwipete:
    'mpv1 d11 sd20 cp -139 upperbound nodes100006 pv e2a6 h3g2\n' +
    'mpv2 d10 sd15 cp -163 nodes100006 pv d5e6 a6e2 c3e2 e7e6 d2f4 c7c5 e1g1 d7d6 e5d3 f6e4\n' +
    'mpv3 d10 sd15 cp -262 nodes100006 pv c3b5 a6b5 e2b5 e6d5 e5c6 e7e4 e1d1 d7c6 b5c6 e8f8 c6a8 b6a8\n' +
    'bestmove e2a6 ponder h3g2',
  endgame:
    'mpv1 d12 sd27 cp 87 upperbound nodes100070 pv b4f4 h4g3\n' +
    'mpv2 d11 sd19 cp 37 nodes100070 pv e2e3 h5c5 b4f4 h4g3 a5a6 g3g2 e3e4 g2g3 f4f5 g3g4\n' +
    'mpv3 d11 sd23 cp 16 nodes100070 pv b4c4 h5c5 c4f4 h4g3 f4f3 g3g2 a5a6 c5c2 f3f7 g2g3 e2e4 c2c5\n' +
    'bestmove b4f4 ponder h4g3',
}
const GOLDEN_WASM_SHA256 = 'a8fbc05ec6920b56d7485826dcb02c5ffd2826bcbf751cf973046f237a9096f1'
const GOLDEN_WASM_BYTES = 7295411

async function main() {
  const cacheRoot = resolve(ROOT, 'node_modules/.cache/judge-node-test')
  mkdirSync(cacheRoot, { recursive: true })
  const outdir = mkdtempSync(resolve(cacheRoot, 'run-'))
  try {
    await run(outdir)
  } finally {
    rmSync(outdir, { recursive: true, force: true })
  }
  console.log(
    `\n${failures ? `❌ ${failures} FAILED — ` : 'ALL GREEN — '}${passed} assertions${
      failures ? `, ${failures} failures` : ''
    }`,
  )
  process.exit(failures ? 1 : 0)
}

async function run(outdir) {
  console.log('· bundling server/judge (nodeEngine/contentHash) …')
  const entry = resolve(outdir, 'entry.ts')
  writeFileSync(
    entry,
    [
      `export * as engine from '${JUDGE}/nodeEngine.ts'`,
      `export * as content from '${JUDGE}/contentHash.ts'`,
    ].join('\n'),
  )
  const outfile = resolve(outdir, 'judge.mjs')
  await build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    mainFields: ['module', 'main'],
    conditions: ['import', 'module', 'default'],
    absWorkingDir: ROOT,
    logLevel: 'warning',
  })
  const M = await import(pathToFileURL(outfile).href)
  const { engine, content } = M

  // Explicit paths — the bundle's default (package) resolution can't see
  // node_modules from a temp dir, so every call is given the real engine/wasm.
  const mk = () => engine.newInstance({ enginePath: ENGINE_JS, wasmPath: ENGINE_WASM })

  // ── (3) content hash ──────────────────────────────────────────────────────
  section('content hash (spec §8 binary pin)')
  const v = content.verifyWasmHash(ENGINE_WASM)
  eq(v.sha256, GOLDEN_WASM_SHA256, 'computed sha256 matches shipped wasm')
  eq(v.bytes, GOLDEN_WASM_BYTES, 'computed byte length matches shipped wasm')
  eq(content.JUDGE_WASM_SHA256, GOLDEN_WASM_SHA256, 'exported JUDGE_WASM_SHA256 constant is correct')
  eq(content.JUDGE_WASM_BYTES, GOLDEN_WASM_BYTES, 'exported JUDGE_WASM_BYTES constant is correct')
  ok(v.ok, 'verifyWasmHash() ok === true for the shipped wasm')
  // assertWasmHash throws on a wrong path (uses THIS test file as a decoy blob)
  await rejects(
    Promise.resolve().then(() => content.assertWasmHash(fileURLToPath(import.meta.url))),
    'assertWasmHash throws on a non-matching file',
  )

  // ── (1) load + fixed-node MultiPV search under node ───────────────────────
  section('load + fixed-node search under node')
  const inst = await mk()
  const r0 = await inst.analyseFixedNodes(FENS.sicilian, { nodes: N, multipv: MPV, hashMb: HASH })
  ok(!!r0.bestmove && /^[a-h][1-8][a-h][1-8]/.test(r0.bestmove), `got a legal-shaped bestmove (${r0.bestmove})`)
  eq(r0.lines.length, MPV, `got ${MPV} MultiPV lines`)
  ok(
    r0.lines.every((l) => l.scoreCp !== undefined || l.mate !== undefined),
    'every line carries a cp or mate score',
  )
  ok(
    r0.lines.every((l, i) => l.multipv === i + 1),
    'lines are ranked 1..MultiPV in order',
  )
  ok(r0.lines.every((l) => l.pv.length >= 1), 'every line carries a non-empty pv')

  // hashMb guard (spec §8: Hash ≤ 16MB)
  await rejects(
    inst.analyseFixedNodes(FENS.sicilian, { nodes: N, multipv: MPV, hashMb: 32 }),
    'analyseFixedNodes rejects hashMb > 16',
  )
  await inst.quit()

  // ── (2a) two fresh instances, same input → identical bits ─────────────────
  section('determinism: two fresh instances')
  const a = await mk()
  const ca = canon(await a.analyseFixedNodes(FENS.sicilian, { nodes: N, multipv: MPV, hashMb: HASH }))
  await a.quit()
  const b = await mk()
  const cb = canon(await b.analyseFixedNodes(FENS.sicilian, { nodes: N, multipv: MPV, hashMb: HASH }))
  await b.quit()
  eq(cb, ca, 'fresh-instance A == fresh-instance B (bit-identical)')

  // ── (2b) warm instance, ucinewgame + Clear Hash between → identical ───────
  section('determinism: warm instance (TT-clear replay, spec §8)')
  const w = await mk()
  // pollute the engine with unrelated searches at different nodes/MultiPV first
  await w.analyseFixedNodes(FENS.kiwipete, { nodes: 63211, multipv: 5, hashMb: HASH })
  await w.analyseFixedNodes(FENS.endgame, { nodes: 41000, multipv: 2, hashMb: HASH })
  const cw = canon(await w.analyseFixedNodes(FENS.sicilian, { nodes: N, multipv: MPV, hashMb: HASH }))
  await w.quit()
  eq(cw, ca, 'warm-after-other-positions == fresh (TT cleared, replay identical)')

  // ── (2c) golden vectors for three fixed FENs ──────────────────────────────
  section('determinism: recorded golden vectors')
  for (const name of Object.keys(FENS)) {
    const g = await mk()
    const c = canon(await g.analyseFixedNodes(FENS[name], { nodes: N, multipv: MPV, hashMb: HASH }))
    await g.quit()
    if (CAPTURE) {
      console.log(`\n[GOLDEN ${name}]\n${c}\n`)
      continue
    }
    eq(c, GOLDENS[name], `golden vector "${name}" reproduced bit-for-bit`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
