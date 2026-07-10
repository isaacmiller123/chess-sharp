import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { registerIpc } from './ipc/registry'
import { initUpdates } from './updates/updateService'
import { installCsp, hardenWindow } from './security'
import { createWindow } from './window'
import { installAppMenu } from './menu'
import { installSmokeWasm } from './smokeWasm'
import { closeDbs } from './db/database'

// --smoke-wasm: headless packaged-app CSP/WASM self-test (main/smokeWasm.ts,
// driven by scripts/smoke-packed-wasm.mjs). Never set for normal launches.
const SMOKE_WASM = process.argv.includes('--smoke-wasm')

// ---- DEV CONTAINMENT (architecture §8) --------------------------------------
// In development, redirect Electron's userData + sessionData INTO the project so
// no app data ever lands in the per-user app-data folder (%APPDATA% on Windows,
// ~/Library/Application Support on macOS) or on the Desktop. Must run before
// `ready`. In production, userData keeps its OS-default location.
if (!app.isPackaged) {
  const devData = path.join(__dirname, '../../.devdata')
  app.setPath('userData', devData)
  app.setPath('sessionData', path.join(devData, 'session'))
}

// Smoke containment (after dev containment, so it wins in both modes): the
// smoke run must never touch — or corrupt — the real user profile/DBs.
if (SMOKE_WASM) {
  const smokeData = fs.mkdtempSync(path.join(os.tmpdir(), 'chess-sharp-smoke-'))
  app.setPath('userData', smokeData)
  app.setPath('sessionData', path.join(smokeData, 'session'))
}

app.whenReady().then(() => {
  installCsp(app.isPackaged)
  installAppMenu()
  registerIpc()
  // Quiet startup update check (packaged builds; skipped for --smoke-wasm so
  // the self-test never touches the network).
  if (!SMOKE_WASM) initUpdates()
  const win = createWindow({ smokeWasm: SMOKE_WASM })
  if (SMOKE_WASM) installSmokeWasm(win)
  hardenWindow(win)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      hardenWindow(createWindow())
    }
  })
})

app.on('will-quit', () => closeDbs())

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
