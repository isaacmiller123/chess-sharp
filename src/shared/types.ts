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

// ---- Openings / coach / review (Batch 2) ----

export interface OpeningInfo {
  eco: string
  name: string
}

export interface CoachEngineEval {
  cp?: number | null
  mate?: number | null
}
export interface CoachExplainMoveArgs {
  fenBefore: string
  played: string
  best: string
  pv: string[]
  evalBefore: CoachEngineEval
  evalAfter: CoachEngineEval
  ply?: number
}
export interface CoachExplainMoveResult {
  verdict: string
  motifs: string[]
  text: string
}
export interface CoachPositionalResult {
  terms: string[]
  text: string
}

export interface PovEval {
  cp: number | null
  mate: number | null
}
export type ReviewVerdict = 'blunder' | 'mistake' | 'inaccuracy' | 'ok'
export type MoveBadge =
  | 'Best'
  | 'Brilliant'
  | 'Great'
  | 'Excellent'
  | 'Good'
  | 'Book'
  | 'Forced'
  | 'Inaccuracy'
  | 'Mistake'
  | 'Blunder'
export interface EloBand {
  est: number
  low: number
  high: number
  accuracy: number
  kind: 'estimate'
}
export interface ReviewMoveEval {
  ply: number
  color: 'white' | 'black'
  san: string
  uci: string
  fenBefore: string
  fenAfter: string
  bestUci: string
  bestSan: string
  bestPv: string[]
  secondUci: string | null
  bestEval: PovEval
  playedEval: PovEval
  winBefore: number
  winAfter: number
  accuracy: number
  cpLoss: number
  winChancesDrop: number
  verdict: ReviewVerdict
  badge: MoveBadge
  isBest: boolean
  critical: boolean
}
export interface ReviewSideSummary {
  accuracy: number
  acpl: number
  moves: number
  inaccuracies: number
  mistakes: number
  blunders: number
  best: number
}
export interface GameReview {
  gameId: number | null
  depth: number
  totalPlies: number
  white: ReviewSideSummary
  black: ReviewSideSummary
  whiteElo: EloBand
  blackElo: EloBand
  moveEvals: ReviewMoveEval[]
}
export interface ReviewProgress {
  gameId: number | null
  ply: number
  total: number
}

// ---- Famous games / curriculum / personas (Batch 2 wide wave) ----

export type FamousGroup = 'romantic' | 'classical' | 'modern'
export type FamousResult = '1-0' | '0-1' | '1/2-1/2' | '*'
export interface FamousGameMeta {
  id: string
  white: string
  black: string
  event: string
  year: number
  result: FamousResult
  eco?: string
  group: FamousGroup
  plies: number
  significance?: string
}
export interface FamousMove {
  ply: number
  color: 'white' | 'black'
  san: string
  uci: string
  fenBefore: string
  fenAfter: string
}
export interface FamousGameDetail {
  game: FamousGameMeta
  moves: FamousMove[]
}

export type LessonKind = 'concept' | 'tactics' | 'endgame' | 'opening' | 'strategy'
export interface CurriculumLesson {
  id: string
  title: string
  summary: string
  objectives: string[]
  linkedThemes: string[]
  ratingRange: [number, number]
  kind: LessonKind
}
export interface CurriculumUnit {
  id: string
  order: number
  title: string
  goal: string
  lessons: CurriculumLesson[]
}
export interface CurriculumBand {
  id: string
  order: number
  label: string
  ratingFloor: number
  ratingRange: [number, number]
  goal: string
  units: CurriculumUnit[]
}

export interface PersonaStyle {
  aggression: number
  risk: number
  prefersAttack: boolean
  prefersSolid: boolean
}
export interface Persona {
  id: string
  name: string
  era: string
  peakElo: number
  style: PersonaStyle
  bio: string
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
  openings: {
    lookup(fen: string): Promise<{ opening: OpeningInfo | null }>
  }
  coach: {
    explainMove(args: CoachExplainMoveArgs): Promise<CoachExplainMoveResult>
    positional(args: { fen: string }): Promise<CoachPositionalResult>
  }
  review: {
    run(req: { gameId?: number; pgn?: string; depth?: number }): Promise<{
      reviewId: number | null
      review: GameReview
    }>
    get(gameId: number): Promise<{ review: GameReview | null; moveEvals: ReviewMoveEval[] }>
    onProgress(cb: (p: ReviewProgress) => void): Unsubscribe
  }
  perf: {
    estimate(req: { gameId?: number; accuracy?: number }): Promise<{
      est: number
      low: number
      high: number
      accuracy: number
    }>
  }
  famous: {
    list(req?: { group?: string }): Promise<{ games: FamousGameMeta[] }>
    get(id: string): Promise<{ game: FamousGameDetail | null }>
  }
  curriculum: {
    tree(): Promise<{ bands: CurriculumBand[] }>
    lesson(id: string): Promise<{ lesson: CurriculumLesson | null }>
  }
  personas: {
    list(): Promise<{ personas: Persona[] }>
    move(req: { fen: string; personaId: string; depth?: number; movetimeMs?: number }): Promise<{
      bestmove: string
      lineEval?: { cp?: number | null; mate?: number | null }
    }>
  }
}

declare global {
  interface Window {
    api: Api
  }
}
