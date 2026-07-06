import { registerApp } from './app.ipc'
import { registerMaintenance } from './maintenance.ipc'
import { registerSettings } from './settings.ipc'
import { registerEngine } from './engine.ipc'
import { registerPuzzles } from './puzzles.ipc'
import { registerPuzzlesRush } from './puzzles.rush.ipc'
import { registerPuzzlesDaily } from './puzzles.daily.ipc'
import { registerRatings } from './ratings.ipc'
import { registerGames } from './games.ipc'
import { registerOpenings } from './openings.ipc'
import { registerCoach } from './coach.ipc'
import { registerReview } from './review.ipc'
import { registerFamous } from './famous.ipc'
import { registerSchool } from './school.ipc'
import { registerPersonas } from './personas.ipc'
import { registerDatasets } from './datasets.ipc'
import { registerCustomVariants } from './customVariants.ipc'

// Composes every IPC domain. Called once from main after `whenReady`.
export function registerIpc(): void {
  registerApp()
  registerMaintenance()
  registerSettings()
  registerEngine()
  registerPuzzles()
  registerPuzzlesRush()
  registerPuzzlesDaily()
  registerRatings()
  registerGames()
  registerOpenings()
  registerCoach()
  registerReview()
  registerFamous()
  registerSchool()
  registerPersonas()
  registerDatasets()
  registerCustomVariants()
}
