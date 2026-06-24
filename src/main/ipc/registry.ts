import { registerApp } from './app.ipc'
import { registerSettings } from './settings.ipc'
import { registerEngine } from './engine.ipc'
import { registerPuzzles } from './puzzles.ipc'
import { registerRatings } from './ratings.ipc'
import { registerGames } from './games.ipc'

// Composes every IPC domain. Called once from main after `whenReady`.
export function registerIpc(): void {
  registerApp()
  registerSettings()
  registerEngine()
  registerPuzzles()
  registerRatings()
  registerGames()
}
