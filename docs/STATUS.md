# Project Status

A living log of the agentic build loop. Newest entries at the bottom of each phase.

## Locked decisions (2026-06-24 kickoff survey)
- **Platform:** Electron desktop, chess.com/lichess-grade UI (React + TypeScript + Vite).
- **Coaching:** LOCAL only — Stockfish + heuristic explanation engine. No LLM, no internet, no cost at runtime.
- **Content:** offline-bundled (Lichess CC0 puzzle DB, openings TSV, theme taxonomy).
- **Assets:** open / redistributable only (Lichess piece sets & sounds + an open icon pack). No chess.com proprietary assets.
- **Product UI:** NO emojis. Sparing use allowed only in coaching/interaction text.
- **Containment:** everything stays inside the project dir; nothing may leak onto the Desktop.
- **Distribution:** set up for git.
- **Reach:** study / play / learn, foundation through ~2000 Elo.

## Agentic Loop 1 — Foundation
- **Research** (12 parallel agents): engine, lichess assets, puzzle DB, openings, analysis UI/UX, chess libs,
  move classification, coaching engine, curriculum, electron arch/security, icons/visual tokens, storage/SRS.
- **Synthesize** (3 agents): architecture & tech decisions · UI/UX spec · content & coaching spec.
- **Verify** (1 critic): licensing + feasibility + completeness; emits the hardened FOUNDATION feature list.
- Output specs will be saved to `docs/architecture.md`, `docs/ui-ux.md`, `docs/content-coaching.md`,
  `docs/research-findings.md`, and `docs/foundation-features.md`.

## Agentic Loop 1 — Supplemental research (expanded scope, 2026-06-24)
Follow-up requirements from the user, now under research (`w47yrab2o`):
- Play vs **engine at any level** AND vs **human-like / top-player styles + openings** (Maia/lc0 + per-player opening books).
- **Elo / performance-rating estimation** from the user's play.
- Full game review (accuracy, blunders, brilliants — already planned).
- **Famous games library** with idea explanations (redistributable annotated PGNs + local coaching engine).
- **Saved game history** + progress tracking; **puzzle score / local rating** (Glicko-2).

## Assets fetched
- `data/raw/lichess_db_puzzle.csv.zst` — 299,950,785 bytes (verified), Lichess CC0, dated 2026-06-03.

## Agentic Loop 1 — Research COMPLETE (2026-06-24)
- Main fleet (16 agents, 1.24M tokens) + supplemental fleet (5 agents, 302K tokens) done.
- Specs persisted to `docs/`: `architecture.md` (641 ln), `ui-ux.md` (910 ln), `content-coaching.md` (767 ln),
  `feature-addendum.md` (433 ln), `foundation-features.md` (adversarial critic + v0/NEXT lists), `research-findings.md` (160 KB).
- Critic blockers actioned: (1) `.gitignore` hardened + `.gitattributes` added (`.devdata/`, `*.pb.gz`, lc0 subdirs now ignored);
  (2) **Maia/lc0 demoted to NEXT** — v0 ships Stockfish-only play until weights license is cleared in writing;
  (3) DB schema → adopt the addendum superset; (4) opening explorer W/D/L cut from v0; (5) coach strings authored fresh (no AGPL XML);
  (6) theme-aware puzzle prune + no `ORDER BY RANDOM()`; (7) bundle actual GPL source tarballs, not just URLs.

## Key locked tech (from architecture.md)
- Electron 32 + electron-vite 2.3 + React 18 + TS 5.5; chessground 9.2 + chessops 0.15 (GPL app-wide, accepted).
- Stockfish 18 native `x86-64-universal` (NNUE embedded; no WASM/COOP-COEP). better-sqlite3 11 (main only).
- ts-fsrs (FSRS-6) for review; hand-rolled Glicko-2; zod IPC validation; electron-builder (NSIS + portable).
- Lucide icons (MIT) + Inter font (OFL). DEV containment: `app.setPath('userData', <project>/.devdata)` gated on `!isPackaged`.

## Foundation build progress (Loop 1)
- **DONE — App shell + security baseline + typed IPC** (items 1-2). `npm run typecheck` + `npm run build` green
  (Vite 7, React 19, Zod 4, TS 6, Electron 42). Dev userData->`.devdata` containment redirect in place.
- **DONE — Puzzle DB pipeline** (item 5 data). `scripts/build_puzzles_db.py` (stdlib zstd+sqlite3, theme-aware prune):
  4,699,980 puzzles, 21.4M junction rows, ratings 399-3327, 2.1 GB. Themed query 0.3 ms via covering index. (Size is a
  packaging-time knob — tunable via one constant.)
- **DONE — Native Stockfish 18 integration** (item 4). `scripts/fetch_engines.py` fetches + UCI-probes the binary
  (x86-64-avx2, embedded NNUE). `src/main/engine/` UciEngine (pure-Node UCI wrapper) + StockfishPool (analysis/play
  instances) + `engine:*` IPC (analyze/stop/play/status/newGame + line/bestmove push). **A4 smoke PASS**: 3 MultiPV
  lines (depth/score/pv) stream, stop halts < 1s. Engine binaries git-ignored, fetched by setup.
- Toolchain pinned: Vite 7 + electron-vite 5 + @vitejs/plugin-react 5 (vite-8 peer conflict resolved).

## Build scripts now (Python where it avoids native-build fragility)
- `setup:engines` -> `python scripts/fetch_engines.py` (Stockfish fetch + UCI probe)
- `build:puzzles` -> `python scripts/build_puzzles_db.py` (CSV.zst -> puzzles.sqlite)
- `smoke_engine.mjs` -> raw-UCI A4 smoke test

## DONE — Analysis board + app shell (2026-06-24)
- chessground + chessops analysis workbench: drag/click moves, legal dots, last-move/check highlight,
  promotion picker, eval bar (Win% sigmoid, flips), MultiPV engine panel (live IPC stream, click-to-play),
  variation move tree (figurine<->letter toggle), flip + first/prev/next/last + keyboard nav, FEN load/copy.
- App shell: left rail nav + bottom profile chip (avatar + username), contextual topbar, routing.
- Settings (real): profile (username + avatar upload), theme light/dark, 4 board color themes (CSS-gradient),
  legal-dots / coordinates / animation / sound toggles — localStorage-backed, applied app-wide.
- **Visually verified** via preview inspect: dark theme + Inter, 648px board w/ 33 cburnett pieces,
  eval bar height-matched, accent colors correct. typecheck + build green.

## Expanded scope from user (2026-06-24, "build everything"):
- GM-STYLE bots (Tal/Fischer/etc.): opening book (their games) + style-weighted MultiPV selection + peak-Elo cap.
- Polished HOME dashboard (progress + continue-where-you-left-off per activity + recent games + both ratings).
- Full SETTINGS parity with top sites (board styles, behaviors) — base done, expand.
- Profile (rail) + opponent/level in topbar during play.
- Famous games under Lessons.

## Loop 2 + Loop 3 — FEATURE-COMPLETE (2026-06-24)
All requested features built, integrated, verified (typecheck + build + `electron .` boot green throughout):
- Home dashboard · Play vs engine (any Elo) + **GM personas with real opening books** · Analysis
  (eval bar, MultiPV, move tree) + **game review** (accuracy/blunders/brilliants, eval graph, est-Elo band)
  + **live coach** · Puzzles (4.7M, Glicko-2 rating, hints, coach) · **Lessons** (54-lesson curriculum +
  interactive player) · **Famous games** (30 validated, viewer + analyze) · Openings explorer · Progress/My Games ·
  Settings (themes, 3 piece sets, sound, profile).
- Backends via node:sqlite (no native build). Engines bundled (Stockfish). Open assets only. No emojis.
- Built by many parallel agent fleets (research → implement → adversarial-verify → harden), lead-integrated.
- Commit trail: scaffold → engine → db → b1(play/puzzles/home) → b2 backend → wide wave → wave2 →
  persona books → live coaching → interactive lessons.

## Remaining
- Hardening pass (in progress: 6-dimension adversarial review) → fix findings.
- Packaging: installer + GitHub release (deferred per user). Decision needed: puzzle-DB size for the
  shippable installer (full 2.1 GB vs lean ~450 MB to fit GitHub's 2 GB asset limit).

## (historical) Next — remaining FOUNDATION (v0), ordered
1. Repo hygiene + DEV-containment redirect (done: hygiene; pending: code).  2. App shell + security baseline + typed IPC.
3. Reconcile schema + persistence.  4. Native Stockfish integration (fetch + UCI wrapper, 2 instances, Windows-safe kill).
5. Puzzle DB build pipeline (theme-aware prune).  6. Analysis board.  7. FEN/PGN load.  8. Openings name lookup.
9. Puzzles + Glicko-2.  10. Play vs Stockfish (any level).  11. Full game review.  12. Local coaching engine.
13. Accuracy→Elo band.  14. Famous games (engine-annotated).  15. Saved games + progress.  16. Settings + Credits.
17. Packaging.  18. Sound + motion + a11y.

## Web port — Phase W1 COMPLETE (2026-07-11)
Binding spec: `docs/WEB-PORT-SPEC.md`. The seam + skeleton phase landed, desktop untouched (all 28
`scripts/test-*.mjs` suites green, `electron-vite build` green, typecheck node+web+server green):
- **DB seam**: `src/main/db/database.ts` is electron-free — `configureDb({appDbDir, puzzles})`
  injection; desktop injects `app.getPath('userData')` + datasets resolvers from `src/main/index.ts`.
  Proven headless by `scripts/test-db-seam.mjs` (bundle has zero electron refs; migrations 0→10 at an
  injected path; lazy mid-session puzzle-DB pickup).
- **Web target**: `src/web/` (`index.html`, `main.web.tsx`, `webApi.ts`) + `vite.web.config.ts` →
  `dist-web/` SPA. `webApi` is the second typed `Api` impl. REAL on web day one: settings, Variant
  Lab, the **local game archive** (localStorage `game`-table mirror — finished OTB/online games land
  in Library/Home/Analysis lists), **opening-name lookup** (the desktop's EPD-keyed
  resources/openings/openings.json lazy-loads as its own 62 KB-gz chunk, same chessops keying), and
  dialog.saveFile = browser download. Datasets reported ABSENT (routes Play/Analysis/School into the
  renderer's own EngineRequiredNotice gates — no fake Stockfish; engine.newGame also rejects to
  close PlayView's probe-race), bot moves reject with the renderer's own BotUnavailableError so
  toasts show honest copy. Everything else resolves honest empties or rejects with coming-online
  copy. `scripts/test-web-stub.mjs`: runtime shape parity vs `src/preload/api.ts` (83 methods / 18
  namespaces) + behavior contract.
- **Server**: `server/index.ts` (Fastify) serves the SPA with COOP/COEP on every response
  (browser shows `crossOriginIsolated === true` — SharedArrayBuffer ready for W2 engines), immutable
  asset caching, SPA fallback, `/api/*` 503 coming-online, `/healthz`, `/games-art` statics.
  Bundled self-contained by `scripts/build-server.mjs` (fastify stays in devDependencies — desktop
  package unaffected). `scripts/test-web-server.mjs` headless smoke. Dockerfile + compose skeleton.
- **Scripts**: `dev:web`, `build:web`, `build:server`, `serve:web`, `start:web`, `typecheck:server`,
  `test:db-seam`, `test:web-stub`, `test:web-server`.
- **Boot proof (browser, production server)**: all menus render; Home/Progress zero-states; Puzzles
  "No puzzles available"; School "No chapters yet"; Analysis "Stockfish 18 · unavailable" + install
  card; Settings import → honest "No downloads on the web" alert; updates → "You're on the latest
  version"; Games library fully live (client-side rules/boards/manuals); **online multiplayer hosts
  from the browser** (trystero relays connect, join code issued).
- **Audit** (16-agent workflow, every renderer Api call site traced + adversarially verified):
  7 confirmed findings, all fixed in W1-owned files (engine.newGame reject; BotUnavailableError bot
  rejections; real openings.lookup; localStorage game archive; bare `/api` 503; asset-shaped 404s
  instead of SPA fallback; main.web.tsx boot .catch). Accepted W1 gaps, renderer-owned by design:
  Rush "Band cleared 0 solved" card when Start is pressed with no puzzle DB (W4 makes puzzles real),
  Analysis review's generic "Review failed. Please try again." copy (W2 makes review real).
- Known W5 items (renderer copy, untouched by design): welcome dialog "no internet" line, engine/
  dataset notices phrased as desktop downloads ("Download in Settings → Datasets" CTAs), Updates
  card subtitle, mpSession version-mismatch copy, background-tab throttling for web MP hosts
  (Electron sets backgroundThrottling:false; a backgrounded browser tab hosting a game may need a
  visibilitychange keepalive).

## Web port — W2–W6 COMPLETE: full port shipped (2026-07-12)
All six phases of docs/WEB-PORT-SPEC.md are built, integrated, and verified. Desktop 100% intact
(all 32 scripts/test-*.mjs suites green, electron-vite build green, typecheck node+web+server green).
Built by 5 parallel agents (engines / server / client / renderer-copy / docker) + lead integration;
every phase browser-verified against the production server + real 2.1 GB puzzle DB.
- **W2 engines (browser WASM)**: `src/web/engines/**` — Stockfish 18 lite (7 MB, multithreaded,
  NNUE embedded; single-thread fallback when not crossOriginIsolated) + Fairy-Stockfish 14 WASM
  (all variant kinds + Variant Lab custom inis via FS.writeFile/VariantPath). Exact desktop
  semantics: two logical instances, handleId streaming, calibrated sub-1320 weak model (pick-for-pick
  identical to the desktop under seeded RNG), evalVariant 300 ms bounded eval, persona moves
  client-side. Client-side game review imports the DESKTOP accuracy.ts/estElo.ts directly.
  Go bots + Maia = honest desktop-only rejections (decision record: lc0/KataGo WASM too heavy for
  v1). Verified live: bot game replies (French Defense vs 1500), Analysis streaming MultiPV depth
  48, engines gate lifted via datasets.status integration switch.
- **W3 accounts + persistence**: `server/{auth,users,bridge,review,electron-shim,bridge-entry}.ts` —
  argon2id (hash-wasm), httpOnly sid cookie (30-day rolling, Secure on https, TRUST_PROXY opt-in),
  users+sessions in DATA_DIR/server.sqlite, **per-user DB files** (DATA_DIR/users/<id>/app.sqlite via
  openAppDb + setDbOverride under a global FIFO mutex — deliberate deviation from the spec's user_id
  column for total repo reuse, documented). THE IPC BRIDGE: desktop ipc modules bundled UNMODIFIED
  with an electron shim → POST /api/ipc/<channel>, original zod schemas enforced; public content
  channels (puzzles/famous/school-content/personas/coach) work signed-out against an anon DB.
  Client: src/web/{http,authStore,localData,reviewStore}.ts + account chip (own React root).
  Signed-out = full local mode (localStorage archive + REAL local Glicko-2 ratings); signed-in =
  account DB. Verified live: signup → session survives hard refresh → game saved through the bridge
  returns from the account DB.
- **W4 puzzles + school + statics**: served through the same bridge off the real puzzle DB
  (PUZZLES_PATH) + resources trees (RESOURCES_ROOT shim). Verified live signed-out: real rated
  puzzles with theme counts, 40 School chapters, placement flow live on the WASM engine.
  (An earlier "(2.4M short)" note here was a miscount — the committed DB row-counts at the full
  4,699,980 puzzles, verified 2026-07-14.)
- **W5 parity edges**: src/renderer/src/platform.ts isWebBuild + honest web copy in Onboarding,
  EngineRequiredNotice/PuzzlesRequiredNotice, KernelBot KataGo card, DatasetsPanel, UpdatesPanel,
  DailyMode, mpSession version-mismatch. Desktop rendering byte-identical (flag false there).
- **W6 deploy**: final multi-stage Dockerfile (volume-first puzzle DB; bake-in via named build
  context + WITH_PUZZLES arg; /data volume; HEALTHCHECK; USER node), docker-compose.yml,
  .github/workflows/web.yml (test job + docker job, bridge-aware smoke), docs/WEB-DEPLOY.md
  (env table, reverse-proxy COOP/COEP + TRUST_PROXY notes, Fly/Hetzner sketches).
- **Scripts**: build:server now emits server + ipc-bridge; new suites test:web-engines (85),
  test:web-auth (31), test:web-bridge (46), test:web-client (47).
- Known v1 limits (documented): go/maia bots desktop-only; single-writer FIFO DB mutex
  (friends-scale); UCI_Elo on the lite net may drift slightly from desktop calibration anchors.

## Web port — hardening pass (audit fixes, 2026-07-14)
An adversarial audit of the (still-uncommitted) web port found ZERO criticals — cross-user
isolation, SQL injection, path traversal, the channel allowlist, argon2 params and session entropy
were all attacked and held — but 8 MAJOR hosting-hardening gaps. All fixed, desktop untouched
(the shared ipc-file caps sit far above real renderer usage; desktop build + full suite wall stay
byte-for-behavior identical). Fixes:
- **Unauthenticated DoS closed** (was the gate even for friends): the public bridge channels
  `school:debrief` / `school:narrate` / `coach:explainMove` / `puzzles:next` / `puzzles:batch` now
  `.max()`-cap every array + length-bound every string (mirroring the already-hardened review.ts),
  so an anon POST can't pin the single global DB mutex. Load-tested for real: a 287 KB / 1500-move
  payload (under the 1 MiB body limit) is rejected at the zod gate in ~45 ms BEFORE entering the
  mutex; a 20× flood keeps legit requests at ~12 ms.
- **Auth abuse bounds**: `@fastify/rate-limit` on `/api/auth/*` (login 10/min/IP, signup 5/hr/IP,
  `global:false` so nothing else is limited) + a 2-wide argon2 concurrency gate (each hash is
  ~19 MiB, so an unbounded burst was a memory-exhaustion vector) + a `MAX_ACCOUNTS` signup ceiling
  (each account is an on-disk DB).
- **Secure cookie by default**: the sid cookie is `Secure` on any https request AND whenever
  `NODE_ENV=production` (so a proxy that forgets `X-Forwarded-Proto` can't downgrade it);
  `COOKIE_SECURE=1/0` overrides. `TRUST_PROXY=1` documented as REQUIRED behind a proxy (env table +
  docker-compose + proxy section) — it also gives rate limiting real client IPs.
- **Bounded per-user DB handles**: the handle Map is now an LRU (`MAX_OPEN_USER_DBS`, default 32)
  that closes cold handles; the anon DB is pinned. Eviction only ever runs inside the FIFO mutex,
  so a closed handle can never be in use.
- **Session tokens hashed at rest**: the DB stores `sha256(token)`; the raw 256-bit token lives
  only in the cookie; lookups hash the presented value. A `user_version` 0→1 boot migration hashes
  any pre-existing raw rows in place without logging anyone out.
- **Honest web debrief** (W-01, was NOT in the old known-limits): the boss debrief arrives from the
  renderer with empty evals and delegated to the server's Viktor, which needs native Stockfish
  (absent on web) — the failure was swallowed and every move classified "fine". Now `src/web/engines/
  debrief.ts` runs viktor.ts's own enrichment CLIENT-side on the WASM analysis instance (same
  DEBRIEF_DEPTH=12, MAX_POSITIONS=24 budget, mover-POV/negate/mate conventions) before the bridge
  call; an engineless browser rejects with honest copy instead of posting empty evals. Verified live
  in a browser: the enriched move carries a real best move, 13-ply PV, and mover-POV eval.
- **Local→account import on signup**: `src/web/migrate.ts` copies signed-out localStorage progress
  (games + their cached reviews under new server ids, custom variants, settings — ratings stay
  local) into the fresh account on first signup; sign-IN shows a "stays on this browser" notice
  instead (merging into existing account data is undecidable). Best-effort, never blocks the reload.
- **Username enumeration softened**: login now runs a full argon2 verify against a decoy hash when
  the user row is absent, so response timing no longer distinguishes unknown-user from wrong-password.
  Signup 409s still reveal taken names — an accepted friends-scale trade-off, documented.
- **CSRF backstop**: on top of SameSite=Lax, an Origin-allowlist hook refuses cross-origin mutating
  `/api` calls (same-origin and no-Origin non-browser clients pass).
- Minors swept: STATUS/README/Docker/CI stale copy corrected; the committed puzzle DB row-counts at
  the full 4,699,980 (the earlier "2.4M short" note was a miscount); README self-host quickstart
  added; CI now exercises the WITH_PUZZLES bake-in path.
- New/extended tests: cap rejection + CSRF + 413 body-limit (test-web-bridge), Secure-cookie +
  rate-limit 429 + MAX_ACCOUNTS + token-hash-at-rest + v0→v1 migration (test-web-auth, now 3-phase),
  debrief enrichment + engineless-reject + signup import (test-web-client).

## Decentralized accounts — Phase A1 COMPLETE: identity & keys (2026-07-14)
Binding spec: docs/ACCOUNTS-SPEC.md v1.1; parameters: docs/ACCOUNTS-PARAMS.md (NEW — every §13
open parameter decided + rationale; 3 items flagged for sign-off: checkpoint M=4/N=8, per-category
reveal thresholds 120/100/80/40, reputation fold weights). Built by a 3-builder fleet against a
lead-written contract, then a 29-agent adversarial review (6 attack dimensions, findings
independently verified — 4 major + 13 minor confirmed, 6 refuted) and a fix pass. Desktop 100%
intact: full wall 36/36 scripts/test-*.mjs green, electron-vite build + build:web + build:server +
typecheck (node/web/server) green.
- **src/shared/accounts/** (platform-neutral, no node:/DOM; typechecks under BOTH node and web
  tsconfigs): cjson-v1 canonical codec (sorted keys, integers only, no null, NFC, lone-surrogate +
  `__proto__` rejection — byte-determinism is the product), sha256/ed25519 wiring (@noble, sync),
  argon2id identity derivation (m=64MiB t=3 p=1, salt=sha256(NFKC-casefolded username), password
  NFKD — both FROZEN-AT-GENESIS in PARAMS_V1, digest ZDoblqaVf5z1zL8IvmWK2sdZK29JTNWZpY38XuDBZdk),
  SLIP-0010 ed25519 hardened children (official test vectors), name#TAG (5-char base32), BIP39
  24-word mnemonic + keyfile export, two-lane chain (witnessed single-writer hash chain; personal
  per-signer CRDT with deterministic merge), root-signed key certificates + revocation, checkpoints
  (embed prior snapshot, incremental one-step verify, deep verify), self-authenticating fork
  proofs, keyring (tag-aware: same-name different-tag identities coexist per §1).
- **src/web/accounts.ts**: web keyring glue over localStorage + window.__chessAccounts dev surface
  (no UI — A6 owns UI). Chain-first persist with rollback; createAccount never overwrites an
  existing chain. Web bundle +35.4 KiB gzip. Desktop renderer untouched.
- **Interim accounts (server/auth.ts) untouched and still live** — A-final flips them off.
- **Tests (491 assertions)**: test-accounts-core (154: SLIP-0010 vectors, argon2 KAT, NFD-password
  = NFC-password, normalization attack matrix), test-accounts-chain (144: tamper matrix, forks,
  checkpoint fraud incl. all bad-checkpoint branches, revoke-then-recert, duplicate-event
  canonicalization, CRDT merge determinism), test-web-accounts (151: node-vs-browser-bundle byte
  parity, rollback, coexistence), test-web-accounts-browser (42: REAL headless Chromium via
  playwright-core — derivation + chain verify bit-identical to node, crossOriginIsolated). CI:
  web.yml provisions chromium-headless-shell (browser worst-case gate now exists per §14);
  build.yml runs the two node suites on node 22.
- Review catches worth noting: password Unicode normalization was MISSING (NFC vs NFD → permanent
  lockout under C-5) — now NFKD, frozen; `__proto__` canonical-vs-zod split-brain; chainToBytes
  duplicate-event non-canonicality; createAccount write-order brick. All fixed + regression-tested.
- A2 de-risk spike (throwaway, scratchpad): trystero 0.25.2 joins rooms under bare node with
  werift's RTCPeerConnection as rtcPolyfill — node↔browser connect ~4s over real Nostr relays,
  3-peer mesh verified, esbuild self-contained CJS bundle proven from an empty dir (satisfies the
  no-node_modules Docker constraint). node-datachannel works too but its native addon breaks
  isolated bundling — fallback only. Operator peer architecture: werift.
- Known A6 item: keyring.removeAccount + createAccount same creds = honest dead end (chain is
  preserved by design; record re-adoption flow lands with the account UI).

## Decentralized accounts — Phase A2 COMPLETE: witness fabric + PIN (2026-07-16)
Binding spec: docs/ACCOUNTS-SPEC.md v1.1 §1/§4/§8/§11; params docs/ACCOUNTS-PARAMS.md
(PARAMS_A2_DIGEST = oDyonXFK6JWN23sLdAqWJwaFiuxkm4eeZq7cxxdy2zc). Committed fecb758 + review-pass
42e716a. Converged clean over 5 Opus review rounds (defects 13→10→13→1→0) + a /code-review pass.
- **src/shared/accounts/witness/** (platform-neutral, deterministic): canonical witness set +
  eligibility, XOR-distance/closestEligible/prefixBucket (witness/distance.ts; nodeId =
  sha256(rootPub)), write lease with epochs, diversity-bound witnessed time, the tOPRF PIN
  committee (Shamir + OPRF), presence/attestation/slash, FabricEndpoint abstraction with MockFabric
  (suites) + TrysteroFabric (server/operator/peer.ts, trystero 0.25.2 + werift).
- **Proof (in test):** lease grant/takeover PIN-gated; a forced same-epoch fork is slashed; a
  different-epoch double-grant is appealed. Judge WASM sha256 =
  a8fbc05ec6920b56d7485826dcb02c5ffd2826bcbf751cf973046f237a9096f1 (stockfish-18-lite-single).
- Suites: test-accounts-{witness,pin,lease,fabric}.mjs + operator-smoke.mjs + test-judge-node.mjs.
  Desktop 100% intact.
- **4 residual seams deferred to A3's authority layer** (documented in docs/A3-KICKOFF.md): committee
  failure-counter anti-spreading; full canonical-set lease verification at attest; authoritative
  pin-record-chain anchoring for handoff; authenticated device-ownership at lease grant.

## Decentralized accounts — Phase A3 COMPLETE: overlay + storage + wire v6 (2026-07-19)
Binding spec: docs/ACCOUNTS-SPEC.md v1.1 §5 (three retention layers, Kademlia overlay,
authenticated pointers, reconstruction viewer) + §8 (wire v6); params docs/ACCOUNTS-PARAMS.md §Storage
(N_shards=40, K_rec=12); plan docs/A3-KICKOFF.md. PARAMS_A3_DIGEST =
ACxJEbqGQj7VOdWBvaLMiYuhfDHluYo0bZ0gbu_1yNE. Bricks 1/2/6 committed 17b39f4; bricks 3/4/5 built by a
pure-Fable fleet then driven through 5 adversarial Fable review+verify+fix rounds (per the accounts
model policy), each finding independently verified before fixing.
- **src/shared/accounts/storage/** — RS codec (rs.ts: GF(2^8), Cauchy MDS matrix, any 12-of-40
  reconstruct, sha256 integrity); shard duty + repair (shards.ts: distance-assigned shard keys,
  publish-on-write, finalSync, background runRepair — eviction=churn=healed; owner-committed
  per-shard body auth via SnapshotHeader.commitSig + bodyHashes); authenticated pointers (pointers.ts:
  segment/chain/shard proof kinds, proof-ranked per-key cap that survives sybil floods, index built
  at write time so viewing never searches); reconstruction viewer (viewer.ts: resolve → verified
  contact sheet → freshest-holder profile + newest M-of-N checkpoint + head, incremental verify +
  spot-check, lazy history pager).
- **overlay/** — Kademlia over FabricEndpoint (k-buckets, iterative FIND_NODE/VALUE/STORE, bootstrap;
  operator peer = fallback relay). **wire v6** — PROTOCOL_VERSION 6, `witness` role, per-move
  signature chaining + countersigned clock stream; existing test-mp GREEN behind the v5 gate.
- **THE §5 PROOF (test-accounts-reconstruct.mjs):** 1,000 witnessed games + 50 five-cosigner
  checkpoints, 300 opponent nodes on a real overlay at production 40/12 geometry, owner's node gone
  forever → a fresh viewer reconstructs profile + newest checkpoint + head + FULL history BIT-FAITHFUL
  to the original chain bytes; degraded <K_rec → honest temporary unavailability → runRepair
  re-encodes/redistributes → heals. Failure mode is temporary unavailability that heals, never loss.
- **Authority model, both viewing paths:** the EXPECTED path (verified chain reconstructs) is
  absolute on NO-FORGE + NO-SUPPRESS — head/segment/checkpoint/name/profile source ONLY from the
  verified chain (or verifyChain-gated); a non-linking pool event by ANY key (incl. a certified,
  non-revoked leaked device key) can neither inject content nor outrank the verified head. The FLOOR
  path (no chain to vet linkage) fails toward NO-FORGE and honestly surfaces the one irreducible
  residual via `revocationContested` — accepted compromise **C-12** (spec §12).
- Suites (all green): test-accounts-shards (246), -pointers (105), -reconstruct (217), plus -rs (102)
  and -overlay (78); registered in package.json + .github/workflows/build.yml. Desktop 100% intact:
  electron-vite build + typecheck (node/web/server) exit 0.
- **A2→A3 residual seams:** substrate now exists (replicated chains/certs, chain-authoritative
  storage) but the witness-side hooks are NOT wired — deferred to A4's first brick. The new-module
  browser byte-parity is exercised inside the suites; wiring RS/overlay parity into the playwright CI
  gate is a small follow-up.
