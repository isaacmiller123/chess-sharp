import { registerApp } from './app.ipc'
import { registerSettings } from './settings.ipc'
import { registerEngine } from './engine.ipc'

// Composes every IPC domain. Called once from main after `whenReady`.
export function registerIpc(): void {
  registerApp()
  registerSettings()
  registerEngine()
}
