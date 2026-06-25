import { registerApp } from './app.ipc'
import { registerSettings } from './settings.ipc'
import { registerEngine } from './engine.ipc'
import { registerPuzzles } from './puzzles.ipc'
import { registerRatings } from './ratings.ipc'
import { registerGames } from './games.ipc'
import { registerOpenings } from './openings.ipc'
import { registerCoach } from './coach.ipc'
import { registerReview } from './review.ipc'
import { registerFamous } from './famous.ipc'
import { registerCurriculum } from './curriculum.ipc'
import { registerPersonas } from './personas.ipc'
import { registerDatasets } from './datasets.ipc'

// Composes every IPC domain. Called once from main after `whenReady`.
export function registerIpc(): void {
  registerApp()
  registerSettings()
  registerEngine()
  registerPuzzles()
  registerRatings()
  registerGames()
  registerOpenings()
  registerCoach()
  registerReview()
  registerFamous()
  registerCurriculum()
  registerPersonas()
  registerDatasets()
}
