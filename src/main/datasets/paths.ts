import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'

// Dataset resolution. The large datasets (Stockfish engine binary, Lichess puzzle
// DB) are NOT shipped in the repo or the installer — they are imported at runtime
// into a writable per-user folder. Every consumer resolves "imported first, then
// bundled" so a freshly imported dataset is picked up without a reinstall.
//
//   imported:  <userData>/datasets/...   (written by the dataset importer)
//   bundled:   <resources>/...           (only present in a "full" build)
//
// In dev, userData is redirected to <project>/.devdata (see main/index.ts), so
// imports land there and never touch %APPDATA% or the Desktop.

export function datasetsDir(): string {
  return path.join(app.getPath('userData'), 'datasets')
}

export function importedEnginePath(): string {
  return path.join(datasetsDir(), 'engine', 'stockfish.exe')
}

export function importedPuzzlesPath(): string {
  return path.join(datasetsDir(), 'puzzles.sqlite')
}

function bundledEnginePath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'engine', 'win', 'stockfish.exe')
    : path.join(__dirname, '../../resources/engine/win/stockfish.exe')
}

function bundledPuzzlesPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'data', 'puzzles.sqlite')
    : path.join(__dirname, '../../resources/data/puzzles.sqlite')
}

/** The engine binary to launch: an imported one wins over any bundled one. */
export function resolveEnginePath(): string {
  const imported = importedEnginePath()
  return fs.existsSync(imported) ? imported : bundledEnginePath()
}

/** The puzzle DB to open: an imported one wins over any bundled one. */
export function resolvePuzzlesPath(): string {
  const imported = importedPuzzlesPath()
  return fs.existsSync(imported) ? imported : bundledPuzzlesPath()
}

export function engineInstalled(): boolean {
  return fs.existsSync(resolveEnginePath())
}

export function puzzlesInstalled(): boolean {
  return fs.existsSync(resolvePuzzlesPath())
}
