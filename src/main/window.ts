import { app, BrowserWindow } from 'electron'
import path from 'node:path'

// Locked security defaults (architecture §2.4). Changing any of these is a review bug.
export function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    title: 'Chess#',
    width: 1280,
    height: 832,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#161512',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  })

  win.once('ready-to-show', () => win.show())

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    // TODO(packaging): serve via a registered app:// protocol for strict-CSP correctness.
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  return win
}
