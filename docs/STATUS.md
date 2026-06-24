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
