#!/usr/bin/env node
// Elo-corpus generator for the empirical accuracy->Elo model (estElo.ts).
//
// Plays engine-vs-engine games at KNOWN strengths with the bundled Stockfish:
//  - bands >= 1320: native UCI_LimitStrength/UCI_Elo, go movetime (the app's
//    1320+ bot path uses movetime-limited native play);
//  - bands < 1320: the production sub-floor pick model (scripts/lib/
//    weak-model.mjs — mirror of engine.ipc.ts), full-strength engine, short
//    MultiPV depth search + softmax/blunder pick.
//
// Pairings per the fit design: self-play at equal Elo plus cross-pairings at
// +/-1 and +/-2 ladder steps (~+/-200 / +/-400) so opponent strength is a fit
// feature. Every game gets a random 6-ply "book" opening (uniform pick among
// engine candidates within 60cp of best at depth 8) for corpus diversity.
//
// For EACH finished game, the review pipeline's ANALYSIS MATH runs headlessly:
// src/main/analysis/accuracy.ts is esbuild-bundled (verify-classification.mjs
// pattern) and the per-ply flow mirrors src/main/review/review.ts runReview()
// exactly (MultiPV-2 search at fenBefore; played eval reused from PV1/PV2 or
// one extra MultiPV-1 search at fenAfter, negated; delivered checkmate => mate
// 1 & isBest; winPercent -> moveAccuracy -> gameAccuracy(volatility+harmonic);
// cpLoss with the mate->+/-1000 mapping; acpl) at a cheap fixed depth
// (default 11 vs review's 16-20).
//
// Emits JSONL rows (2 per game, one per side) APPENDED to
// scripts/data/elo-corpus.jsonl:
//   { trueElo, oppElo, accuracy, acpl, nMoves, result, color, kind, plies,
//     ending, analysisDepth, gameKey, ts }
// and prints per-band distribution summaries (n, mean/std accuracy, mean acpl)
// over the whole corpus file at the end.
//
// Usage:
//   node scripts/gen-elo-corpus.mjs [--self 7] [--cross1 4] [--cross2 3]
//        [--bands 400,...,2700] [--concurrency 4] [--analysis-depth 11]
//        [--movetime 120] [--max-plies 160] [--out scripts/data/elo-corpus.jsonl]
//        [--fresh] [--engine path]
//
// Runtime guide: a game is ~5-10s to play and ~10-20s to analyze; the default
// schedule (172 games, 344 rows, ~25-28 rows/band) is ~20-30 min at
// concurrency 4. Use --self 1 --cross1 0 --cross2 0 for a smoke pass.

import { execSync } from 'node:child_process'
import { appendFileSync, writeFileSync, mkdirSync, readFileSync, existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { Chess } from 'chessops'
import { makeFen } from 'chessops/fen'
import { parseUci } from 'chessops/util'
import { Uci, defaultEnginePath } from './lib/uci.mjs'
import { weakDepth, weakMultiPv, pickWeakMove } from './lib/weak-model.mjs'

// ---- CLI ---------------------------------------------------------------------------

const argv = process.argv.slice(2)
function flag(name, def) {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : def
}
const has = (name) => argv.includes(`--${name}`)

const SELF_GAMES = Number(flag('self', '7'))
const CROSS1_GAMES = Number(flag('cross1', '4'))
const CROSS2_GAMES = Number(flag('cross2', '3'))
const BANDS = flag('bands', '400,600,800,1000,1200,1320,1500,1700,1900,2100,2300,2500,2700')
  .split(',')
  .map(Number)
const CONCURRENCY = Number(flag('concurrency', '4'))
const ANALYSIS_DEPTH = Number(flag('analysis-depth', '11'))
const MOVETIME = Number(flag('movetime', '120'))
const MAX_PLIES = Number(flag('max-plies', '160'))
const NATIVE_FLOOR = 1320
const BOOK_PLIES = 6

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ENGINE = flag('engine', defaultEnginePath(repoRoot))
const OUT = path.resolve(repoRoot, flag('out', 'scripts/data/elo-corpus.jsonl'))

// ---- Bundle the REAL review math (accuracy.ts) headlessly ---------------------------

const bundleDir = mkdtempSync(path.join(tmpdir(), 'elocorpus-'))
const bundleOut = path.join(bundleDir, 'accuracy.mjs')
execSync(
  `npx esbuild src/main/analysis/accuracy.ts --bundle --platform=node --format=esm --outfile=${bundleOut}`,
  { stdio: 'pipe', cwd: repoRoot }
)
const A = await import(bundleOut)
// winPercent, moveAccuracy, gameAccuracy, acpl, computeIsBest, canonicalUci

// ---- Review-parity per-game analysis -------------------------------------------------

/** review.ts infoToEval parity: missing line => cp 0. */
function infoToEval(line) {
  if (!line) return { cp: 0, mate: null }
  if (line.mate != null) return { cp: null, mate: line.mate }
  return { cp: line.cp ?? 0, mate: null }
}
const negateEval = (e) => ({
  cp: e.cp != null ? -e.cp : null,
  mate: e.mate != null ? -e.mate : null
})
/** review.ts mateToCpSide parity (mate 0 = already mated = losing extreme). */
const mateToCpSide = (mate) => (mate === 0 ? -1000 : Math.sign(mate) * 1000)

/**
 * Analyze one game's plies exactly like review.ts runReview() and return
 * per-side { accuracy, acpl, nMoves } (accuracy rounded to 0.1, acpl rounded —
 * same rounding as review's sideSummary).
 * @param plies [{ uci, fenBefore, fenAfter, mateDelivered }]
 */
async function analyzeGame(eng, plies, depth) {
  eng.send('ucinewgame')
  await eng.ready()
  const perMove = [] // { color, accuracy, cpLoss, winAfter }
  for (const p of plies) {
    const color = p.fenBefore.split(' ')[1] === 'w' ? 'white' : 'black'
    const snap = await eng.analyze(p.fenBefore, depth, 2)
    const best = snap.lines.get(1)
    const second = snap.lines.get(2)
    const bestEval = infoToEval(best) // mover POV
    const bestPv = best?.pv ?? []
    const bestUci = bestPv[0] ?? p.uci
    const secondUci = second?.pv?.[0] ?? null
    const secondEval = second ? infoToEval(second) : null

    const playedC = A.canonicalUci(p.fenBefore, p.uci)
    const bestC = A.canonicalUci(p.fenBefore, bestUci)
    const secondC = secondUci ? A.canonicalUci(p.fenBefore, secondUci) : null

    let playedEval
    if (p.mateDelivered) {
      playedEval = { cp: null, mate: 1 }
    } else if (playedC === bestC) {
      playedEval = bestEval
    } else if (secondC != null && playedC === secondC && secondEval) {
      playedEval = secondEval
    } else {
      const afterSnap = await eng.analyze(p.fenAfter, depth, 1)
      // Opponent POV (they are to move) -> negate to the mover's POV.
      playedEval = negateEval(infoToEval(afterSnap.lines.get(1)))
    }

    const winBefore = A.winPercent(bestEval.cp, bestEval.mate)
    const winAfter = A.winPercent(playedEval.cp, playedEval.mate)
    const accuracy = A.moveAccuracy(winBefore, winAfter)
    const cpBefore = bestEval.mate != null ? mateToCpSide(bestEval.mate) : (bestEval.cp ?? 0)
    const cpAfter = playedEval.mate != null ? mateToCpSide(playedEval.mate) : (playedEval.cp ?? 0)
    const cpLoss = Math.max(0, Math.min(1000, cpBefore - cpAfter))
    perMove.push({ color, accuracy, cpLoss, winAfter })
  }

  // Summaries — review.ts summarize()/sideSummary() parity.
  const whitePovWin = []
  const blackPovWin = []
  const acc = { white: [], black: [] }
  const loss = { white: [], black: [] }
  const idx = { white: [], black: [] }
  perMove.forEach((m, i) => {
    const whitePov = m.color === 'white' ? m.winAfter : 100 - m.winAfter
    whitePovWin.push(whitePov)
    blackPovWin.push(100 - whitePov)
    acc[m.color].push(m.accuracy)
    loss[m.color].push(m.cpLoss)
    idx[m.color].push(i)
  })
  const side = (c) => ({
    accuracy:
      Math.round(A.gameAccuracy(acc[c], c === 'white' ? whitePovWin : blackPovWin, idx[c]) * 10) /
      10,
    acpl: Math.round(A.acpl(loss[c])),
    nMoves: acc[c].length
  })
  return { white: side('white'), black: side('black') }
}

// ---- Game play -----------------------------------------------------------------------

/** Configure a player engine for its band before a game. */
async function configurePlayer(eng, elo) {
  if (elo >= NATIVE_FLOOR) {
    eng.setOption('UCI_LimitStrength', 'true')
    eng.setOption('UCI_Elo', elo)
  } else {
    // Weak path plays FULL-strength short searches; the pick model weakens choice.
    eng.setOption('UCI_LimitStrength', 'false')
    eng.setOption('Skill Level', 20)
  }
  eng.send('ucinewgame')
  await eng.ready()
}

/** One player move; returns { uci, cp } with cp side-to-move POV (clamped). */
async function playerMove(eng, elo, fen, fullmove) {
  if (elo >= NATIVE_FLOOR) {
    const { move, cp } = await eng.bestMove(fen, { movetime: MOVETIME })
    return { uci: move, cp }
  }
  const { cands, best } = await eng.searchMultiPv(fen, weakDepth(elo), weakMultiPv(elo))
  if (best === '(none)' || !best) return { uci: null, cp: 0 }
  const uci = cands.length ? pickWeakMove(cands, elo, fullmove, false) : best
  const cp = cands.find((c) => c.uci === uci)?.cp ?? cands[0]?.cp ?? 0
  return { uci, cp }
}

/** Random-but-sane opening: uniform among candidates within 60cp of best (depth 8). */
async function randomOpening(eng, pos, plies) {
  const out = []
  for (let i = 0; i < plies; i++) {
    const fen = makeFen(pos.toSetup())
    const { lines } = await eng.analyze(fen, 8, 6)
    const cands = [...lines.values()]
      .filter((l) => l.pv.length > 0)
      .map((l) => ({ uci: l.pv[0], cp: l.mate != null ? (l.mate > 0 ? 10000 : -10000) : l.cp }))
    if (cands.length === 0) break
    const best = Math.max(...cands.map((c) => c.cp))
    const ok = cands.filter((c) => best - c.cp <= 60)
    const pick = ok[Math.floor(Math.random() * ok.length)]
    const mv = parseUci(pick.uci)
    if (!mv || !pos.isLegal(mv)) break
    const fenBefore = fen
    pos.play(mv)
    out.push({ uci: pick.uci, fenBefore, fenAfter: makeFen(pos.toSetup()), mateDelivered: false })
  }
  return out
}

/**
 * Plays one game whiteElo vs blackElo. Returns { plies, resultWhite, ending }
 * with resultWhite in {1, 0.5, 0} and ending one of
 * mate|stalemate|draw|50move|adjudicated|plycap.
 */
async function playGame(whiteEng, blackEng, analyzerEng, whiteElo, blackElo) {
  await configurePlayer(whiteEng, whiteElo)
  await configurePlayer(blackEng, blackElo)

  const pos = Chess.default()
  const plies = await randomOpening(analyzerEng, pos, BOOK_PLIES)

  let hopelessStreak = 0
  let hopelessSign = 0
  let lastWhiteCp = 0

  while (plies.length < MAX_PLIES) {
    if (pos.isEnd()) break
    if (pos.halfmoves >= 100) return { plies, resultWhite: 0.5, ending: '50move' }
    const fen = makeFen(pos.toSetup())
    const whiteToMove = pos.turn === 'white'
    const [eng, elo] = whiteToMove ? [whiteEng, whiteElo] : [blackEng, blackElo]
    const { uci, cp } = await playerMove(eng, elo, fen, pos.fullmoves)
    if (!uci || uci === '(none)') break

    // Adjudication bookkeeping (white-POV eval from the mover's own search).
    const whiteCp = whiteToMove ? cp : -cp
    lastWhiteCp = whiteCp
    const sign = whiteCp > 0 ? 1 : -1
    if (Math.abs(whiteCp) >= 800 && (hopelessSign === 0 || sign === hopelessSign)) {
      hopelessStreak++
      hopelessSign = sign
    } else {
      hopelessStreak = 0
      hopelessSign = 0
    }

    const mv = parseUci(uci)
    if (!mv || !pos.isLegal(mv)) throw new Error(`illegal move ${uci} in ${fen}`)
    pos.play(mv)
    plies.push({
      uci,
      fenBefore: fen,
      fenAfter: makeFen(pos.toSetup()),
      mateDelivered: pos.isCheckmate()
    })

    if (hopelessStreak >= 6) {
      return { plies, resultWhite: hopelessSign > 0 ? 1 : 0, ending: 'adjudicated' }
    }
  }

  const outcome = pos.outcome()
  if (outcome && outcome.winner) {
    return { plies, resultWhite: outcome.winner === 'white' ? 1 : 0, ending: 'mate' }
  }
  if (pos.isEnd()) return { plies, resultWhite: 0.5, ending: 'stalemate' }
  // Ply cap: score by the last seen eval.
  const resultWhite = lastWhiteCp >= 250 ? 1 : lastWhiteCp <= -250 ? 0 : 0.5
  return { plies, resultWhite, ending: 'plycap' }
}

// ---- Schedule -------------------------------------------------------------------------

function buildSchedule() {
  const games = []
  for (let i = 0; i < BANDS.length; i++) {
    // Edge bands get 2 extra self-play games (they have fewer cross partners).
    const bonus = i === 0 || i === BANDS.length - 1 ? 2 : 0
    for (let g = 0; g < SELF_GAMES + bonus; g++) games.push([BANDS[i], BANDS[i]])
    if (i + 1 < BANDS.length) {
      for (let g = 0; g < CROSS1_GAMES; g++) {
        games.push(g % 2 === 0 ? [BANDS[i], BANDS[i + 1]] : [BANDS[i + 1], BANDS[i]])
      }
    }
    if (i + 2 < BANDS.length) {
      for (let g = 0; g < CROSS2_GAMES; g++) {
        games.push(g % 2 === 0 ? [BANDS[i], BANDS[i + 2]] : [BANDS[i + 2], BANDS[i]])
      }
    }
  }
  // Shuffle so partial runs still cover all bands roughly evenly.
  for (let i = games.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[games[i], games[j]] = [games[j], games[i]]
  }
  return games
}

// ---- Runner ---------------------------------------------------------------------------

async function main() {
  mkdirSync(path.dirname(OUT), { recursive: true })
  if (has('fresh')) writeFileSync(OUT, '')

  const schedule = buildSchedule()
  console.log(`engine: ${ENGINE}`)
  console.log(
    `games: ${schedule.length} (self ${SELF_GAMES}/band +2 edge, cross1 ${CROSS1_GAMES}, cross2 ${CROSS2_GAMES}) | ` +
      `analysis depth ${ANALYSIS_DEPTH} | movetime ${MOVETIME}ms | out: ${path.relative(repoRoot, OUT)}`
  )

  let nextGame = 0
  let done = 0
  let failed = 0
  const t0 = Date.now()

  async function worker(wid) {
    const whiteEng = new Uci(ENGINE)
    const blackEng = new Uci(ENGINE)
    const analyzerEng = new Uci(ENGINE)
    await whiteEng.init()
    await blackEng.init()
    await analyzerEng.init()
    // Analyzer mirrors review.ts engine setup (full strength; review uses Hash 128).
    analyzerEng.setOption('UCI_LimitStrength', 'false')
    analyzerEng.setOption('Skill Level', 20)
    analyzerEng.setOption('Hash', 128)

    while (true) {
      const i = nextGame++
      if (i >= schedule.length) break
      const [whiteElo, blackElo] = schedule[i]
      try {
        const { plies, resultWhite, ending } = await playGame(
          whiteEng,
          blackEng,
          analyzerEng,
          whiteElo,
          blackElo
        )
        if (plies.length < 8) throw new Error(`degenerate game (${plies.length} plies)`)
        const s = await analyzeGame(analyzerEng, plies, ANALYSIS_DEPTH)
        const gameKey = `g${Date.now().toString(36)}-${wid}-${i}`
        const ts = Date.now()
        const rows = [
          {
            trueElo: whiteElo,
            oppElo: blackElo,
            ...s.white,
            result: resultWhite,
            color: 'white',
            kind: whiteElo >= NATIVE_FLOOR ? 'native' : 'weak',
            plies: plies.length,
            ending,
            analysisDepth: ANALYSIS_DEPTH,
            gameKey,
            ts
          },
          {
            trueElo: blackElo,
            oppElo: whiteElo,
            ...s.black,
            result: 1 - resultWhite,
            color: 'black',
            kind: blackElo >= NATIVE_FLOOR ? 'native' : 'weak',
            plies: plies.length,
            ending,
            analysisDepth: ANALYSIS_DEPTH,
            gameKey,
            ts
          }
        ]
        appendFileSync(OUT, rows.map((r) => JSON.stringify(r)).join('\n') + '\n')
        done++
        const el = ((Date.now() - t0) / 1000).toFixed(0)
        process.stderr.write(
          `\r  game ${done}/${schedule.length} done (${failed} failed, ${el}s)  ` +
            `last: ${whiteElo}v${blackElo} ${ending} ${plies.length}p ` +
            `wAcc ${s.white.accuracy} bAcc ${s.black.accuracy}   `
        )
      } catch (e) {
        failed++
        process.stderr.write(`\n  game ${i} (${whiteElo}v${blackElo}) error: ${e.message} (skipped)\n`)
      }
    }
    whiteEng.quit()
    blackEng.quit()
    analyzerEng.quit()
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, schedule.length) }, (_, w) => worker(w))
  )
  process.stderr.write('\n')
  printSummary()
}

function printSummary() {
  if (!existsSync(OUT)) return
  const rows = readFileSync(OUT, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l))
  const byBand = new Map()
  for (const r of rows) {
    if (!byBand.has(r.trueElo)) byBand.set(r.trueElo, [])
    byBand.get(r.trueElo).push(r)
  }
  const stats = (xs) => {
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length
    const std = Math.sqrt(xs.reduce((a, b) => a + (b - mean) * (b - mean), 0) / xs.length)
    return { mean, std }
  }
  console.log(`\ncorpus: ${rows.length} rows total (${path.relative(repoRoot, OUT)})`)
  console.log('band   n     accMean accStd  acplMean  movesMean  score%')
  for (const band of [...byBand.keys()].sort((a, b) => a - b)) {
    const rs = byBand.get(band)
    const a = stats(rs.map((r) => r.accuracy))
    const c = stats(rs.map((r) => r.acpl))
    const m = stats(rs.map((r) => r.nMoves))
    const sc = (100 * rs.reduce((x, r) => x + r.result, 0)) / rs.length
    console.log(
      `${String(band).padEnd(6)} ${String(rs.length).padEnd(5)} ` +
        `${a.mean.toFixed(1).padEnd(7)} ${a.std.toFixed(1).padEnd(7)} ` +
        `${c.mean.toFixed(0).padEnd(9)} ${m.mean.toFixed(0).padEnd(10)} ${sc.toFixed(0)}`
    )
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
