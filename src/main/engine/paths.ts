import { app } from 'electron'
import path from 'node:path'

// Dev: <project>/resources/engine/win/stockfish.exe (relative to out/main).
// Packaged: <resources>/engine/win/stockfish.exe (extraResources, outside asar).
export function stockfishPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'engine', 'win', 'stockfish.exe')
    : path.join(__dirname, '../../resources/engine/win/stockfish.exe')
}
