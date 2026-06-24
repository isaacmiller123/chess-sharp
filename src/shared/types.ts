// Shared IPC contract — imported (type-only) by both preload and renderer.
// Single source of truth for the `window.api` surface. Grows as features land.

export interface PingResult {
  ok: boolean
  ts: number
}

export interface DataVersion {
  appVersion: string
  engineVersion: string
  puzzleDbDate: string
}

export interface SettingsGetResult {
  value: unknown
}

export interface OkResult {
  ok: boolean
}

// ---- Engine ----------------------------------------------------------------

export type GoLimit =
  | { kind: 'depth'; value: number }
  | { kind: 'movetime'; value: number }
  | { kind: 'nodes'; value: number }
  | { kind: 'infinite' }

export interface AnalyzeRequest {
  fen: string
  multipv?: number
  limit: GoLimit
}

export interface PlayLevel {
  uciElo?: number
  skill?: number
}

export interface PlayRequest {
  fen: string
  level: PlayLevel
  limit: GoLimit
}

export interface EngineLine {
  handleId: number
  depth?: number
  seldepth?: number
  multipv?: number
  scoreCp?: number
  mate?: number
  nodes?: number
  nps?: number
  timeMs?: number
  pv?: string[]
}

export interface EngineBestmove {
  handleId: number
  bestmove: string
  ponder?: string
}

export interface BestMove {
  bestmove: string
  ponder?: string
}

export interface EngineStatus {
  analysisReady: boolean
  playReady: boolean
  lc0Ready: boolean
}

export type Unsubscribe = () => void

export interface Api {
  app: {
    ping(): Promise<PingResult>
    dataVersion(): Promise<DataVersion>
  }
  settings: {
    get(key: string): Promise<SettingsGetResult>
    set(key: string, value: unknown): Promise<OkResult>
  }
  engine: {
    analyze(req: AnalyzeRequest): Promise<{ handleId: number }>
    stop(handleId: number): Promise<OkResult>
    play(req: PlayRequest): Promise<BestMove>
    status(): Promise<EngineStatus>
    newGame(instance: 'analysis' | 'play'): Promise<OkResult>
    onLine(cb: (line: EngineLine) => void): Unsubscribe
    onBestmove(cb: (bm: EngineBestmove) => void): Unsubscribe
  }
}

declare global {
  interface Window {
    api: Api
  }
}
