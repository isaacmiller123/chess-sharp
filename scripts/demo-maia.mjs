#!/usr/bin/env node
// Proof-of-life for the Maia "Human" bot path: spawn lc0 with a maia weight
// file, feed it a position over UCI, `go nodes 1`, print the reply move.
// Mirrors what src/main/engine/MaiaPool.ts + engine.ipc's level.maia path do
// inside the app, but standalone (no Electron) so it runs headless:
//
//   export PATH=/opt/homebrew/bin:$PATH
//   node scripts/demo-maia.mjs [level] [fen]
//
// lc0 resolution matches datasets/maia.ts: imported datasets binary first
// (.devdata in dev), then the Homebrew install (mac dev fallback).
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const maiaDir = path.join(root, '.devdata', 'datasets', 'maia')

const level = Number(process.argv[2] ?? 1500)
const fen = process.argv[3] ?? 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1' // after 1.e4

const weights = path.join(maiaDir, 'weights', `maia-${level}.pb.gz`)
if (!existsSync(weights)) {
  console.error(`missing weights: ${weights}`)
  process.exit(1)
}
const lc0 = [path.join(maiaDir, 'lc0'), '/opt/homebrew/bin/lc0'].find(existsSync)
if (!lc0) {
  console.error('lc0 binary not found (datasets or homebrew)')
  process.exit(1)
}

const proc = spawn(lc0, [`--weights=${weights}`], { stdio: ['pipe', 'pipe', 'inherit'] })
const t0 = Date.now()
let buf = ''
let phase = 'uci'
proc.stdout.setEncoding('utf-8')
proc.stdout.on('data', (chunk) => {
  buf += chunk
  let nl
  while ((nl = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, nl).trim()
    buf = buf.slice(nl + 1)
    if (phase === 'uci' && line === 'uciok') {
      phase = 'ready'
      proc.stdin.write('setoption name Threads value 1\nisready\n')
    } else if (phase === 'ready' && line === 'readyok') {
      phase = 'go'
      proc.stdin.write(`position fen ${fen}\ngo nodes 1\n`)
    } else if (line.startsWith('bestmove')) {
      const move = line.split(/\s+/)[1]
      console.log(
        JSON.stringify({ engine: lc0, level, fen, bestmove: move, ms: Date.now() - t0 })
      )
      proc.stdin.write('quit\n')
      setTimeout(() => {
        proc.kill()
        process.exit(0)
      }, 150)
    }
  }
})
proc.on('error', (e) => {
  console.error(`spawn failed: ${e.message}`)
  process.exit(1)
})
setTimeout(() => {
  console.error('timeout waiting for bestmove')
  proc.kill()
  process.exit(1)
}, 30000)
proc.stdin.write('uci\n')
