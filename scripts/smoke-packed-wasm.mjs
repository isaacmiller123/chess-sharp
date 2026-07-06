// Packaged-app CSP/WASM smoke: proves ffish (xiangqi / Variant Lab) loads
// under the strict PROD_CSP of the PACKED app — the exact failure class that
// shipped blind in v1.1.0 because dev's CSP carries 'unsafe-eval'.
//
//   npm run build && npx electron-builder --dir && npm run smoke:packed-wasm
//
// Spawns the packed mac binary directly (Contents/MacOS/Chess#) with
// --smoke-wasm: main hides the window, isolates userData in a temp dir, boots
// the real renderer plus the ffish probe (src/renderer/src/smokeWasm.ts), and
// exits 0 only if the probe prints SMOKE-WASM-OK with zero CSP violations
// (see src/main/smokeWasm.ts for the protocol). Exit code here mirrors the
// app's. Final line: 'PACKED-WASM SMOKE PASS' on success.

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const TIMEOUT_MS = 120000

const candidates =
  process.platform === 'darwin'
    ? [
        `release/mac-${process.arch}/Chess#.app/Contents/MacOS/Chess#`,
        'release/mac/Chess#.app/Contents/MacOS/Chess#',
        'release/mac-arm64/Chess#.app/Contents/MacOS/Chess#',
        'release/mac-x64/Chess#.app/Contents/MacOS/Chess#'
      ]
    : ['release/win-unpacked/Chess#.exe']

const bin = candidates.map((c) => resolve(ROOT, c)).find((p) => existsSync(p))
if (!bin) {
  console.error(
    'PACKED-WASM SMOKE FAIL: no packed binary found under release/ — run: npm run build && npx electron-builder --dir'
  )
  process.exit(1)
}

console.log(`launching packed binary: ${bin}`)
const child = spawn(bin, ['--smoke-wasm'], {
  env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1' },
  stdio: ['ignore', 'pipe', 'pipe']
})

const killTimer = setTimeout(() => {
  console.error(`PACKED-WASM SMOKE FAIL: no exit within ${TIMEOUT_MS}ms — killing`)
  child.kill('SIGKILL')
}, TIMEOUT_MS)

child.stdout.on('data', (d) => process.stdout.write(d))
child.stderr.on('data', (d) => process.stderr.write(d))

child.on('exit', (code, signal) => {
  clearTimeout(killTimer)
  if (code === 0) {
    console.log('PACKED-WASM SMOKE PASS')
    process.exit(0)
  }
  console.error(`PACKED-WASM SMOKE FAIL (code=${code} signal=${signal ?? 'none'})`)
  process.exit(1)
})
