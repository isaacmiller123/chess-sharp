import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { registerIpc } from './ipc/registry'
import { installCsp, hardenWindow } from './security'
import { createWindow } from './window'

// ---- DEV CONTAINMENT (architecture §8) --------------------------------------
// In development, redirect Electron's userData + sessionData INTO the project so
// no app data ever lands in %APPDATA% or on the Desktop. Must run before `ready`.
// In production, userData keeps its OS-default location.
if (!app.isPackaged) {
  const devData = path.join(__dirname, '../../.devdata')
  app.setPath('userData', devData)
  app.setPath('sessionData', path.join(devData, 'session'))
}

app.whenReady().then(() => {
  installCsp(app.isPackaged)
  registerIpc()
  const win = createWindow()
  hardenWindow(win)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      hardenWindow(createWindow())
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
