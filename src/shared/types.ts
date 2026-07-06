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

/** Stockfish's native UCI_Elo / Skill-Level floor: it cannot be weakened below
 *  this via its own settings. Single source of truth for both processes — at
 *  lower targets the main process switches to MultiPV-softmax weak play. */
export const ENGINE_ELO_FLOOR = 1320

export interface PlayLevel {
  /** Legacy: native Stockfish UCI_Elo (engine-enforced floor of 1320). Prefer `elo`. */
  uciElo?: number
  /** Legacy: Stockfish Skill Level 0..20. Prefer `elo`. */
  skill?: number
  /** Target Elo at ANY strength. The main process resolves how to reach it:
   *  native UCI_Elo when >= ENGINE_ELO_FLOOR, engine-driven weakening below
   *  that. Takes precedence over uciElo/skill when set (back-compat). */
  elo?: number
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

// ---- Puzzles trainer: modes, rush/storm, daily, stats (Batch 3) -------------
// Shared contract for the three trainer slices built against this scaffold:
//   (A) Themed/Custom training  (B) Puzzle Rush/Storm  (C) Daily + stats/history.
// Single source of truth for `window.api.puzzles` — preload mirrors it 1:1.

/** How an attempt was made. Drives `puzzle_attempt.mode` + per-mode history.
 *  'train'/'daily' move the Glicko rating; 'rush'/'custom' do NOT (Rush keeps a
 *  separate high-score record; custom drilling shouldn't tank the ladder). */
export type PuzzleMode = 'train' | 'custom' | 'rush' | 'daily'

/** A batch of puzzles fetched in one IPC round-trip. Used by Custom training
 *  (a fixed-length focused set) and by Rush/Storm (which must stream many
 *  puzzles fast without a per-puzzle, rating-blocked round-trip). */
export interface PuzzleBatchRequest {
  /** OR-set of Lichess theme keys; empty/omitted = any theme. */
  themes?: string[]
  ratingLo?: number
  ratingHi?: number
  /** How many puzzles to return (server clamps to a sane max). */
  count: number
  /** Puzzle ids to skip (recently seen). */
  exclude?: string[]
  /** Ascending rating order (Rush ramps difficulty); default random order. */
  ascending?: boolean
  /** Solution-length filter (Custom training). Bucketed by the LEARNER's own
   *  moves (a puzzle's `moves[0]` is the opponent lead-in, then plies alternate
   *  learner/opponent): 'short' = 1–2 learner moves, 'medium' = 3–4, 'long' = 5+.
   *  Omitted / 'any' = no length filter. */
  length?: 'short' | 'medium' | 'long' | 'any'
  /** Minimum Lichess popularity (the puzzles DB `Popularity` column, roughly
   *  -100..100 — an up/down-vote balance). Omitted = no popularity floor. */
  minPopularity?: number
  /** When true, skip puzzles the user has already solved (any puzzle_attempt row
   *  with solved=1). Custom drilling only — lets learners grind fresh material. */
  excludeSolved?: boolean
}

/** The Rush/Storm variants. rush3/rush5 = N lives; storm = fixed clock with
 *  bonus time; survival = one life, ever-shortening clock. */
export type RushMode = 'rush3' | 'rush5' | 'storm' | 'survival'

/** Why a Rush/Storm run ended (stored + shown on the results card). */
export type RushEndReason = 'time' | 'lives' | 'quit' | 'cleared'

/** One finished Rush/Storm run to persist (slice B). */
export interface RushRunInput {
  mode: RushMode
  score: number
  solved: number
  missed: number
  bestStreak: number
  /** Hardest puzzle solved (its rating), if tracked. */
  topRating?: number
  durationMs: number
  endedReason: RushEndReason
}

/** A persisted Rush/Storm run row (slice B). */
export interface RushRunRow {
  id: number
  mode: RushMode
  score: number
  solved: number
  missed: number
  bestStreak: number
  topRating: number | null
  durationMs: number
  endedReason: RushEndReason | null
  createdAt: number
}

/** Personal-best + run-count summary for one Rush mode (slice B). */
export interface RushBest {
  mode: RushMode
  best: number
  runs: number
  lastScore: number | null
}

/** The deterministic daily puzzle (slice C). Same puzzle for everyone on a given
 *  UTC day; `ymd` is the YYYY-MM-DD key, `result` is this user's outcome (null
 *  until they attempt it). */
export interface DailyPuzzle {
  ymd: string
  puzzle: Puzzle | null
  result: DailyResult | null
}

/** This user's outcome on a given day's daily puzzle (slice C). */
export interface DailyResult {
  ymd: string
  puzzleId: string
  solved: boolean
  firstTry: boolean
  ms: number | null
}

/** Daily-puzzle streak summary (slice C): consecutive solved days up to today. */
export interface DailyStreak {
  current: number
  best: number
  /** Whether today's daily has been solved (drives the "come back tomorrow" UI). */
  todaySolved: boolean
  /** Last N day outcomes, most-recent first, for a calendar strip. */
  recent: { ymd: string; solved: boolean }[]
}

/** Per-theme accuracy, for the stats view (slice C). */
export interface ThemeStat {
  theme: string
  attempts: number
  solved: number
  /** solved / attempts, 0..1. */
  accuracy: number
  /** Mean solve time over solved attempts, ms (null if none). */
  avgMs: number | null
}

/** Aggregate trainer stats (slice C). */
export interface PuzzleStats {
  totalAttempts: number
  totalSolved: number
  accuracy: number
  bestStreak: number
  byTheme: ThemeStat[]
  /** Solved/attempted bucketed by day for a sparkline, most-recent last. */
  daily: { ymd: string; attempts: number; solved: number }[]
}

/** One row of solve history (slice C). */
export interface PuzzleHistoryRow {
  id: number
  puzzleId: string
  solved: boolean
  ms: number | null
  ratingBefore: number | null
  ratingAfter: number | null
  theme: string | null
  mode: PuzzleMode
  createdAt: number
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
  | 'Miss'
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
  /**
   * Factual review comment, computed in main at review time (REVIEW-SPEC.md
   * comment templates). Derived ONLY from review data (SANs, PV, eval numbers)
   * — never motif heuristics. Optional: absent on rows cached before this field.
   */
  comment?: string
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

// ---- Chess School (Viktor) — chapters, concepts, coached steps --------------
// A board-centric, taught curriculum. Each chapter teaches named concepts via
// coached steps (with on-board annotations), guided practice, and ends in a
// "boss": beat a rating-capped engine using what you learned. Viktor (the coach)
// narrates; concept mastery is tracked so he references what you know.

/** Visual cue painted on the board to accompany a coach line. */
export type AnnotationColor = 'good' | 'bad' | 'info' | 'focus'
export interface BoardAnnotation {
  kind: 'highlight' | 'circle' | 'arrow'
  /** highlight/circle target (e.g. 'e4'). */
  square?: string
  /** arrow tail/head. */
  from?: string
  to?: string
  color?: AnnotationColor
  label?: string
}

/** One thing Viktor says, plus the board cues shown while he says it. */
export interface CoachLine {
  text: string
  annotations?: BoardAnnotation[]
  /** Concept this line teaches/uses, if any (id from the chapter's concepts). */
  conceptId?: string
  /** The board position this line refers to. When set, the renderer shows THIS
   *  position while the line plays (so debrief/teaching annotations land on the
   *  right board instead of blank squares on the final position). */
  fen?: string
}

export interface ChapterConcept {
  id: string
  name: string
  /** One-line summary Viktor gives the first time you meet the idea. */
  short: string
}

export type SchoolSegmentKind = 'teach' | 'guided' | 'boss'

/** A single coached position. For 'guided', play one of solutionUci to advance. */
export interface SchoolStep {
  fen: string
  coach: CoachLine
  /** guided: accepted winning move(s) in UCI (e.g. 'e5f7'). */
  solutionUci?: string[]
  /** guided: shown after the learner finds it. */
  successLine?: CoachLine
  /** guided: shown after a wrong try (before retry). */
  retryLine?: CoachLine
  conceptId?: string
}

export interface SchoolSegment {
  kind: SchoolSegmentKind
  title: string
  /** teach/guided steps (empty for boss). */
  steps: SchoolStep[]
  // boss-only fields:
  bossFen?: string
  bossEngineElo?: number
  bossUserColor?: 'white' | 'black'
  bossIntro?: CoachLine
}

// ---- Full chapter model: chapter -> lessons -> segments (+ chapter test) -----
// Additive over the legacy single-`segments` model (Knight Forks demo). New
// chapters set `lessons` + `test`; the player renders lessons when present.

/** One hand-authored puzzle board: an opening lead-in move (the opponent's, played
 *  automatically) followed by the move(s) the learner must find — same convention as
 *  a Lichess puzzle's `moves` (moves[0] is the lead-in, moves[1..] the solution). */
export interface AuthoredBoard {
  /** stable id (for de-dup + attempt logging). */
  id: string
  fen: string
  /** UCI moves: [0] = opponent lead-in (auto-played), [1..] = the learner's solution. */
  moves: string[]
  rating?: number
}

/** A set of puzzles for a warm-up / cool-down. Normally pulled from the bundled DB by
 *  theme + rating window; when `boards` is present those hand-authored positions are
 *  used instead (the DB floor is mate-dominated, so the foundation chapters author their
 *  own clean single-capture boards — see docs/school-curriculum.md ch1 fallback). */
export interface PuzzleQuery {
  /** Lichess theme keys (OR-set). */
  themes: string[]
  ratingLo: number
  ratingHi: number
  count: number
  /** Optional hand-authored boards; when set, served instead of a DB query. */
  boards?: AuthoredBoard[]
}

export type LessonSegmentKind = 'teach' | 'guided' | 'puzzle' | 'model' | 'boss'

/** One segment of a lesson. teach/guided reuse SchoolStep; puzzle pulls from the
 *  DB; model plays through a commented line; boss = beat the engine. */
export interface LessonSegment {
  kind: LessonSegmentKind
  title: string
  intro?: CoachLine
  /** teach/guided */
  steps?: SchoolStep[]
  /** puzzle (warm-up / cool-down) */
  puzzle?: PuzzleQuery
  /** model: a line to walk through with optional per-move coaching */
  line?: { uci: string; coach?: CoachLine }[]
  /** boss */
  bossFen?: string
  bossEngineElo?: number
  bossUserColor?: 'white' | 'black'
  bossIntro?: CoachLine
}

export type SchoolLessonKind =
  | 'warmup'
  | 'concept'
  | 'opening'
  | 'variation'
  | 'tactics'
  | 'positional'
  | 'endgame'
  | 'practice'
  | 'cooldown'

export interface SchoolLesson {
  id: string
  title: string
  kind: SchoolLessonKind
  summary?: string
  segments: LessonSegment[]
}

/** Chapter test questions. */
export interface TestMCQuestion {
  kind: 'mc'
  prompt: string
  fen?: string
  options: string[]
  answerIndex: number
  explain?: string
}
export interface TestPlayQuestion {
  kind: 'play'
  prompt: string
  fen: string
  /** Single-ply solution: the move(s) the learner must play (UCI). Back-compat —
   *  when `line` is absent this is the whole answer (accept any one of these). */
  solutionUci: string[]
  /** Multi-ply "play the opening out": an ordered script of plies the learner must
   *  play from `fen`. Each step: `userUci` are the accepted moves for the learner's
   *  ply (any one), `replyUci` the opponent's auto-played reply before the next
   *  step. When present, `line` drives the question and `solutionUci` is ignored.
   *  (For a 1-ply question authors may keep using `solutionUci` alone.) */
  line?: { userUci: string[]; replyUci?: string }[]
  explain?: string
}
export interface TestJudgeQuestion {
  kind: 'judge'
  prompt: string
  /** position to show; `lastMoveUci` is highlighted as the move to judge. */
  fen: string
  lastMoveUci: string
  verdict: 'correct' | 'blunder'
  explain?: string
}
export type TestQuestion = TestMCQuestion | TestPlayQuestion | TestJudgeQuestion
export interface ChapterTest {
  questions: TestQuestion[] // 10–15
  passThreshold: number // e.g. 0.7
}

export interface SchoolChapter {
  id: string
  band: string
  order: number
  title: string
  subtitle: string
  concepts: ChapterConcept[]
  /** Legacy single-flow segments (Knight Forks demo). Optional now. */
  segments?: SchoolSegment[]
  /** New model: ordered lessons. */
  lessons?: SchoolLesson[]
  /** The chapter test. */
  test?: ChapterTest
  estMinutes: number
  /** Internal Elo floor (band low end) — gates unlock; NEVER shown to the user. */
  eloFloor?: number
}

/** Lightweight chapter card for the school index. */
export interface SchoolChapterMeta {
  id: string
  band: string
  order: number
  title: string
  subtitle: string
  estMinutes: number
  conceptCount: number
  /** Number of lessons (new model), or 0 for legacy. */
  lessonCount?: number
  /** True when the chapter is locked behind placement or a higher internal Elo
   *  floor. The Elo itself is NEVER sent to the renderer — only this boolean and
   *  the name-based reason. */
  locked?: boolean
  /** Why it's locked, as a name-based hint (never an Elo number). */
  lockReason?: 'placement' | 'elo'
}

export interface ConceptMastery {
  conceptId: string
  /** 0..1 rolling mastery estimate. */
  mastery: number
  seen: number
  correct: number
}
export interface ChapterProgressRow {
  chapterId: string
  segmentsDone: number
  completed: boolean
  bossWon: boolean
}
export interface SchoolMastery {
  concepts: ConceptMastery[]
  chapters: ChapterProgressRow[]
  /** Per-lesson completion read back from lesson_progress (so done-state survives
   *  across sessions). Flat list; the renderer filters by chapterId. */
  lessons: { chapterId: string; lessonId: string }[]
}

// ---- Chapter test authority + retake (Feature 1) ----------------------------

/** Max chapter-test attempts before a fail forces a full-chapter retake. The
 *  SERVER is authoritative on attempts (see school:recordTest) — this const is the
 *  shared source of truth the renderer reads for its copy ("attempts left"). */
export const MAX_ATTEMPTS = 2

/** Server verdict for one recorded chapter-test attempt. `passed`/`attempts` are
 *  recomputed server-side from the chapter's passThreshold (the client no longer
 *  asserts pass/fail); `mustRetake` is true when this was the 2nd failing attempt
 *  and the chapter was reset; `bestPct` is the best score ever (survives a reset). */
export interface TestRecordResult {
  passed: boolean
  attempts: number
  mustRetake: boolean
  bestPct: number
}

// ---- Weakness-driven recommendation (Feature 2) -----------------------------

/** The next chapter Viktor recommends, derived from per-concept mastery. The
 *  `reason` is a name-based, human sentence (NEVER an internal Elo) explaining why
 *  this chapter is next. `weakConcepts` are the concept names that pulled it up. */
export interface RecommendedChapter {
  chapterId: string
  title: string
  subtitle: string
  reason: string
  /** Concept names (display strings) most responsible for the recommendation. */
  weakConcepts: string[]
}

// ---- Spaced repetition of concepts (Feature 3) ------------------------------

/** A concept owed a review now (due <= now), with the chapter it lives in so the
 *  Today surface can deep-link the learner back to where it was taught. */
export interface DueConcept {
  conceptId: string
  conceptName: string
  /** One-line refresher (the concept's `short`). */
  short: string
  chapterId: string
  chapterTitle: string
  /** Epoch-ms the review became due. */
  due: number
}

/** Result of grading one concept review: the updated card + the new due date. */
export interface ConceptReview {
  conceptId: string
  due: number
  reps: number
  lapses: number
  state: number
  /** Concepts still owed after this grade (drives the Today "N left" badge). */
  remainingDue: number
}

// ---- Daily lesson + local-day streak (Feature 4) ----------------------------

/** The day's recommended lesson + whether today already counts as studied. A
 *  "study action that counts for today" = completing a lesson OR doing an SRS
 *  review; `reviewsDue` folds the SRS queue into the one Today surface. */
export interface SchoolDaily {
  ymd: string
  /** The lesson picked for today (null when the curriculum is exhausted/locked). */
  chapterId: string | null
  chapterTitle: string | null
  lessonId: string | null
  lessonTitle: string | null
  /** Today's study already done (a lesson completed or a review done today). */
  doneToday: boolean
  /** Concepts owed a review right now (folded into the single Today surface). */
  reviewsDue: number
}

/** One placement game: the side's accuracy vs a known engine level and the Elo
 *  band that game implies. Stored to converge the estimate over 1+ games. */
export interface PlacementGameResult {
  /** The engine strength the placement game was played against (internal Elo). */
  engineElo: number
  /** The user side's accuracy% (0..100) from the review pass. */
  accuracy: number
  /** The user side's own moves analyzed (drives band width). */
  moveCount: number
  /** The Elo band this single game implies. */
  band: EloBand
}

/** The user's school placement: whether they've placed, their converged internal
 *  Elo estimate, and the games behind it. estimatedElo is INTERNAL-ONLY (gates
 *  unlock; never displayed). placed=false means every chapter is locked. */
export interface PlacementState {
  placed: boolean
  estimatedElo: number | null
  band: EloBand | null
  games: PlacementGameResult[]
}

/** Args for Viktor's live narration of a just-played move (proactive coaching). */
export interface SchoolNarrateReq {
  fenBefore: string
  played: string
  best: string
  pv: string[]
  evalBefore: CoachEngineEval
  evalAfter: CoachEngineEval
  /** Concept ids the learner has already been taught (for "uses what you know"). */
  knownConceptIds: string[]
  ply?: number
}

/** One move of a finished boss game, with its before/after evals, for the debrief. */
export interface SchoolDebriefMove {
  ply: number
  fenBefore: string
  played: string
  best: string
  pv: string[]
  evalBefore: CoachEngineEval
  evalAfter: CoachEngineEval
  byUser: boolean
}
export interface SchoolDebrief {
  lines: CoachLine[]
  usedConcepts: string[]
  verdict: string
}

export interface PersonaStyle {
  aggression: number
  risk: number
  prefersAttack: boolean
  prefersSolid: boolean
}
/** A selectable grandmaster-style persona (Play "GM style" gallery). The catalog
 *  is data-driven: resources/personas/personas.json (generated from research.json
 *  by scripts/build-persona-data.mjs), with photos merged from photos.json. New
 *  fields are nullable so a minimal/partial catalog still typechecks + renders. */
export interface Persona {
  id: string
  name: string
  era: string
  peakElo: number
  style: PersonaStyle
  bio: string
  /** Title as used in play ('GM', 'IM', ...). */
  title: string | null
  country: string | null
  /** Lifespan or 'b. YYYY'. */
  years: string | null
  /** Year of peakElo. */
  peakYear: number | null
  /** Honest estimated strength vs today's field (drives engine-cap UX copy). */
  modernElo: number | null
  /** One-paragraph justification of modernElo. */
  modernEloNote: string | null
  /** Longer play-style description for the persona card / detail pane. */
  styleDesc: string | null
  /** Base64 data-URI portrait (from resources/personas/photos.json), or null. */
  photo: string | null
  /** e.g. "Paul Morphy, via Wikimedia Commons", or null when no photo. */
  photoAttribution: string | null
  /** Ids into the famous-games library ("<personaId>-g1", ...) — see famous.get. */
  famousGameIds: string[]
  /** Clock personality — how the bot spends its time: fast 'blitzer', even 'steady', deep-think 'tanker'. */
  timeStyle?: 'blitzer' | 'steady' | 'tanker'
}

// ---- Datasets (runtime import of the large redistributable datasets) --------

export interface DatasetStatus {
  /** Stockfish engine binary present (imported or bundled). */
  engine: boolean
  /** Lichess puzzle DB present (imported or bundled). */
  puzzles: boolean
  /** Both present — every feature is fully available. */
  complete: boolean
}

export interface DatasetItemMeta {
  key: 'engine' | 'puzzles'
  label: string
  /** Download size in bytes (compressed, for the puzzle DB). */
  bytes: number
  /** On-disk size after install in bytes. */
  installedBytes: number
}

export interface DatasetProgress {
  key: 'engine' | 'puzzles' | 'all'
  phase: 'download' | 'verify' | 'done' | 'error' | 'cancelled'
  received: number
  total: number
  itemIndex: number
  itemCount: number
  message?: string
}

export interface DatasetImportResult {
  ok: boolean
  status: DatasetStatus
  error?: string
}

// ---- Internet multiplayer (mp) — protocol v3 ---------------------------------
// Two copies of Chess#, anywhere on the internet, play each other over WebRTC data
// channels established in the RENDERER (Chromium's native RTCPeerConnection).
// Signaling runs through public relays (trystero/Nostr) — no user-run server and no
// port forwarding. The join code is a random ROOM KEY (not an address): the host
// generates one, the guest enters it, and both land in the same room. All game
// flows through the renderer's MpNetSession; the UI consumes everything as MpEvent.
//
// v3 hardening (docs/MP-V3-SPEC.md): the host owns per-session monotonic gameIds
// and a monotonic clock; first-move grace + abort watchdogs replace the old
// clock-starts-at-handshake bug; flags are their own event (not resign); draw
// decline + symmetric rematch + reconnect grace (peer-away/back/left) are modeled
// here. The renderer's online store owns display/save/adjudication; the session
// owns wire authority. Ownership: shared contract (this file) = tech lead; wire
// protocol + session authority + rtc transport = builder-core; store = builder-store;
// renderer OnlineTab = builder-ui.

export interface MpTimeControl {
  /** Starting clock per side, ms. */
  initialMs: number
  /** Increment added after each of that side's moves, ms (0 = none). */
  incrementMs: number
}

export interface MpGameConfig {
  tc: MpTimeControl
  /** Which color the HOST plays; 'random' is resolved by the host at start. */
  hostColor: 'white' | 'black' | 'random'
}

export type MpColor = 'white' | 'black'

/** Per-side remaining time, ms. Host-authoritative; rides on move/clock/flag/
 *  resync events. Its own exported alias so stores can name the snapshot. */
export interface MpClocks {
  white: number
  black: number
}

/** Everything the renderer session emits to the UI (protocol v3). Discriminated
 *  on `type`. Perspective is ALWAYS the receiving player's: `yourColor` is this
 *  client's color, `resign.by`/`flag.by` is the color that resigned/flagged.
 *
 *  In-game events carry the host-owned `gameId` (monotonic per session, starts
 *  1, bumped on each rematch) so a store can drop stale traffic from a prior
 *  game; `move` also carries a 0-based `ply`. The session already drops
 *  wrong-gameId / wrong-ply wire messages, so these ids are informational for
 *  the store but authoritative on the wire. */
export type MpEvent =
  /** Connection lifecycle before the game starts: 'relays' = contacting signaling
   *  relays (with counts), 'searching' = waiting to discover the peer,
   *  'connecting' = peer found and the WebRTC/hello handshake is in flight. */
  | { type: 'net'; state: 'relays' | 'searching' | 'connecting'; relays?: { connected: number; total: number } }
  /** Host only: a guest connected (the 'start' event follows immediately). */
  | { type: 'peer-joined' }
  /** The game is on. Fired on BOTH sides once colors are resolved. `opponentName`
   *  is the peer's trimmed display name when they sent one. */
  | { type: 'start'; gameId: number; yourColor: MpColor; config: MpGameConfig; opponentName?: string }
  /** A move played by the REMOTE peer, plus the authoritative clocks after it.
   *  `ply` is the 0-based half-move index this move occupies. */
  | { type: 'move'; gameId: number; ply: number; uci: string; clockMs: MpClocks }
  /** Host→guest clock ack/resync (after committing a guest move, and periodically
   *  while a clock runs). `toMove` is whose clock is now ticking. */
  | { type: 'clock'; gameId: number; clockMs: MpClocks; toMove: MpColor }
  /** A side flagged (ran out of time). `clockMs` has the loser at 0; the store
   *  adjudicates the lichess insufficient-material rule to pick win/draw. */
  | { type: 'flag'; gameId: number; by: MpColor; clockMs: MpClocks }
  /** The game was aborted before it really began — no result is recorded or
   *  saved. 'no-first-move' = an abort watchdog fired; 'manual' = a player aborted. */
  | { type: 'abort'; gameId: number; reason: 'no-first-move' | 'manual' }
  /** A board-terminal ending (checkmate/stalemate/insufficient/…) confirmed on
   *  both sides. `reason` is a human string for the banner. */
  | { type: 'gameOver'; gameId: number; result: '1-0' | '0-1' | '1/2-1/2'; reason: string }
  /** The remote peer offers a draw. */
  | { type: 'drawOffer' }
  /** The remote peer declined our draw offer. */
  | { type: 'drawDecline' }
  /** The remote peer accepted our draw offer — game over, draw. */
  | { type: 'drawAccept' }
  /** A player resigned (either side; check `by` against your color). */
  | { type: 'resign'; by: MpColor }
  /** The remote peer offers a rematch. */
  | { type: 'rematchOffer' }
  /** The remote peer declined the rematch — both sides' offers are cleared. */
  | { type: 'rematchDecline' }
  /** Rematch accepted: a new game starts with (usually swapped) colors. */
  | { type: 'rematchStart'; gameId: number; yourColor: MpColor }
  /** The peer went silent mid-game; the clock is paused. `graceMs` is how long
   *  they have to reconnect before the game is claimable/abortable. */
  | { type: 'peer-away'; graceMs: number }
  /** The peer reconnected inside the grace window; play resumes. */
  | { type: 'peer-back' }
  /** The grace window expired (or the peer left outright). The UI offers Claim
   *  victory / Abort. */
  | { type: 'peer-left' }
  /** Anything went wrong (bad code, version mismatch, socket error, ...). */
  | { type: 'error'; message: string }

export interface Api {
  app: {
    ping(): Promise<PingResult>
    dataVersion(): Promise<DataVersion>
    /** Wipe locally stored progress for the given scopes (school = chapters/
     *  concepts/placement, puzzles = ratings/history/rush/daily, games = saved
     *  games/reviews/vs-bot rating). */
    resetProgress(req: { scopes: ('school' | 'puzzles' | 'games')[] }): Promise<{ ok: boolean }>
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
      /** Slice A/C: tag the attempt for per-theme stats + mode-scoped history.
       *  Omitting `mode` defaults to 'train' (rating-affecting), as before. */
      theme?: string
      mode?: PuzzleMode
    }): Promise<PuzzleAttemptResult>

    // ---- Slice A (custom) + Slice B (rush): bulk fetch ----
    /** Fetch many puzzles in one round-trip (focused sets / Rush streaming). */
    batch(req: PuzzleBatchRequest): Promise<{ puzzles: Puzzle[] }>

    // ---- Slice B: Puzzle Rush / Storm ----
    /** Persist a finished Rush/Storm run; returns the new personal best for the mode. */
    saveRush(req: RushRunInput): Promise<{ id: number; best: number; isBest: boolean }>
    /** Recent Rush/Storm runs (optionally filtered by mode). */
    rushRuns(req?: { mode?: RushMode; limit?: number }): Promise<{ runs: RushRunRow[] }>
    /** Personal-best summary per Rush mode. */
    rushBests(): Promise<{ bests: RushBest[] }>

    // ---- Slice C: Daily + stats/history ----
    /** The deterministic daily puzzle for a LOCAL calendar day (defaults to today,
     *  flipping at the user's local midnight) + this user's result on it. */
    daily(req?: { ymd?: string }): Promise<DailyPuzzle>
    /** Record the user's outcome on a daily puzzle; returns the updated streak. */
    recordDaily(req: {
      ymd: string
      puzzleId: string
      solved: boolean
      firstTry: boolean
      ms?: number
    }): Promise<{ streak: DailyStreak }>
    /** Daily-puzzle streak summary. */
    dailyStreak(): Promise<{ streak: DailyStreak }>
    /** Aggregate + per-theme trainer stats. */
    stats(): Promise<PuzzleStats>
    /** Paginated solve history. */
    history(req?: { limit?: number; offset?: number; mode?: PuzzleMode }): Promise<{
      rows: PuzzleHistoryRow[]
    }>
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
    cancel(): Promise<OkResult>
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
  school: {
    chapters(): Promise<{ chapters: SchoolChapterMeta[] }>
    chapter(id: string): Promise<{ chapter: SchoolChapter | null }>
    mastery(): Promise<SchoolMastery>
    recordConcept(req: { conceptId: string; correct: boolean }): Promise<{ mastery: number }>
    recordSegment(req: { chapterId: string; segmentsDone: number }): Promise<OkResult>
    completeChapter(req: { chapterId: string; bossWon: boolean }): Promise<OkResult>
    narrate(req: SchoolNarrateReq): Promise<{ line: CoachLine }>
    debrief(req: {
      chapterId: string
      userColor: 'white' | 'black'
      moves: SchoolDebriefMove[]
    }): Promise<SchoolDebrief>
    recordLesson(req: { chapterId: string; lessonId: string }): Promise<OkResult>
    /** Record a chapter-test attempt. The SERVER recomputes pass/fail from the
     *  chapter's threshold (no client `passed`), clamps attempts, and on a 2nd
     *  fail resets the chapter for retake — returning the authoritative verdict. */
    recordTest(req: {
      chapterId: string
      scorePct: number
      attemptNo: number
    }): Promise<TestRecordResult>
    testState(req: { chapterId: string }): Promise<{
      attempts: number
      passed: boolean
      bestPct: number
    }>
    /** Weakness-driven next-chapter recommendation (name-based reason; never an
     *  internal Elo). Returns null when nothing sensible to recommend. */
    recommend(): Promise<{ recommended: RecommendedChapter | null }>
    /** Concepts owed an SRS review now (due <= now), most-overdue first. */
    dueReviews(req?: { limit?: number }): Promise<{ due: DueConcept[] }>
    /** Grade one concept review (SM-2-lite); reschedules + returns the new state. */
    reviewConcept(req: { conceptId: string; correct: boolean }): Promise<ConceptReview>
    /** Today's daily lesson + streak/study state, with reviews-due folded in. */
    daily(): Promise<SchoolDaily>
    /** Mark today's lesson study done for a local day; returns the updated streak. */
    recordDaily(req: { ymd: string }): Promise<{ streak: DailyStreak }>
    /** Local-day study streak (current/best/recent + whether today is done). */
    streak(): Promise<{ streak: DailyStreak }>
    /** Current placement/unlock state (estimatedElo is internal — used only to
     *  drive the `locked` flags on chapter metas, never displayed). */
    placementState(): Promise<PlacementState>
    /** Record one finished placement game (accuracy vs a known engine level) and
     *  return the converged placement state. */
    recordPlacementGame(req: {
      engineElo: number
      accuracy: number
      moveCount: number
    }): Promise<PlacementState>
    /** Clear placement (re-locks everything; the user re-places). */
    resetPlacement(): Promise<PlacementState>
    /** The fixed engine level placement games are played against. */
    placementConfig(): Promise<{ engineElo: number }>
  }
  personas: {
    list(): Promise<{ personas: Persona[] }>
    move(req: { fen: string; personaId: string; depth?: number; movetimeMs?: number }): Promise<{
      bestmove: string
      lineEval?: { cp?: number | null; mate?: number | null }
    }>
  }
  datasets: {
    status(): Promise<DatasetStatus>
    items(): Promise<{ items: DatasetItemMeta[] }>
    import(): Promise<DatasetImportResult>
    cancel(): Promise<OkResult>
    onProgress(cb: (p: DatasetProgress) => void): Unsubscribe
  }
  // NOTE: multiplayer no longer crosses IPC — the renderer owns the WebRTC session
  // directly (import `mp` from features/play/online/mpClient). See MpEvent above.
}

declare global {
  interface Window {
    api: Api
  }
}
