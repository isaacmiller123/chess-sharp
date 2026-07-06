#!/usr/bin/env node
// Calibration harness for the sub-1320 weak-bot pick model (spec: docs/
// GAMES-PLATFORM-SPEC.md §Bot side-quests item 1).
//
// For each target band (default 400/600/800/1000/1200) it plays N fast games
// between a candidate weak config and a reference anchor: the SAME Stockfish
// binary at UCI_Elo 1320 (the native floor), searching at a small fixed depth.
// Score% vs the anchor is converted to an implied Elo gap:
//     impliedElo = 1320 + 400*log10(score/(1-score))
// A well-calibrated band should come out near its label, and MUST be
// monotonically ordered (400 << 1200 << 1320).
//
// The pick model here MIRRORS src/main/ipc/engine.ipc.ts (weakDepth /
// weakMultiPv / weakTemperature / gapKnee / weakBlunderChance /
// blunderGapWindow / pickWeakMove). Keep the two in sync when tuning.
// TODO(P2): unify via a shared pure module (src/main/engine/weakModel.ts)
// loaded with tsx so the harness can't drift from production.
//
// Usage:
//   node scripts/calibrate-weak.mjs [--games 40] [--bands 400,600,800,1000,1200]
//        [--models new,old] [--concurrency 4] [--engine path/to/stockfish]
//        [--anchor-depth 8] [--max-plies 180]
//
// Runtime guide: one game is a few seconds (depth<=8 both sides + eval
// adjudication of hopeless positions). 40 games x 5 bands at concurrency 4 is
// roughly 10-20 minutes; use --games 6 for a minutes-long smoke pass.

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { Chess } from 'chessops'
import { makeFen } from 'chessops/fen'
import { parseUci } from 'chessops/util'

// ---- CLI -------------------------------------------------------------------------

const argv = process.argv.slice(2)
function flag(name, def) {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : def
}
const GAMES = Number(flag('games', '40'))
const BANDS = flag('bands', '400,600,800,1000,1200').split(',').map(Number)
const MODELS = flag('models', 'new').split(',') // new | old
const CONCURRENCY = Number(flag('concurrency', '4'))
const ANCHOR_DEPTH = Number(flag('anchor-depth', '8'))
const MAX_PLIES = Number(flag('max-plies', '180'))
const ANCHOR_ELO = 1320

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const defaultEngine =
  process.platform === 'win32'
    ? path.join(repoRoot, 'resources', 'engine', 'win', 'stockfish.exe')
    : path.join(repoRoot, 'resources', 'engine', 'mac', 'stockfish')
const ENGINE = flag('engine', defaultEngine)

// ---- Pick model (MIRROR of src/main/ipc/engine.ipc.ts) ----------------------------

function lerpByElo(elo, e0, v0, e1, v1) {
  const t = Math.max(0, Math.min(1, (elo - e0) / (e1 - e0)))
  return v0 + t * (v1 - v0)
}
function curveByElo(elo, points) {
  if (elo <= points[0][0]) return points[0][1]
  for (let i = 1; i < points.length; i++) {
    if (elo <= points[i][0])
      return lerpByElo(elo, points[i - 1][0], points[i - 1][1], points[i][0], points[i][1])
  }
  return points[points.length - 1][1]
}
const weakDepth = (elo) => Math.round(lerpByElo(elo, 100, 4, 1250, 7))
const weakMultiPv = (elo) => (elo < 600 ? 8 : elo < 1000 ? 7 : 6)
const weakTemperature = (elo) => lerpByElo(elo, 100, 650, 1250, 170)
const gapKnee = (elo) =>
  curveByElo(elo, [
    [100, 4000],
    [600, 1200],
    [1000, 500],
    [1300, 250]
  ])
const weakBlunderChance = (elo) =>
  curveByElo(elo, [
    [100, 0.3],
    [400, 0.22],
    [600, 0.15],
    [800, 0.1],
    [1000, 0.06],
    [1200, 0.04],
    [1319, 0.025]
  ])
function blunderGapWindow(elo) {
  const min = lerpByElo(elo, 100, 60, 1300, 150)
  const max = elo < 700 ? Number.POSITIVE_INFINITY : lerpByElo(elo, 700, 1200, 1300, 400)
  return [min, max]
}
const openingFullmoves = (elo) => Math.round(lerpByElo(elo, 100, 8, 1300, 4))

function softmaxPick(cands, temperature, knee) {
  const maxCp = cands[0].cp
  const weights = cands.map((c) => {
    const gap = maxCp - c.cp
    return Math.exp(-(gap / temperature) * (1 + gap / knee))
  })
  const total = weights.reduce((a, b) => a + b, 0)
  let r = Math.random() * total
  for (let i = 0; i < cands.length; i++) {
    r -= weights[i]
    if (r <= 0) return cands[i].uci
  }
  return cands[cands.length - 1].uci
}

/** NEW model — mirrors pickWeakMove in engine.ipc.ts. */
function pickNew(cands, elo, fullmove) {
  const inOpening = fullmove <= openingFullmoves(elo) && Math.abs(cands[0].cp) < 120
  const knee = gapKnee(elo)
  if (inOpening) return softmaxPick(cands, weakTemperature(elo) * 1.8, knee)
  if (cands.length >= 2 && Math.random() < weakBlunderChance(elo)) {
    const [minGap, maxGap] = blunderGapWindow(elo)
    const best = cands[0].cp
    const window = cands.filter((c) => best - c.cp >= minGap && best - c.cp <= maxGap)
    if (window.length > 0) return window[Math.floor(Math.random() * window.length)].uci
  }
  return softmaxPick(cands, weakTemperature(elo), knee)
}

/** OLD model — the flat softmax + bottom-half blunder this branch replaced. */
function pickOld(cands, elo) {
  const oldTemp = lerpByElo(elo, 100, 650, 1250, 50)
  const oldBlunder = lerpByElo(elo, 100, 0.25, 1300, 0.03)
  if (cands.length >= 2 && Math.random() < oldBlunder) {
    const bottom = cands.slice(Math.ceil(cands.length / 2))
    return bottom[Math.floor(Math.random() * bottom.length)].uci
  }
  // flat softmax (knee -> infinity)
  return softmaxPick(cands, oldTemp, Number.POSITIVE_INFINITY)
}

// ---- Minimal UCI driver ------------------------------------------------------------

class Uci {
  constructor(bin) {
    this.proc = spawn(bin, [], { stdio: ['pipe', 'pipe', 'ignore'] })
    this.buf = ''
    this.waiters = [] // { test(line) -> value|undefined, resolve }
    this.lines = []
    this.proc.stdout.on('data', (d) => {
      this.buf += d.toString()
      let i
      while ((i = this.buf.indexOf('\n')) >= 0) {
        const line = this.buf.slice(0, i).trim()
        this.buf = this.buf.slice(i + 1)
        this.lines.push(line)
        for (let w = this.waiters.length - 1; w >= 0; w--) {
          const v = this.waiters[w].test(line)
          if (v !== undefined) {
            const { resolve } = this.waiters[w]
            this.waiters.splice(w, 1)
            resolve(v)
          }
        }
      }
    })
  }
  send(cmd) {
    this.proc.stdin.write(cmd + '\n')
  }
  wait(test, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`uci timeout waiting (last: ${this.lines.at(-1)})`)), timeoutMs)
      this.waiters.push({
        test,
        resolve: (v) => {
          clearTimeout(t)
          resolve(v)
        }
      })
    })
  }
  async init() {
    this.send('uci')
    await this.wait((l) => (l === 'uciok' ? true : undefined))
    this.send('setoption name Threads value 1')
    this.send('setoption name Hash value 16')
    await this.ready()
  }
  async ready() {
    this.send('isready')
    await this.wait((l) => (l === 'readyok' ? true : undefined))
  }
  /** go depth d with MultiPV; returns { cands: [{uci,cp}] sorted best-first, best } */
  async searchMultiPv(fen, depth, multipv) {
    this.send(`setoption name MultiPV value ${multipv}`)
    this.send(`position fen ${fen}`)
    const byIdx = new Map()
    const infoWaiter = { test: (l) => this.parseInfo(l, byIdx), resolve: () => {} }
    this.waiters.push(infoWaiter)
    this.send(`go depth ${depth}`)
    const best = await this.wait((l) => (l.startsWith('bestmove') ? l.split(' ')[1] : undefined))
    this.waiters.splice(this.waiters.indexOf(infoWaiter), 1)
    const cands = [...byIdx.values()].filter((c) => c.uci)
    cands.sort((a, b) => b.cp - a.cp)
    return { cands, best }
  }
  parseInfo(line, byIdx) {
    if (!line.startsWith('info ') || !line.includes(' pv ')) return undefined
    const m = line.match(/ multipv (\d+)/)
    const idx = m ? Number(m[1]) : 1
    const cpM = line.match(/ score cp (-?\d+)/)
    const mateM = line.match(/ score mate (-?\d+)/)
    const pvM = line.match(/ pv (\S+)/)
    let cp = 0
    if (mateM) cp = Number(mateM[1]) > 0 ? 1000 : -1000
    else if (cpM) cp = Math.max(-1000, Math.min(1000, Number(cpM[1])))
    byIdx.set(idx, { uci: pvM ? pvM[1] : undefined, cp })
    return undefined // never resolves; pure collector
  }
  /** Anchor move at UCI_Elo, fixed depth. Returns { move, cp } (cp side-to-move). */
  async anchorMove(fen, depth) {
    this.send('setoption name MultiPV value 1')
    this.send(`position fen ${fen}`)
    const byIdx = new Map()
    const infoWaiter = { test: (l) => this.parseInfo(l, byIdx), resolve: () => {} }
    this.waiters.push(infoWaiter)
    this.send(`go depth ${depth}`)
    const move = await this.wait((l) => (l.startsWith('bestmove') ? l.split(' ')[1] : undefined))
    this.waiters.splice(this.waiters.indexOf(infoWaiter), 1)
    return { move, cp: byIdx.get(1)?.cp ?? 0 }
  }
  quit() {
    try {
      this.send('quit')
    } catch {
      /* already dead */
    }
    setTimeout(() => this.proc.kill(), 500).unref?.()
  }
}

// ---- One game ---------------------------------------------------------------------

/**
 * Plays one game: weak(model,elo) vs anchor(1320). weakIsWhite alternates.
 * Returns weak bot's score: 1 / 0.5 / 0.
 */
async function playGame(weakEng, anchorEng, model, elo, weakIsWhite) {
  const pos = Chess.default()
  let plies = 0
  let hopelessStreak = 0 // consecutive anchor evals >= +8 pawns for one side
  while (plies < MAX_PLIES) {
    if (pos.isEnd()) break
    if (pos.halfmoves >= 100) return 0.5 // 50-move rule
    const fen = makeFen(pos.toSetup())
    const whiteToMove = pos.turn === 'white'
    const weakToMove = whiteToMove === weakIsWhite
    let uci
    if (weakToMove) {
      const { cands, best } = await weakEng.searchMultiPv(fen, weakDepth(elo), weakMultiPv(elo))
      if (best === '(none)' || !best) break
      const fullmove = pos.fullmoves
      uci = cands.length ? (model === 'old' ? pickOld(cands, elo) : pickNew(cands, elo, fullmove)) : best
    } else {
      const { move, cp } = await anchorEng.anchorMove(fen, ANCHOR_DEPTH)
      if (move === '(none)' || !move) break
      uci = move
      // Adjudicate hopeless games early (cp is anchor's side-to-move view).
      if (Math.abs(cp) >= 800) hopelessStreak++
      else hopelessStreak = 0
      if (hopelessStreak >= 3) {
        const anchorWinning = cp > 0
        const weakWins = anchorWinning === false
        return weakWins ? 1 : 0
      }
    }
    const move = parseUci(uci)
    if (!move || !pos.isLegal(move)) {
      throw new Error(`illegal move ${uci} in ${fen}`)
    }
    pos.play(move)
    plies++
  }
  const outcome = pos.outcome()
  if (outcome && outcome.winner) {
    return (outcome.winner === 'white') === weakIsWhite ? 1 : 0
  }
  if (pos.isEnd()) return 0.5 // stalemate / insufficient material
  // Ply cap without adjudication: score by final anchor eval.
  const { cp } = await anchorEng.anchorMove(makeFen(pos.toSetup()), ANCHOR_DEPTH)
  const stmIsWeak = (pos.turn === 'white') === weakIsWhite
  const weakCp = stmIsWeak ? cp : -cp
  return weakCp >= 250 ? 1 : weakCp <= -250 ? 0 : 0.5
}

// ---- Runner -----------------------------------------------------------------------

function impliedElo(score, n) {
  // Clamp so 0% / 100% at small N stays finite (half-a-game correction).
  const s = Math.min(1 - 0.5 / n, Math.max(0.5 / n, score))
  return Math.round(ANCHOR_ELO + 400 * Math.log10(s / (1 - s)))
}

async function runConfig(model, elo) {
  let scoreSum = 0
  let done = 0
  const results = []
  let gameIdx = 0
  async function worker() {
    const weakEng = new Uci(ENGINE)
    const anchorEng = new Uci(ENGINE)
    await weakEng.init()
    await anchorEng.init()
    weakEng.send('setoption name UCI_LimitStrength value false')
    weakEng.send('setoption name Skill Level value 20')
    anchorEng.send('setoption name UCI_LimitStrength value true')
    anchorEng.send(`setoption name UCI_Elo value ${ANCHOR_ELO}`)
    while (true) {
      const i = gameIdx++
      if (i >= GAMES) break
      weakEng.send('ucinewgame')
      anchorEng.send('ucinewgame')
      await weakEng.ready()
      await anchorEng.ready()
      try {
        const s = await playGame(weakEng, anchorEng, model, elo, i % 2 === 0)
        scoreSum += s
        done++
        results.push(s)
        process.stderr.write(
          `\r  [${model} ${elo}] game ${done}/${GAMES}  score so far ${(100 * scoreSum) / done | 0}%   `
        )
      } catch (e) {
        process.stderr.write(`\n  [${model} ${elo}] game ${i} error: ${e.message} (skipped)\n`)
      }
    }
    weakEng.quit()
    anchorEng.quit()
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, GAMES) }, worker))
  process.stderr.write('\n')
  const n = done || 1
  const score = scoreSum / n
  const wins = results.filter((r) => r === 1).length
  const draws = results.filter((r) => r === 0.5).length
  return { model, elo, n: done, score, wins, draws, losses: done - wins - draws, implied: impliedElo(score, n) }
}

async function main() {
  console.log(`engine: ${ENGINE}`)
  console.log(`anchor: UCI_Elo ${ANCHOR_ELO} @ depth ${ANCHOR_DEPTH} | games/config: ${GAMES} | models: ${MODELS.join(',')}`)
  const rows = []
  for (const elo of BANDS) {
    for (const model of MODELS) {
      rows.push(await runConfig(model, elo))
    }
  }
  console.log('\nband   model  games  W-D-L      score%   impliedElo  target  err')
  for (const r of rows) {
    console.log(
      `${String(r.elo).padEnd(6)} ${r.model.padEnd(6)} ${String(r.n).padEnd(6)} ` +
        `${`${r.wins}-${r.draws}-${r.losses}`.padEnd(10)} ${(100 * r.score).toFixed(1).padEnd(8)} ` +
        `${String(r.implied).padEnd(11)} ${String(r.elo).padEnd(7)} ${r.implied - r.elo >= 0 ? '+' : ''}${r.implied - r.elo}`
    )
  }
  console.log(
    '\nNote: at small N the 95% CI is wide (~±100-200 Elo at N=40). Direction and\nmonotonic ordering across bands matter more than absolute values.'
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
