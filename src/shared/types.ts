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

// ---- Puzzles / ratings / games / progress ----------------------------------

export interface Puzzle {
  id: string
  fen: string
  moves: string[]
  rating: number
  popularity?: number
  themes: string[]
  gameUrl?: string
  openingTags: string[]
}

export interface ThemeCount {
  key: string
  count: number
}

export interface PuzzleAttemptResult {
  ratingAfter: number
  rd: number
  delta: number
}

export interface RatingValue {
  rating: number
  rd: number
  vol: number
}

export interface ProgressSummary {
  puzzleRating: number
  puzzleRd: number
  vsBotRating: number
  vsBotRd: number
  puzzlesSolved: number
  puzzlesTried: number
  gamesPlayed: number
  lastPuzzleAt: number | null
  lastGameAt: number | null
}

export interface GameRow {
  id: number
  created_at: number
  white_name: string | null
  black_name: string | null
  user_color: string | null
  result: string | null
  opponent_kind: string | null
  opponent_label: string | null
  opponent_elo: number | null
  source: string | null
  pgn: string
  accuracy_white: number | null
  accuracy_black: number | null
  est_elo_low: number | null
  est_elo_high: number | null
  reviewed: number
}

export interface SaveGameInput {
  pgn: string
  whiteName?: string
  blackName?: string
  userColor?: 'white' | 'black'
  result?: string
  opponentKind?: string
  opponentLabel?: string
  opponentElo?: number
  source?: string
}

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
  puzzles: {
    next(req: {
      theme?: string
      ratingLo?: number
      ratingHi?: number
      exclude?: string[]
    }): Promise<{ puzzle: Puzzle | null }>
    get(puzzleId: string): Promise<{ puzzle: Puzzle | null }>
    themes(): Promise<{ themes: ThemeCount[] }>
    attempt(req: {
      puzzleId: string
      puzzleRating: number
      solved: boolean
      ms?: number
    }): Promise<PuzzleAttemptResult>
  }
  ratings: {
    get(kind: 'puzzle' | 'vs-bot'): Promise<RatingValue>
  }
  progress: {
    summary(): Promise<ProgressSummary>
  }
  games: {
    save(input: SaveGameInput): Promise<{ gameId: number }>
    list(req?: { limit?: number; offset?: number }): Promise<{ games: GameRow[] }>
    get(gameId: number): Promise<{ game: GameRow | null }>
    reportResult(req: { botElo: number; score: number }): Promise<{ ratingAfter: number; delta: number }>
  }
}

declare global {
  interface Window {
    api: Api
  }
}
