// The WEB implementation of the shared `Api` contract (docs/WEB-PORT-SPEC.md).
//
// This is the second implementation of src/shared/types.ts `Api` — the desktop
// one lives in src/preload/api.ts (Electron IPC). The renderer is untouched:
// src/web/main.web.tsx installs this object as `window.api` before any
// renderer module evaluates.
//
// W3 (accounts + routing): every namespace now routes across three backends,
// chosen at CALL time from authStore (main.web.tsx resolves the session before
// the renderer boots; user-driven auth changes reload the page, so the state
// is effectively constant per page lifetime):
//
//   PUBLIC BRIDGE  (works signed out — POST /api/ipc/<channel> via http.ts):
//     puzzle content (next/get/themes/batch/daily), famous, school content
//     (chapters/chapter), personas.list, coach.*, school.narrate/debrief.
//     Content reads degrade to their honest EMPTY shapes when the bridge is
//     unreachable (dev without a server, network loss) — the same degradation
//     desktop shows without its datasets.
//
//   AUTH BRIDGE    (signed in — same endpoint, session cookie):
//     games, ratings, progress, puzzle attempts/rush/daily-records/stats/
//     history, school progress+placement, settings, customVariants,
//     app:resetProgress. A 401 flips authStore to signed-out (http.ts) and
//     subsequent calls land on the local layer below. Signed OUT, these keep
//     their honest local behavior: localStorage archive/settings/variants
//     (W1), plus REAL local Glicko-2 puzzle/vs-bot ratings (localData.ts —
//     the exact desktop math, seeds 1200/350/0.06). Actions that only make
//     sense against an account (rush saves, daily records, school progress)
//     reject with sign-in copy.
//
//   ENGINES        (client-side WASM — src/web/engines, the W2 contract):
//     engine.*, review.*, perf.*, personas.move, created lazily so this
//     module keeps working while the engine layer is still landing; until a
//     factory stops throwing, the W1 coming-online fallbacks answer (review.get
//     serves the ReviewStore directly even then).
//
//   LOCAL FOREVER  (real web-native behavior, unchanged from W1):
//     openings.lookup (bundled desktop table), dialog.saveFile (browser
//     download), updates (refresh IS the update), datasets (absent — the
//     import surface is retired on web by W5 renderer copy).

import { parseFen, makeFen } from 'chessops/fen'
import type {
  Api,
  CustomVariantRow,
  DailyStreak,
  DatasetStatus,
  OpeningInfo,
  UpdateStatus
} from '@shared/types'
import { measuredElo } from '@shared/botStrength'
import { authStore } from './authStore'
import { invoke } from './http'
import {
  SETTING_PREFIX,
  clearLocalGames,
  readGames,
  readLocalRating,
  readVariants,
  recordLocalGameResult,
  recordLocalPuzzleAttempt,
  resetLocalRating,
  storageGet,
  storageSet,
  writeGames,
  writeVariants,
  GAMES_CAP
} from './localData'
import { clearLocalReviews, reviewStore } from './reviewStore'
import {
  createDebriefEnricher,
  createEngineApi,
  createPerfApi,
  createPersonaMove,
  createReviewApi
} from './engines'

// ---- Routing helpers -----------------------------------------------------------

const authed = (): boolean => authStore.isAuthed()

/** Public-content bridge read: any failure (bridge unreachable, server error)
 *  degrades to the honest empty shape — exactly how the desktop renders
 *  without its datasets. Never fakes content. */
async function publicRead<T>(channel: string, payload: unknown, empty: () => T): Promise<T> {
  try {
    return await invoke<T>(channel, payload)
  } catch {
    return empty()
  }
}

/** Reject an account-only action with honest sign-in copy (the account chip
 *  lives bottom-right — see src/web/account). */
function signInRequired(what: string): Promise<never> {
  return Promise.reject(
    new Error(`${what} syncs to your Chess# account — sign in (bottom-right) to use it on the web.`)
  )
}

// ---- Honest degradation (W1, kept for the engine-layer fallbacks) ----------------

/** Reject with the standard coming-online copy. The renderer's existing error
 *  paths (toasts, status strips, best-effort try/catch) surface this string. */
function comingOnline(what: string): Promise<never> {
  return Promise.reject(
    new Error(`${what} is coming online — this part of the Chess# web app isn't wired up yet.`)
  )
}

/** Bot-move rejection the game UIs recognize: KernelBot/VariantBot show
 *  `err.message` in their toast only for `instanceof BotUnavailableError`
 *  (anything else falls back to desktop "is the dataset installed?" copy).
 *  Lazy import keeps module-eval order safe; by the time a bot moves, the
 *  games bundle is already loaded so this resolves from cache. */
async function botComingOnline(what: string): Promise<never> {
  const { BotUnavailableError } = await import('@/games/bots')
  throw new BotUnavailableError(
    `${what} are coming online — not available in the Chess# web app yet.`
  )
}

const ok = Promise.resolve({ ok: true as const })
const noopUnsubscribe = (): (() => void) => () => {}

// ---- The lazy engine layer (src/web/engines — the W2 contract) --------------------
// The factories are constructed on FIRST USE and cached; while the engine
// build is still landing they throw ("not built yet"), which parks the cache
// at null and keeps the W1 fallbacks answering. Nothing here re-probes: a
// successful construction is permanent for the page lifetime.

function lazy<T>(create: () => T): () => T | null {
  let cache: T | null | undefined
  return () => {
    if (cache === undefined) {
      try {
        cache = create()
      } catch {
        cache = null
      }
    }
    return cache
  }
}

/** Engine deps: resolve a saved custom variant's ini text. Accepts either the
 *  raw variant id or the 'custom-<id>' kind string the games platform uses. */
async function getCustomVariantIni(id: string): Promise<string | null> {
  const direct = await customVariantGet(id)
  if (direct?.iniText) return direct.iniText
  if (id.startsWith('custom-')) {
    const stripped = await customVariantGet(id.slice('custom-'.length))
    if (stripped?.iniText) return stripped.iniText
  }
  return null
}

async function customVariantGet(id: string): Promise<CustomVariantRow | null> {
  if (authed()) {
    const { variant } = await invoke<{ variant: CustomVariantRow | null }>('customVariants:get', {
      id
    })
    return variant
  }
  return readVariants()[id] ?? null
}

const engineLayer = lazy<Api['engine']>(() => createEngineApi({ getCustomVariantIni }))
const reviewLayer = lazy<Api['review']>(() => createReviewApi(reviewStore))
const perfLayer = lazy<Api['perf']>(() => createPerfApi(reviewStore))
const personaMoveLayer = lazy<Api['personas']['move']>(() => createPersonaMove())
const debriefEnrichLayer = lazy(() => createDebriefEnricher())

// ---- Empty/default read results ----------------------------------------------

const ZERO_STREAK: DailyStreak = { current: 0, best: 0, todaySolved: false, recent: [] }

/** UTC YYYY-MM-DD (the puzzle daily is a UTC-day key). */
function utcYmd(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Local YYYY-MM-DD (school streaks are LOCAL-day). */
function localYmd(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`
}

// datasets stays exactly W1 (build contract: "dialog/updates/datasets stay as
// W1"): the web app has no import step, and reporting ABSENT keeps every
// dataset-gated surface in its designed degradation until the LEAD flips the
// integration switch (engine → W2 wasm presence, puzzles → server probe).
const DATASETS_NONE: DatasetStatus = {
  engine: false,
  puzzles: false,
  maia: false,
  katago: false,
  katagoHuman: false,
  complete: false
}

const ENGINE_STATUS_NONE = {
  analysisReady: false,
  playReady: false,
  lc0Ready: false,
  fairyReady: false,
  katagoReady: false,
  katagoHumanReady: false
}

// ---- datasets.status probes (memoized once-true) --------------------------------
// useEngineReady re-calls datasets:status on every gated-surface mount, so both
// probes cache their first success; a false answer re-probes (a dataset can
// "appear" when the server comes up mid-session, mirroring desktop's lazy
// mid-session import pickup).

let engineDatasetMemo = false
async function probeEngineDataset(): Promise<boolean> {
  if (engineDatasetMemo) return true
  const eng = engineLayer()
  if (!eng) return false
  try {
    const s = await eng.status()
    engineDatasetMemo = s.analysisReady && s.playReady
  } catch {
    engineDatasetMemo = false
  }
  return engineDatasetMemo
}

let puzzlesDatasetMemo = false
async function probePuzzlesDataset(): Promise<boolean> {
  if (puzzlesDatasetMemo) return true
  try {
    const { themes } = await invoke<{ themes: { key: string; count: number }[] }>(
      'puzzles:themes',
      {}
    )
    puzzlesDatasetMemo = themes.length > 0
  } catch {
    puzzlesDatasetMemo = false
  }
  return puzzlesDatasetMemo
}

// Opening-name lookup — REAL on web, and byte-identical to desktop: the same
// EPD-keyed resources/openings/openings.json the main process reads (488 KB)
// lazy-loads as its own chunk on first lookup, and the same chessops EPD
// normalization keys the match (src/main/openings/openings.repo.ts).
let openingsTable: Promise<Record<string, OpeningInfo>> | null = null

function loadOpenings(): Promise<Record<string, OpeningInfo>> {
  if (!openingsTable) {
    openingsTable = import('../../resources/openings/openings.json')
      .then((m) => (m.default ?? m) as Record<string, OpeningInfo>)
      .catch(() => ({}))
  }
  return openingsTable
}

// The web app updates by refresh — there is nothing to check or download.
const UPDATE_STATUS: UpdateStatus = {
  state: 'idle',
  currentVersion: __WEB_APP_VERSION__,
  mode: 'manual'
}

export const webApi: Api = {
  app: {
    ping: async () => ({ ok: true, ts: Date.now() }),
    // engineVersion reflects the W2 WASM engines (static string — the About
    // panel copy, not a capability claim); puzzleDbDate comes from the public
    // bridge when the server is reachable.
    dataVersion: async () => {
      const local = {
        appVersion: `${__WEB_APP_VERSION__} (web)`,
        engineVersion: 'Stockfish 18 lite + Fairy-Stockfish 14 (WASM)',
        puzzleDbDate: 'coming online'
      }
      try {
        const remote = await invoke<{ puzzleDbDate: string }>('app:dataVersion', {})
        return { ...local, puzzleDbDate: remote.puzzleDbDate }
      } catch {
        return local
      }
    },
    // Signed in → the desktop wipe against the account DB. Signed out → wipe
    // the browser-resident equivalents per scope (school has no local data:
    // its progress is account-only on web, so that scope is an honest no-op).
    resetProgress: async (req) => {
      if (authed()) return invoke('app:resetProgress', req)
      for (const scope of new Set(req.scopes)) {
        if (scope === 'puzzles') resetLocalRating('puzzle')
        if (scope === 'games') {
          clearLocalGames()
          clearLocalReviews()
          resetLocalRating('vs-bot')
        }
      }
      return { ok: true }
    }
  },

  // Signed in → the account's setting table (server bridge). Signed out →
  // localStorage (W1). NOTE: local settings are not migrated up on first
  // sign-in (documented gap).
  settings: {
    get: async (key) => {
      if (authed()) return invoke('settings:get', { key })
      const raw = storageGet(SETTING_PREFIX + key)
      if (raw === null) return { value: null }
      try {
        return { value: JSON.parse(raw) as unknown }
      } catch {
        return { value: null }
      }
    },
    set: async (key, value) => {
      if (authed()) return invoke('settings:set', { key, value })
      storageSet(SETTING_PREFIX + key, JSON.stringify(value ?? null))
      return { ok: true }
    }
  },

  // W2 engines (client-side WASM) behind the lazy layer; W1 coming-online
  // fallbacks answer until the engine factories construct. The rejection
  // choices are load-bearing (see W1 audit): newGame REJECTING keeps
  // PlayView's belt-and-braces gate from starting a fake "Stockfish" game.
  engine: {
    analyze: (req) => engineLayer()?.analyze(req) ?? comingOnline('Engine analysis'),
    stop: (handleId) => engineLayer()?.stop(handleId) ?? ok,
    play: (req) => engineLayer()?.play(req) ?? comingOnline('Playing the engine'),
    playVariant: (req) => engineLayer()?.playVariant(req) ?? botComingOnline('Variant bots'),
    playGo: (req) => engineLayer()?.playGo(req) ?? botComingOnline('Go bots'),
    evalVariant: (req) => engineLayer()?.evalVariant(req) ?? comingOnline('The eval bar'),
    estimateGo: (req) => engineLayer()?.estimateGo(req) ?? comingOnline('Territory estimates'),
    status: () => engineLayer()?.status() ?? Promise.resolve({ ...ENGINE_STATUS_NONE }),
    newGame: (instance) => engineLayer()?.newGame(instance) ?? comingOnline('Playing the engine'),
    onLine: (cb) => engineLayer()?.onLine(cb) ?? noopUnsubscribe(),
    onBestmove: (cb) => engineLayer()?.onBestmove(cb) ?? noopUnsubscribe()
  },

  // CONTENT (the 2.1 GB DB stays server-side) → public bridge, signed in or
  // out. USER DATA (attempts/rush/daily records/stats/history) → auth bridge,
  // or the honest local layer signed out.
  puzzles: {
    next: (req) => publicRead('puzzles:next', req, () => ({ puzzle: null })),
    get: (puzzleId) => publicRead('puzzles:get', { puzzleId }, () => ({ puzzle: null })),
    themes: () => publicRead('puzzles:themes', {}, () => ({ themes: [] })),
    attempt: async (req) => {
      if (authed()) return invoke('puzzles:attempt', req)
      // Local Glicko-2 — the exact desktop applyPuzzleResult math + mode rules.
      return recordLocalPuzzleAttempt(req.puzzleRating, req.solved, req.mode ?? 'train')
    },
    batch: (req) => publicRead('puzzles:batch', req, () => ({ puzzles: [] })),
    saveRush: (req) => (authed() ? invoke('puzzles:saveRush', req) : signInRequired('Saving Rush runs')),
    rushRuns: (req) => (authed() ? invoke('puzzles:rushRuns', req ?? {}) : Promise.resolve({ runs: [] })),
    rushBests: () => (authed() ? invoke('puzzles:rushBests', {}) : Promise.resolve({ bests: [] })),
    // Public: the daily puzzle itself needs no account (signed out, `result`
    // is the server's anon answer — null until the user signs in and records).
    daily: (req) =>
      publicRead('puzzles:daily', req ?? {}, () => ({ ymd: req?.ymd ?? utcYmd(), puzzle: null, result: null })),
    recordDaily: (req) =>
      authed() ? invoke('puzzles:recordDaily', req) : signInRequired('Daily-puzzle results'),
    dailyStreak: () =>
      authed() ? invoke('puzzles:dailyStreak', {}) : Promise.resolve({ streak: ZERO_STREAK }),
    stats: async () => {
      if (authed()) return invoke('puzzles:stats', {})
      // Honest local numbers from the attempt counters; no per-theme/daily
      // history is kept client-side.
      const rec = readLocalRating('puzzle')
      return {
        totalAttempts: rec.attempts,
        totalSolved: rec.solved,
        accuracy: rec.attempts > 0 ? Math.round((rec.solved / rec.attempts) * 100) : 0,
        bestStreak: 0,
        byTheme: [],
        daily: []
      }
    },
    history: (req) => (authed() ? invoke('puzzles:history', req ?? {}) : Promise.resolve({ rows: [] }))
  },

  // Signed in → account DB. Signed out → the REAL local Glicko-2 store
  // (localData.ts), which reads as the desktop's unseeded default until the
  // first rated attempt.
  ratings: {
    get: async (kind) => {
      if (authed()) return invoke('ratings:get', { kind })
      const rec = readLocalRating(kind)
      return { rating: Math.round(rec.rating), rd: Math.round(rec.rd), vol: rec.vol }
    }
  },
  progress: {
    summary: async () => {
      if (authed()) return invoke('progress:summary', {})
      const puzzle = readLocalRating('puzzle')
      const vsBot = readLocalRating('vs-bot')
      const games = readGames().rows
      return {
        puzzleRating: Math.round(puzzle.rating),
        puzzleRd: Math.round(puzzle.rd),
        vsBotRating: Math.round(vsBot.rating),
        vsBotRd: Math.round(vsBot.rd),
        puzzlesSolved: puzzle.solved,
        puzzlesTried: puzzle.attempts,
        gamesPlayed: games.length,
        lastPuzzleAt: puzzle.lastAt,
        lastGameAt: games[0]?.created_at ?? null
      }
    }
  },

  // Signed in → the account's game table via the bridge. Signed out → the W1
  // localStorage archive (desktop game-table semantics: list = chess rows
  // only, listAll = every kind, both newest-first).
  games: {
    save: async (input) => {
      if (authed()) return invoke('games:save', input)
      const store = readGames()
      const id = ++store.seq
      store.rows.unshift({
        id,
        created_at: Date.now(),
        white_name: input.whiteName ?? null,
        black_name: input.blackName ?? null,
        user_color: input.userColor ?? null,
        result: input.result ?? null,
        opponent_kind: input.opponentKind ?? null,
        opponent_label: input.opponentLabel ?? null,
        opponent_elo: input.opponentElo ?? null,
        source: input.source ?? null,
        pgn: input.pgn,
        accuracy_white: null,
        accuracy_black: null,
        est_elo_low: null,
        est_elo_high: null,
        reviewed: 0,
        game_kind: input.gameKind ?? 'chess'
      })
      store.rows = store.rows.slice(0, GAMES_CAP)
      writeGames(store)
      return { gameId: id }
    },
    list: async (req) => {
      if (authed()) return invoke('games:list', req ?? {})
      return {
        games: readGames()
          .rows.filter((g) => g.game_kind === 'chess')
          .slice(req?.offset ?? 0, (req?.offset ?? 0) + (req?.limit ?? 50))
      }
    },
    listAll: async (req) => {
      if (authed()) return invoke('games:listAll', req ?? {})
      const rows = readGames().rows
      const filtered = rows.filter(
        (g) =>
          (!req?.kind || g.game_kind === req.kind) &&
          (!req?.source || g.source === req.source) &&
          (!req?.result || g.result === req.result)
      )
      const offset = req?.offset ?? 0
      const kindCounts = new Map<string, number>()
      const sources = new Set<string>()
      for (const g of rows) {
        kindCounts.set(g.game_kind, (kindCounts.get(g.game_kind) ?? 0) + 1)
        if (g.source) sources.add(g.source)
      }
      return {
        games: filtered.slice(offset, offset + (req?.limit ?? 60)),
        kinds: [...kindCounts.entries()]
          .map(([kind, count]) => ({ kind, count }))
          .sort((a, b) => b.count - a.count || a.kind.localeCompare(b.kind)),
        sources: [...sources].sort()
      }
    },
    get: async (gameId) => {
      if (authed()) return invoke('games:get', { gameId })
      return { game: readGames().rows.find((g) => g.id === gameId) ?? null }
    },
    // Signed out → the desktop pipeline run locally: nominal→measured Elo
    // mapping (shared/botStrength — main owns this on desktop) then the
    // vs-bot Glicko update.
    reportResult: async (req) => {
      if (authed()) return invoke('games:reportResult', req)
      const rated = measuredElo({ kind: req.opponentKind ?? 'engine', elo: req.botElo })
      return recordLocalGameResult(rated, req.score)
    }
  },

  // REAL — same table, same EPD keying as the desktop lookup. Stays local on
  // web (byte-identical data, zero round-trips).
  openings: {
    lookup: async (fen) => {
      const setup = parseFen(fen)
      if (setup.isErr) return { opening: null }
      const epd = makeFen(setup.value, { epd: true })
      return { opening: (await loadOpenings())[epd] ?? null }
    }
  },

  // Public bridge: coaching text is server-computed from the caller's payload
  // (no account state). Failures reject — the renderer's coach surfaces own
  // their error copy.
  coach: {
    explainMove: (args) => invoke('coach:explainMove', args),
    positional: (args) => invoke('coach:positional', args)
  },

  // W2 client-side review behind the lazy layer, persisting through
  // reviewStore (localStorage LRU signed out, /api/review/* signed in).
  // review.get answers from the store EVEN while the engine layer is still
  // landing — stored reviews are readable without an engine.
  review: {
    run: (req) => reviewLayer()?.run(req) ?? comingOnline('Game review'),
    get: (gameId) => reviewLayer()?.get(gameId) ?? reviewStore.load(gameId),
    cancel: () => reviewLayer()?.cancel() ?? ok,
    onProgress: (cb) => reviewLayer()?.onProgress(cb) ?? noopUnsubscribe()
  },
  perf: {
    estimate: (req) => perfLayer()?.estimate(req) ?? comingOnline('Performance estimates')
  },

  // Public bridge content.
  famous: {
    list: (req) => publicRead('famous:list', req ?? {}, () => ({ games: [] })),
    get: (id) => publicRead('famous:get', { id }, () => ({ game: null }))
  },

  // Curriculum CONTENT + Viktor's coaching → public bridge. PROGRESS
  // (mastery/records/tests/SRS/streak/placement) → auth bridge, with the W1
  // honest-empty reads and sign-in rejections signed out.
  school: {
    chapters: () => publicRead('school:chapters', {}, () => ({ chapters: [] })),
    chapter: (id) => publicRead('school:chapter', { id }, () => ({ chapter: null })),
    mastery: () =>
      authed()
        ? invoke('school:mastery', {})
        : Promise.resolve({ concepts: [], chapters: [], lessons: [] }),
    recordConcept: (req) =>
      authed() ? invoke('school:recordConcept', req) : signInRequired('School progress'),
    recordSegment: (req) =>
      authed() ? invoke('school:recordSegment', req) : signInRequired('School progress'),
    completeChapter: (req) =>
      authed() ? invoke('school:completeChapter', req) : signInRequired('School progress'),
    narrate: (req) => invoke('school:narrate', req),
    // The boss debrief arrives from the renderer with EMPTY evals (desktop
    // fills them with its native engine server-side). The web server has no
    // engine, so the WASM layer fills them HERE first — same depth/budget as
    // viktor.ts — and with no engine available we reject honestly instead of
    // letting the bridge classify every move "fine" (audit fix W-01).
    debrief: async (req) => {
      const enrich = debriefEnrichLayer()
      if (!enrich) {
        throw new Error(
          'Viktor’s debrief needs the analysis engine, which isn’t available in this browser.'
        )
      }
      return invoke('school:debrief', await enrich(req))
    },
    recordLesson: (req) =>
      authed() ? invoke('school:recordLesson', req) : signInRequired('School progress'),
    recordTest: (req) =>
      authed() ? invoke('school:recordTest', req) : signInRequired('Chapter tests'),
    testState: (req) =>
      authed()
        ? invoke('school:testState', req)
        : Promise.resolve({ attempts: 0, passed: false, bestPct: 0 }),
    recommend: () =>
      authed() ? invoke('school:recommend', {}) : Promise.resolve({ recommended: null }),
    dueReviews: (req) =>
      authed() ? invoke('school:dueReviews', req ?? {}) : Promise.resolve({ due: [] }),
    reviewConcept: (req) =>
      authed() ? invoke('school:reviewConcept', req) : signInRequired('Concept reviews'),
    daily: () =>
      authed()
        ? invoke('school:daily', {})
        : Promise.resolve({
            ymd: localYmd(),
            chapterId: null,
            chapterTitle: null,
            lessonId: null,
            lessonTitle: null,
            doneToday: false,
            reviewsDue: 0
          }),
    recordDaily: (req) =>
      authed() ? invoke('school:recordDaily', req) : signInRequired('School streaks'),
    streak: () =>
      authed() ? invoke('school:streak', {}) : Promise.resolve({ streak: ZERO_STREAK }),
    placementState: () =>
      authed()
        ? invoke('school:placementState', {})
        : Promise.resolve({ placed: false, estimatedElo: null, band: null, games: [] }),
    recordPlacementGame: (req) =>
      authed() ? invoke('school:recordPlacementGame', req) : signInRequired('Placement games'),
    resetPlacement: () =>
      authed()
        ? invoke('school:resetPlacement', {})
        : Promise.resolve({ placed: false, estimatedElo: null, band: null, games: [] }),
    // Desktop's fixed placement level (school/placement.ts) — same constant.
    placementConfig: () =>
      authed() ? invoke('school:placementConfig', {}) : Promise.resolve({ engineElo: 1350 })
  },

  // Catalog → public bridge; moves → the W2 engine layer (style-weighted
  // MultiPV selection runs client-side).
  personas: {
    list: () => publicRead('personas:list', {}, () => ({ personas: [] })),
    move: (req) => personaMoveLayer()?.(req) ?? comingOnline('Persona bots')
  },

  // INTEGRATION SWITCH (post-W2/W4): `engine` reflects the WASM layer's own
  // capability probe (useEngineReady gates Play/Analysis off this flag) and
  // `puzzles` a memoized public-bridge probe (the server answers
  // puzzles:themes from the real DB when PUZZLES_PATH resolves). In engineless
  // environments (bare node, old browsers) or with the bridge unreachable both
  // degrade to false and every W1 required-notice gate returns — honest in
  // both directions. maia/katago stay desktop-only (W2 decision record).
  // Import still declines honestly (surface retired on web by W5 copy).
  datasets: {
    status: async () => {
      const [engine, puzzles] = await Promise.all([probeEngineDataset(), probePuzzlesDataset()])
      return { ...DATASETS_NONE, engine, puzzles, complete: engine && puzzles }
    },
    items: async () => ({ items: [] }),
    import: async () => ({
      ok: false,
      status: { ...DATASETS_NONE },
      error:
        'No downloads on the web — engines and the puzzle library come online here in upcoming updates.'
    }),
    cancel: async () => ok,
    onProgress: () => noopUnsubscribe()
  },

  // Signed in → account DB via the bridge (variants follow the account across
  // machines). Signed out → localStorage (W1) — Variant Lab works fully
  // in-browser either way (ffish WASM validates the ini in the renderer).
  customVariants: {
    save: async (req) => {
      if (authed()) return invoke('customVariants:save', req)
      const map = readVariants()
      const now = Date.now()
      const prev = map[req.id]
      const variant: CustomVariantRow = {
        ...req,
        createdAt: prev?.createdAt ?? now,
        updatedAt: now
      }
      map[req.id] = variant
      writeVariants(map)
      return { variant }
    },
    list: async () => {
      if (authed()) return invoke('customVariants:list', {})
      return {
        variants: Object.values(readVariants()).sort((a, b) => b.updatedAt - a.updatedAt)
      }
    },
    get: async (id) => ({ variant: await customVariantGet(id) }),
    delete: async (id) => {
      if (authed()) return invoke('customVariants:delete', { id })
      const map = readVariants()
      delete map[id]
      writeVariants(map)
      return { ok: true }
    }
  },

  // Real web-native behavior: the browser download IS the save dialog.
  dialog: {
    saveFile: async (req) => {
      const blob = new Blob([req.data as BlobPart])
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = req.suggestedName
      a.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
      return { ok: true, path: req.suggestedName }
    }
  },

  // The web app updates by refresh — check honestly reports up-to-date,
  // download has nothing to do (W5 replaces the Settings surface).
  updates: {
    status: async () => ({ ...UPDATE_STATUS }),
    check: async () => ({ ...UPDATE_STATUS, state: 'up-to-date', checkedAt: Date.now() }),
    download: async () => ({
      ok: false,
      action: 'none',
      error: 'The web app is always current — refresh the page to pick up new releases.'
    }),
    onStatus: () => noopUnsubscribe()
  }
}
