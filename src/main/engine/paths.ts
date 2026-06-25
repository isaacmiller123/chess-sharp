import { resolveEnginePath } from '../datasets/paths'

// The Stockfish binary to launch. Resolves an imported engine (written to
// userData by the dataset importer) before any binary bundled in the build, so a
// lean install that imports the engine at runtime works without a reinstall.
export function stockfishPath(): string {
  return resolveEnginePath()
}
