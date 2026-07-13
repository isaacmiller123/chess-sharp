#!/usr/bin/env node
// Web client ROUTING suite (web port W3 — build contract AGENT-CLIENT).
//
//   node scripts/test-web-client.mjs
//
// Asserts the webApi backend routing that scripts/test-web-stub.mjs (shape +
// logged-out behavior) cannot see: global fetch is MOCKED — nothing here ever
// talks to a real server — and the suite drives authStore through the same
// transitions the account UI performs:
//   1. logged out → puzzle CONTENT posts to the public bridge
//      (POST /api/ipc/puzzles:next, credentials same-origin) and degrades to
//      the honest empty shape when the bridge is unreachable
//   2. logged out → games.save stays 100% local (zero fetch calls)
//   3. logged out → puzzles.attempt moves the LOCAL Glicko-2 rating with
//      exactly the desktop math (glicko2Update, opp rd 50, tau 0.3, seed
//      1200/350/0.06), chained deterministically across attempts
//   4. simulated login → user-data calls (games:save, settings:get,
//      ratings:get) post to the auth bridge
//   5. a 401 flips authStore to logged out and subsequent calls land back on
//      the local layer (no fetch)
//   6. the logged-out ReviewStore is an LRU capped at 40 and mirrors review
//      accuracy onto the local game archive row
// Exit 1 on any failure.

import { execSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dir = mkdtempSync(path.join(tmpdir(), 'webclient-'))

// ONE bundle for webApi + authStore + reviewStore so they share module state
// (authStore is the routing singleton). The glicko oracle is a separate pure
// bundle — no shared state, used only to compute expected rating values.
const entry = path.join(dir, 'entry.ts')
writeFileSync(
  entry,
  [
    `export { webApi } from '${repoRoot}/src/web/webApi'`,
    `export { authStore } from '${repoRoot}/src/web/authStore'`,
    `export { localReviewStore, LOCAL_REVIEWS_CAP } from '${repoRoot}/src/web/reviewStore'`,
    `export { enrichDebriefMoves } from '${repoRoot}/src/web/engines/debrief'`,
    `export { importLocalProgress, localProgressSummary } from '${repoRoot}/src/web/migrate'`,
    ''
  ].join('\n')
)
const glickoEntry = path.join(dir, 'glicko.ts')
writeFileSync(glickoEntry, `export { glicko2Update } from '${repoRoot}/src/main/rating/glicko2'\n`)

function bundle(entryFile, name) {
  const out = path.join(dir, name)
  execSync(
    `npx esbuild ${entryFile} --bundle --format=esm --outfile=${out} ` +
      `--platform=node --jsx=automatic --external:*?url --loader:.css=empty ` +
      `--alias:@shared=${repoRoot}/src/shared --alias:@=${repoRoot}/src/renderer/src ` +
      `--define:__WEB_APP_VERSION__='"0.0.0-test"'`,
    { stdio: 'pipe', cwd: repoRoot }
  )
  return out
}

const webOut = bundle(entry, 'web.mjs')
const glickoOut = bundle(glickoEntry, 'glicko.mjs')

// Browser-ish globals BEFORE the bundle loads. localStorage is absent in bare
// node → the localData memory fallback carries all local state.
globalThis.window = globalThis

// ---- fetch mock -----------------------------------------------------------------

const calls = []
/** Set per test step: (call) => ({ status, body }) | null. null ⇒ network error. */
let responder = null

globalThis.fetch = async (url, init = {}) => {
  const call = {
    url: String(url),
    method: init.method ?? 'GET',
    credentials: init.credentials,
    body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined
  }
  calls.push(call)
  const r = responder ? responder(call) : null
  if (!r) throw new TypeError('fetch failed (unmocked)')
  return {
    ok: r.status >= 200 && r.status < 300,
    status: r.status,
    json: async () => r.body
  }
}

const {
  webApi,
  authStore,
  localReviewStore,
  LOCAL_REVIEWS_CAP,
  enrichDebriefMoves,
  importLocalProgress,
  localProgressSummary
} = await import(
  pathToFileURL(webOut).href
)
const { glicko2Update } = await import(pathToFileURL(glickoOut).href)

let failures = 0
function check(name, cond) {
  if (cond) {
    console.log(`  ok  ${name}`)
  } else {
    failures++
    console.error(`FAIL  ${name}`)
  }
}
const last = () => calls[calls.length - 1]

// ---- 0. boot ----------------------------------------------------------------------

check('authStore starts unknown + logged out', !authStore.state.known && !authStore.isAuthed())
await authStore.boot() // responder null → /api/auth/me fails → logged out
check('boot hits GET /api/auth/me', last().url === '/api/auth/me' && last().method === 'GET')
check('failed boot resolves to logged out', authStore.state.known && !authStore.isAuthed())

// ---- 1. logged out: puzzle content → PUBLIC bridge -------------------------------

responder = (c) =>
  c.url === '/api/ipc/puzzles:next' ? { status: 200, body: { puzzle: { id: 'p_1' } } } : null
const next = await webApi.puzzles.next({ theme: 'fork', ratingLo: 800 })
check('puzzles.next posts to /api/ipc/puzzles:next', last().url === '/api/ipc/puzzles:next')
check('puzzles.next is a POST', last().method === 'POST')
check('puzzles.next sends same-origin credentials', last().credentials === 'same-origin')
check(
  'puzzles.next body is the payload object',
  last().body.theme === 'fork' && last().body.ratingLo === 800
)
check('puzzles.next passes the bridge result through', next.puzzle?.id === 'p_1')

responder = null // bridge unreachable
check('unreachable bridge → honest null puzzle', (await webApi.puzzles.next({})).puzzle === null)
check('unreachable bridge → honest empty themes', (await webApi.puzzles.themes()).themes.length === 0)

// ---- 2. logged out: games stay local ----------------------------------------------

let fetchCount = calls.length
const saved1 = await webApi.games.save({ pgn: '1. e4 e5', source: 'play', result: '1-0' })
check('logged-out games.save makes NO fetch call', calls.length === fetchCount)
check('logged-out games.save returns local id 1', saved1.gameId === 1)
const listed = await webApi.games.list()
check('logged-out games.list serves the local archive', listed.games[0]?.pgn === '1. e4 e5')
check('logged-out games.list made no fetch call', calls.length === fetchCount)

// sign-in-gated actions reject with sign-in copy (and no fetch)
let rushErr = null
await webApi.puzzles.saveRush({ mode: 'rush3', score: 5, best: 5 }).catch((e) => (rushErr = e))
check('logged-out saveRush rejects with sign-in copy', /sign in/i.test(String(rushErr)))
check('logged-out saveRush made no fetch call', calls.length === fetchCount)

// ---- 3. logged out: deterministic local glicko ------------------------------------

const SEED = { rating: 1200, rd: 350, vol: 0.06 }
const exp1 = glicko2Update(SEED, [{ rating: 1400, rd: 50, score: 1 }], 0.3)
const a1 = await webApi.puzzles.attempt({ puzzleId: 'p1', puzzleRating: 1400, solved: true })
check('attempt #1 ratingAfter matches desktop math', a1.ratingAfter === Math.round(exp1.rating))
check('attempt #1 rd matches', a1.rd === Math.round(exp1.rd))
check('attempt #1 delta matches', a1.delta === Math.round(exp1.rating - SEED.rating))
check('attempt #1 made no fetch call', calls.length === fetchCount)

const exp2 = glicko2Update(exp1, [{ rating: 1400, rd: 50, score: 0 }], 0.3)
const a2 = await webApi.puzzles.attempt({ puzzleId: 'p2', puzzleRating: 1400, solved: false })
check('attempt #2 chains from stored full precision', a2.ratingAfter === Math.round(exp2.rating))
check('attempt #2 delta matches', a2.delta === Math.round(exp2.rating - exp1.rating))

const r1 = await webApi.ratings.get('puzzle')
check('ratings.get serves the local rating (rounded)', r1.rating === Math.round(exp2.rating))

const rush = await webApi.puzzles.attempt({
  puzzleId: 'p3',
  puzzleRating: 900,
  solved: true,
  mode: 'rush'
})
check('rush attempt echoes rating, rd 0, delta 0', rush.ratingAfter === 900 && rush.rd === 0 && rush.delta === 0)
check(
  'rush attempt leaves the ladder untouched',
  (await webApi.ratings.get('puzzle')).rating === Math.round(exp2.rating)
)

// ---- 4. simulated login → user data hits the AUTH bridge ---------------------------

let notified = 0
const unsub = authStore.subscribe(() => notified++)
responder = (c) =>
  c.url === '/api/auth/login'
    ? { status: 200, body: { user: { id: 7, username: 'kasparova' } } }
    : null
const user = await authStore.login('kasparova', 'password123')
check('login posts to /api/auth/login', last().url === '/api/auth/login')
check('login flips the store', authStore.isAuthed() && user.username === 'kasparova')
check('login notifies subscribers', notified === 1)
unsub()

responder = (c) => (c.url === '/api/ipc/games:save' ? { status: 200, body: { gameId: 777 } } : null)
const saved2 = await webApi.games.save({ pgn: '1. d4' })
check('logged-in games.save posts to /api/ipc/games:save', last().url === '/api/ipc/games:save')
check('logged-in games.save sends the input payload', last().body.pgn === '1. d4')
check('logged-in games.save sends same-origin credentials', last().credentials === 'same-origin')
check('logged-in games.save returns the bridge gameId', saved2.gameId === 777)

responder = (c) =>
  c.url === '/api/ipc/settings:get' ? { status: 200, body: { value: { name: 'walnut' } } } : null
const setting = await webApi.settings.get('boardTheme')
check(
  'logged-in settings.get posts {key} to the bridge',
  last().url === '/api/ipc/settings:get' && last().body.key === 'boardTheme'
)
check('logged-in settings.get returns the bridge value', setting.value?.name === 'walnut')

responder = (c) =>
  c.url === '/api/ipc/ratings:get'
    ? { status: 200, body: { rating: 1512, rd: 61, vol: 0.058 } }
    : null
check(
  'logged-in ratings.get serves the bridge, not local',
  (await webApi.ratings.get('puzzle')).rating === 1512
)

// ---- 5. 401 → logged out + local ---------------------------------------------------

responder = () => ({ status: 401, body: { error: 'auth-required' } })
let err401 = null
await webApi.games.list().catch((e) => (err401 = e))
check('bridge 401 rejects the call', err401 !== null)
check('bridge 401 flips authStore to logged out', !authStore.isAuthed())

fetchCount = calls.length
const saved3 = await webApi.games.save({ pgn: '1. c4' })
check('post-401 games.save is local again (no fetch)', calls.length === fetchCount)
check('post-401 local archive kept its sequence', saved3.gameId === 2)
check(
  'post-401 ratings.get is local again',
  (await webApi.ratings.get('puzzle')).rating === Math.round(exp2.rating)
)

// ---- 6. logged-out ReviewStore: LRU cap + accuracy mirror ---------------------------

const side = (acc) => ({
  accuracy: acc,
  acpl: 20,
  moves: 10,
  inaccuracies: 1,
  mistakes: 0,
  blunders: 0,
  best: 5
})
const band = { est: 1500, low: 1400, high: 1600, accuracy: 90, kind: 'estimate' }
const mkReview = (id) => ({
  gameId: id,
  depth: 16,
  totalPlies: 20,
  white: side(90),
  black: side(85),
  whiteElo: band,
  blackElo: band,
  moveEvals: [{ ply: 1 }]
})

check('pgn-only review save keeps reviewId null', (await localReviewStore.save(null, mkReview(null))).reviewId === null)
for (let i = 1; i <= LOCAL_REVIEWS_CAP + 5; i++) await localReviewStore.save(i, mkReview(i))
check('newest review survives the cap', (await localReviewStore.load(45)).review !== null)
check('oldest reviews are LRU-evicted', (await localReviewStore.load(1)).review === null)
check('eviction stops at the cap boundary', (await localReviewStore.load(6)).review !== null)
const loaded = await localReviewStore.load(44)
check('load returns the review moveEvals', loaded.moveEvals.length === 1 && loaded.moveEvals[0].ply === 1)
const gameRow = await webApi.games.get(2)
check(
  'review save mirrors accuracy onto the archived game row',
  gameRow.game?.accuracy_white === 90 && gameRow.game?.accuracy_black === 85
)

// ---- 7. logout resilience -----------------------------------------------------------

responder = (c) =>
  c.url === '/api/auth/login'
    ? { status: 200, body: { user: { id: 7, username: 'kasparova' } } }
    : null
await authStore.login('kasparova', 'password123')
responder = null // server unreachable during logout
await authStore.logout()
check('logout flips locally even when the request fails', !authStore.isAuthed())

// ---- 8. school debrief enrichment (audit W-01) --------------------------------------
// The server has no engine, so webApi must fill user-move evals CLIENT-side
// before the bridge call. enrichDebriefMoves takes an injectable analyze fn —
// the canned one below stands in for the WASM engine.

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const NO_EVAL = { cp: null, mate: null }
const dbMove = (over = {}) => ({
  ply: 1,
  fenBefore: START_FEN,
  played: 'e2e4',
  best: '',
  pv: [],
  evalBefore: NO_EVAL,
  evalAfter: NO_EVAL,
  byUser: true,
  ...over
})

let analyzeCalls = 0
const cannedAnalyze = async (fen, depth, multipv) => {
  analyzeCalls++
  return { lines: new Map([[1, { multipv: 1, depth, pv: ['d2d4', 'd7d5'], scoreCp: 42 }]]) }
}

let enriched = await enrichDebriefMoves(
  {
    chapterId: 'ch-01',
    userColor: 'white',
    moves: [dbMove(), dbMove({ ply: 2, byUser: false })]
  },
  cannedAnalyze
)
const um = enriched.moves[0]
check('enrich fills evalBefore from the engine (mover POV)', um.evalBefore.cp === 42)
check('enrich adopts the engine best + pv', um.best === 'd2d4' && um.pv.length === 2)
check(
  'enrich negates the after-eval (played != best pays a second search)',
  um.evalAfter.cp === -42
)
check('enrich leaves opponent moves untouched', enriched.moves[1].evalBefore.cp === null)
check('two searches for one enriched user move', analyzeCalls === 2)

// Mate detection needs no second search: Ra8# from a back-rank position.
const mateFen = '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1'
enriched = await enrichDebriefMoves(
  {
    chapterId: 'ch-01',
    userColor: 'white',
    moves: [
      dbMove({ fenBefore: mateFen, played: 'a1a8', best: 'a1a8', pv: ['a1a8'], evalBefore: { cp: 500, mate: null } })
    ]
  },
  cannedAnalyze
)
check('a mating user move gets mate:1 with no extra search', enriched.moves[0].evalAfter.mate === 1)

// The engine budget mirrors viktor.ts MAX_POSITIONS (24 searches).
analyzeCalls = 0
await enrichDebriefMoves(
  {
    chapterId: 'ch-01',
    userColor: 'white',
    moves: Array.from({ length: 30 }, (_, i) => dbMove({ ply: i + 1 }))
  },
  cannedAnalyze
)
check('enrichment stops at the 24-search budget (viktor parity)', analyzeCalls === 24)

// A totally dead engine must reject (an honest error beats all-moves-"fine"
// coaching), while a single hiccup degrades per-move like desktop.
let deadRejected = false
await enrichDebriefMoves(
  { chapterId: 'ch-01', userColor: 'white', moves: [dbMove()] },
  async () => {
    analyzeCalls++
    throw new Error('engine crashed')
  }
).catch(() => {
  deadRejected = true
})
check('a dead engine rejects the debrief instead of faking evals', deadRejected)

// webApi.school.debrief in an engineless environment (bare node: no Worker)
// must reject with honest copy and NEVER post empty evals to the bridge.
fetchCount = calls.length
let debriefErr = null
await webApi.school
  .debrief({ chapterId: 'ch-01', userColor: 'white', moves: [dbMove()] })
  .catch((err) => {
    debriefErr = err
  })
check(
  'engineless school.debrief rejects with honest engine copy',
  debriefErr instanceof Error && /analysis engine/i.test(debriefErr.message)
)
check('engineless school.debrief never hits the bridge', calls.length === fetchCount)

// ---- 9. signup import (audit WEB-1) --------------------------------------------------
// importLocalProgress copies the localStorage layer into a fresh account:
// games oldest-first (+ their cached reviews under the NEW server ids),
// variants, settings — ratings intentionally stay local.

// The LRU test above evicted the low-id reviews — re-seed one for local game 2
// so the import provably carries a review across.
await localReviewStore.save(2, mkReview(2))

const summaryBefore = localProgressSummary()
check(
  'localProgressSummary sees the accumulated local state',
  summaryBefore.hasAny && summaryBefore.games >= 2
)

const bridgeWrites = []
let serverGameSeq = 100
responder = (c) => {
  if (c.url.startsWith('/api/ipc/') || c.url === '/api/review/save') {
    bridgeWrites.push(c)
    if (c.url === '/api/ipc/games:save') return { status: 200, body: { gameId: ++serverGameSeq } }
    if (c.url === '/api/review/save') return { status: 200, body: { ok: true } }
    return { status: 200, body: { ok: true } }
  }
  return null
}
const imported = await importLocalProgress()
check('import saves every local game', imported.games === summaryBefore.games)
const gameSaves = bridgeWrites.filter((c) => c.url === '/api/ipc/games:save')
check(
  'games import oldest-first (local seq order preserved)',
  gameSaves.length >= 2 && gameSaves[0].body.pgn === '1. e4 e5'
)
const reviewSaves = bridgeWrites.filter((c) => c.url === '/api/review/save')
check(
  'cached local reviews ride along under their NEW server ids',
  imported.reviews > 0 &&
    reviewSaves.every((c) => c.body.gameId > 100 && c.body.review.gameId === c.body.gameId)
)
check('import reports zero failures against a healthy server', imported.failures === 0)
responder = null

if (failures > 0) {
  console.error(`\n${failures} failure(s)`)
  process.exit(1)
}
console.log('\nWeb client routing: all green')
