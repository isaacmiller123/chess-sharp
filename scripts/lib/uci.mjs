// Minimal UCI driver + engine path helper, shared by the engine-vs-engine
// harnesses (scripts/calibrate-weak.mjs, scripts/gen-elo-corpus.mjs).
//
// Extracted from scripts/calibrate-weak.mjs so the harnesses can't drift.
// Two families of search methods:
//  - searchMultiPv / bestMove: the PLAY path. cp is clamped to +/-1000 and mate
//    folds into +/-1000, mirroring engine.ipc.ts lineCp() (weak pick model).
//  - analyze: the REVIEW path. Raw cp / mate are kept separate (no clamping),
//    mirroring review.ts infoToEval() so headless accuracy math matches the
//    real review pipeline exactly.

import { spawn } from 'node:child_process'
import path from 'node:path'

/** Default bundled Stockfish for this platform, given the repo root. */
export function defaultEnginePath(repoRoot) {
  return process.platform === 'win32'
    ? path.join(repoRoot, 'resources', 'engine', 'win', 'stockfish.exe')
    : path.join(repoRoot, 'resources', 'engine', 'mac', 'stockfish')
}

export class Uci {
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

  setOption(name, value) {
    this.send(`setoption name ${name} value ${value}`)
  }

  wait(test, timeoutMs = 60000) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(
        () => reject(new Error(`uci timeout waiting (last: ${this.lines.at(-1)})`)),
        timeoutMs
      )
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
    this.setOption('Threads', 1)
    this.setOption('Hash', 16)
    await this.ready()
  }

  async ready() {
    this.send('isready')
    await this.wait((l) => (l === 'readyok' ? true : undefined))
  }

  // ---- PLAY path (clamped cp, mate -> +/-1000; mirrors engine.ipc lineCp) --------

  /** go depth d with MultiPV; returns { cands: [{uci,cp}] sorted best-first, best }. */
  async searchMultiPv(fen, depth, multipv) {
    this.setOption('MultiPV', multipv)
    this.send(`position fen ${fen}`)
    const byIdx = new Map()
    const infoWaiter = { test: (l) => this.#parseInfoClamped(l, byIdx), resolve: () => {} }
    this.waiters.push(infoWaiter)
    this.send(`go depth ${depth}`)
    const best = await this.wait((l) => (l.startsWith('bestmove') ? l.split(' ')[1] : undefined))
    this.waiters.splice(this.waiters.indexOf(infoWaiter), 1)
    const cands = [...byIdx.values()].filter((c) => c.uci)
    cands.sort((a, b) => b.cp - a.cp)
    return { cands, best }
  }

  /**
   * Single best move under a limit ({ depth } or { movetime }, ms). Returns
   * { move, cp } with cp from the side-to-move POV (clamped, mate -> +/-1000).
   */
  async bestMove(fen, limit) {
    this.setOption('MultiPV', 1)
    this.send(`position fen ${fen}`)
    const byIdx = new Map()
    const infoWaiter = { test: (l) => this.#parseInfoClamped(l, byIdx), resolve: () => {} }
    this.waiters.push(infoWaiter)
    if (limit.depth != null) this.send(`go depth ${limit.depth}`)
    else this.send(`go movetime ${limit.movetime}`)
    const move = await this.wait((l) => (l.startsWith('bestmove') ? l.split(' ')[1] : undefined))
    this.waiters.splice(this.waiters.indexOf(infoWaiter), 1)
    return { move, cp: byIdx.get(1)?.cp ?? 0 }
  }

  #parseInfoClamped(line, byIdx) {
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

  // ---- REVIEW path (raw cp / mate kept separate; mirrors review.ts) --------------

  /**
   * Analyze a FEN at fixed depth with MultiPV n, mirroring review.ts analyzeFen:
   * returns { lines: Map(idx -> { cp, mate, pv: string[] }) } with the LATEST
   * info line per multipv index that carried a pv. cp is raw (unclamped); mate
   * is the signed mate distance (side-to-move POV). `best` is the engine's
   * bestmove token (may be '(none)').
   */
  async analyze(fen, depth, multipv) {
    this.setOption('MultiPV', multipv)
    this.send(`position fen ${fen}`)
    const lines = new Map()
    const collector = {
      test: (l) => {
        if (!l.startsWith('info ') || !l.includes(' pv ')) return undefined
        const m = l.match(/ multipv (\d+)/)
        const idx = m ? Number(m[1]) : 1
        const cpM = l.match(/ score cp (-?\d+)/)
        const mateM = l.match(/ score mate (-?\d+)/)
        const pvM = l.match(/ pv (.+)$/)
        const pv = pvM ? pvM[1].trim().split(/\s+/) : []
        if (pv.length === 0) return undefined
        if (mateM) lines.set(idx, { cp: null, mate: Number(mateM[1]), pv })
        else lines.set(idx, { cp: cpM ? Number(cpM[1]) : 0, mate: null, pv })
        return undefined
      },
      resolve: () => {}
    }
    this.waiters.push(collector)
    this.send(`go depth ${depth}`)
    const best = await this.wait((l) => (l.startsWith('bestmove') ? l.split(' ')[1] : undefined))
    this.waiters.splice(this.waiters.indexOf(collector), 1)
    return { lines, best }
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
