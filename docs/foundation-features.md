I've now read all four specs plus the STATUS and .gitignore. I have enough to produce a ruthless, grounded review. Let me cross-check a couple of specific consistency points before writing it up — the gitignore vs the architecture spec's claimed gitignore, the two DB schema dialects, and the engine version inconsistency.

A few concrete discrepancies I can already confirm from the files:
- The **actual `.gitignore`** (on disk) does NOT ignore `*.pb.gz` (Maia weights) or `resources/engine/weights/` or `resources/engine/**/*.exe` (lc0 in subdirs) — the architecture spec §10 quotes a *different, more complete* gitignore than what's committed. The on-disk file would let Maia weight files and `resources/engine/win/lc0.exe` slip into git.
- The architecture spec ignores `.devdata/` but the on-disk `.gitignore` does **not** contain `.devdata/` — it only has `.userdata/`, `.appdata/`, `.cache/`. So the DEV-containment target directory is currently NOT git-ignored.
- `better-sqlite3` is not ignored anywhere as a build artifact, fine, but the `app.sqlite`/`user.sqlite` writable DB naming differs between architecture (`app.sqlite`) and content spec (`user.sqlite`).

I have what I need. Writing the review now.

---

# ADVERSARIAL REVIEW — Offline Electron Chess App (3 specs + addendum/STATUS)

Reviewed: `docs/architecture.md`, `docs/ui-ux.md`, `CONTENT_AND_COACHING_SPEC.md`, plus `docs/feature-addendum.md`, `docs/STATUS.md`, and the on-disk `.gitignore`. Verdict up front: **the specs are unusually strong on licensing hygiene and security** — the GPL posture, CC0 data sourcing, and "moves are facts / words are copyrighted" framing are correct and well-defended. The real risks are (1) a handful of genuine licensing landmines that are *named but not closed*, (2) several concrete feasibility traps that will bite during the build, and (3) **two containment gaps that are live right now in the committed `.gitignore`**. Details below, then the two scoped feature lists.

---

## (a) LICENSING problems / non-redistributable assets

**No chess.com proprietary assets are specified anywhere** — good. The "Brilliant/Great/Miss" branding is explicitly avoided and replaced with generic open labels + open hex. That part is clean. The remaining problems:

1. **Maia weights license is unresolved and is being shipped in v0 anyway.** Every doc hedges ("treat as GPL-3.0 pending CSSLab confirmation," "confirm before commercial release"). This is a v0 *ship blocker*, not a "later" item — Maia-1 human play is in the FOUNDATION list (addendum item 6). **Mitigation:** Either (a) get explicit written confirmation of the CSSLab weights license before bundling, or (b) demote Maia to NEXT and ship v0 with Stockfish-only play (the `UCI_Elo` 1320–3190 + sub-1320 randomization path, which the addendum already specifies as the fallback). Do not ship binaries with "license unstated" in a distributable build.

2. **`puzzleTheme.xml` / `learn.xml` text is AGPL-3.0 and the specs lean on it for shipped UI strings.** The content spec says "adapt-and-attribute… paraphrase, credit Lichess" for theme tooltips and praise vocab. Paraphrasing facts is fine; copying phrasings is AGPL contamination of the renderer. **Mitigation:** author all theme one-liners and praise strings from scratch (they're trivial — "a knight attacks two pieces at once"), cite Lichess as *inspiration* in credits, and never copy the XML values. Add a build-time lint that fails if any shipped string matches an XML value.

3. **Lichess "standard" sounds and texture board images** — correctly excluded (unclear / AGPL). Kenney CC0 is the right default. **One gap:** Kenney packs are *UI/interface* sounds, not chess move/capture sounds — they will sound generic. That's acceptable for v0 but flag it as a known quality tradeoff; the alternative (recording your own CC0 move sounds) is cheap and worth a NEXT item.

4. **GPL/AGPL source-availability obligation is asserted but the mechanism is hand-wavy.** "Ship a source tarball or a written offer + pinned URL" — a *pinned URL is not sufficient for GPLv3 §6* if you distribute binaries offline (the recipient may not have network access; the offer must be valid for 3 years and you must actually be able to honor it). **Mitigation:** bundle the actual corresponding source tarball for Stockfish and lc0 in `resources/licenses/` (the architecture spec lists `stockfish-src-<tag>.tar` — make that mandatory, not "or a URL"). Verify the tarball matches the exact binary release tag.

5. **Piece-set exclusion list is correct and thorough** (NC sets enumerated and banned). One nit: `shapes` is CC-BY-SA 4.0 — bundling it imposes share-alike on… nothing problematic here since it's a standalone asset, but it must be attributed in credits. Keep the CC-BY/CC-BY-SA assets out of v0's default set (ship cburnett GPLv2+, chessnut Apache, rhosgfx CC0) to keep the credits screen simple.

6. **lc0's NNUE/Maia net provenance note ("net = ODbL", "credit Leela")** conflates Stockfish's NNUE (ODbL training data) with Maia. Minor, but the credits generator must distinguish: Stockfish NNUE (GPL binary, ODbL-derived net), lc0 (GPL), Maia weights (license TBD per #1).

**Net:** the *open alternatives are already chosen correctly* (chessground/chessops over chess.com; cburnett over NC sets; Kenney over Lichess sounds; CC0 Lichess puzzle DB; self-built Polyglot over pgnmentor). The only true blockers are **Maia weights (#1)** and **the AGPL string contamination (#2)**.

---

## (b) Technical feasibility risks

1. **Native module ABI / `better-sqlite3` rebuild is the #1 build fragility.** `@electron/rebuild` against Electron 32's Node ABI is correct, but the spec doesn't pin the failure modes: prebuilt binaries vs source compile (needs a working MSVC toolchain on the Windows build machine), and the `asarUnpack` glob must actually catch the `.node` file. **Mitigation:** add an A-criterion that boots the packaged app and runs a real query; pin `better-sqlite3` to a version with Electron-32 prebuilds if available; document the MSVC/`node-gyp` prerequisite in the build script.

2. **WASM threading / SharedArrayBuffer is correctly avoided** by going native Stockfish — this eliminates the COOP/COEP headache entirely. Good call and a real risk dodged. No action needed beyond *not* regressing to WASM later.

3. **Puzzle DB size and the prune heuristic.** The full Lichess DB is ~6M rows / ~2 GB decompressed. The prune (`NbPlays>=50 AND Popularity>=80`) is asserted to yield "a few hundred K puzzles" — **this is unverified and the thresholds directly determine installer size AND whether thin-theme pools (interference/xRay/quietMove/zugzwang/queenEndgame) survive the cut.** The content spec already flags those themes as "thin" *before* pruning; the prune will make them thinner and can break lessons that query them. **Mitigation:** make the prune theme-aware — keep ALL puzzles for thin themes regardless of popularity, prune aggressively only on rich themes. Measure actual row count and DB size as a build assertion, not a guess.

4. **The `puzzle_themes` junction table multiplies rows ~Nx (avg themes per puzzle ≈ 3–5).** A few hundred K puzzles → 1–2M junction rows. That's fine for SQLite with the covering index, but `ORDER BY RANDOM() LIMIT :count` over a filtered set **does a full scan of the matching partition** — on a hot theme+rating band that's tolerable, but it will not scale to "millions of rows" gracefully. **Mitigation:** for random selection use the indexed-rowid-skip trick (`WHERE rowid >= (random offset)`) or a precomputed shuffle column, not `ORDER BY RANDOM()`. Cheap to fix, expensive to discover in production.

5. **Schema dialect mismatch between the two specs — this is a real consistency bug.** Architecture §2.1 / §11 calls the writable DB **`app.sqlite`** with tables `game`/`game_move`/`rating`/`puzzle_attempt`/`game_review`/`move_eval`. The content spec §5 calls it **`user.sqlite`** with *differently named* tables `games`/`user_rating`/`attempts`/`srs_cards`/`progress`. The addendum uses a third set (`game`, `progress_snapshot`, `perf_estimate`, `bot_persona`). **These cannot all be right.** Pick one schema (the addendum's is the most complete) and reconcile all three docs before any DB code is written, or you'll get two half-built persistence layers.

6. **`x86-64-universal` Stockfish auto-detect** is the right anti-`illegal-instruction` choice, but verify the official SF18 Windows release actually ships that build flavor under that name (Stockfish distributes `x86-64`, `-modern`, `-bmi2`, `-vnni`, etc.; "universal" is a runtime-dispatch build that exists but confirm the asset name in the `fetch-engines.mjs` pin). **Mitigation:** the fetch script must assert the downloaded binary's reported `compiler`/`arch` via a UCI `bench` or version probe, not trust the filename.

7. **Two persistent Stockfish processes + one lc0 = 3 engine children**, each wanting `Threads = cores-1` and `Hash 128–512MB`. On a 4-core laptop running analysis + a live game simultaneously you can oversubscribe cores and RAM. **Mitigation:** the play instance should run capped threads/hash (it's intentionally weak anyway); only the analysis instance gets the big budget; never let both run `cores-1` at once.

8. **Engine process lifecycle on Windows** — `child.kill()` on Windows does not reliably kill a stuck Stockfish mid-`go infinite`. **Mitigation:** send UCI `stop` then `quit`, and fall back to `taskkill /pid /T /F` (or `tree-kill`) on `app.will-quit`; add the "switching positions never leaks a process" check (already A4) as an automated test, not a manual one.

9. **electron-vite + CJS-vs-ESM footgun is acknowledged** (`no "type":"module"` initially). Reasonable, but `better-sqlite3` marked `external` + the `app://` custom protocol + sandboxed preload is a lot of moving parts that interact; budget real integration time for "renderer can't reach the engine but the bridge works."

10. **Build-time Stockfish annotation of ~100 famous games + every lesson position** at `go depth 20` is a long CI step (minutes to tens of minutes). Fine, but cache it and don't re-run on every build.

---

## (c) Gaps / missing components

1. **No FEN/PGN paste *validation and error-surfacing* contract.** UI §4.9 mentions a paste modal "validated before load with a clear error," but no IPC channel exists for it and no spec defines *what* counts as valid (illegal FEN, half-move clock garbage, PGN with unsupported variations). chessops will throw — define the error shape.

2. **No migration story for the read-only `puzzles.sqlite` when the app updates.** If v0.2 ships a newer puzzle DB, how does the writable `app.sqlite` (which references `PuzzleId`s and stores attempts/SRS cards) survive a puzzle-DB swap that removed some puzzles? **Gap:** define behavior for orphaned `puzzle_attempt`/`srs_cards` rows pointing at puzzles no longer present.

3. **Curriculum content authoring is unscoped as work.** The schema and the band/unit/lesson *tree* exist, but the actual authored lesson JSON, interactive segments, and `authoredPositions` PGN modules (needed to backfill thin pools and sub-600 / ≥1900 bands) are a large content-authoring effort with no estimate or owner. This is the single biggest hidden-scope item in v0.

4. **Opening explorer W/D/L stats source is underspecified.** UI §4.8 promises "candidate moves with W/D/L from the self-built CC0 stats," but no build script produces those stats and no table stores them. `build-books.mjs` (Polyglot) is NEXT and only gives move weights, not W/D/L. **Either** cut the W/D/L explorer from v0 **or** add a stats-building step. As written it's a UI promise with no backend.

5. **No accessibility/perf budget for the move-list variation tree** — a deeply nested recursive chessops tree re-rendered on every navigation can jank. The UI spec mentions auto-scroll and figurine toggle but not virtualization or memoization for large games (100+ moves with variations).

6. **No clock/time-control engine** is specified for timed play, yet the UI offers `30+0, 10+0, 5+3, 3+2, 1+0`. Increment handling, flag-fall, and clock persistence (`clock_ms` column exists) need a renderer timer that survives the engine think. Minor but real, and untimed-default sidesteps most of it for v0.

7. **The `app:dataVersion` / About-data-version chain depends on a download log** (`puzzle_download.log`) that's git-ignored. After a clean clone + `npm run setup`, the log is regenerated — fine — but the *bundled* app needs the version baked in at build time, not read from a dev-machine log. Define where the shipped version string comes from.

8. **No defined behavior for "engine not found" / corrupted resources** at runtime (e.g., antivirus quarantined `stockfish.exe`). The app should degrade to "analysis unavailable" gracefully, not crash.

---

## (d) Desktop / data-leak risks — and this is where there are LIVE bugs

The *design* is correct: redirect `userData` + `sessionData` to `<project>/.devdata` before `ready`, gate on `!app.isPackaged`, git-ignore everything. But the **committed `.gitignore` on disk does not match the architecture spec's §10 gitignore**, and the differences create real leak/containment holes *right now*:

1. **`.devdata/` is NOT in the committed `.gitignore`.** The on-disk file ignores `/.userdata/`, `/.appdata/`, `/.cache/` — but the DEV-containment target the architecture spec mandates is `.devdata/`. **If the redirect runs, the dev `app.sqlite`, caches, and logs land in `.devdata/` which is currently tracked.** Fix: add `/.devdata/` to `.gitignore` (and reconcile the userdata/appdata naming so they actually match the code).

2. **Maia weights (`*.pb.gz`) and lc0 in a subdir are NOT ignored on disk.** The committed `.gitignore` only has `/resources/engine/stockfish*`, `/resources/engine/*.exe`, `/resources/engine/*.nnue`. It does **not** ignore `*.pb.gz`, `/resources/engine/weights/`, or `/resources/engine/**/*.exe` (lc0 lives at `resources/engine/win/lc0.exe` per the architecture tree — the `**` glob is needed). **After `npm run setup:engines`, tens of MB of Maia weights and `lc0.exe` would be stageable into git.** The architecture spec §10 *quotes the correct, fuller gitignore* — it just hasn't been written to disk. Fix: replace the on-disk `.gitignore` with the §10 version.

3. **No `.gitattributes` exists yet, but the LFS plan warns "never `git add` a binary before `.gitattributes` is committed."** Combined with #2, the current state is exactly the trap the spec warns about: binaries are *not* reliably ignored, *and* LFS tracking isn't set up. Fix order matters: write the full `.gitignore` AND `.gitattributes` *before* anyone runs `setup`.

4. **Desktop shortcut is a deliberate Desktop write — but it's production, not a leak.** `nsis.createDesktopShortcut: true` puts a shortcut on the user's Desktop. That's expected installer behavior, not a containment violation. The containment rule is about *dev artifacts and app data*, which the redirect handles. Just don't confuse the two; the portable target (which writes nothing to Desktop) is the cleaner "zero-footprint" option and is correctly included.

5. **A1 acceptance criterion is the right guard** ("after a full dev session, `git status` is clean, nothing on Desktop or repo root"). But it can only pass once #1 and #2 are fixed — as of now A1 would **fail** on a real run because `.devdata/` and the engine binaries aren't ignored. Make A1 a CI check, not a manual one.

**Prevention summary:** (i) commit the architecture-§10 `.gitignore` and a `.gitattributes` *now*; (ii) add `/.devdata/` explicitly; (iii) verify the `app.setPath('userData', …)` redirect runs as the literal first statements in `src/main/index.ts` before any `app` access; (iv) make A1 an automated `git status --porcelain` assertion in CI.

---

## FOUNDATION (v0) FEATURE LIST

> The minimum coherent shippable foundation, ordered for build. Each item assumes the prior ones. Ruthlessly scoped: anything that needs a second engine's license cleared, a content-authoring marathon, or a stats pipeline is pushed to NEXT.

1. **Containment + repo hygiene FIRST.** Commit the full architecture-§10 `.gitignore` (adding `/.devdata/`, `*.pb.gz`, `resources/engine/weights/`, `resources/engine/**/*.exe`) and `.gitattributes` *before* any `setup` run. Implement the `app.setPath('userData'/'sessionData', .devdata)` redirect as the literal first lines of `main`. Gate: `git status --porcelain` clean after a full dev session (A1, automated).
2. **App shell & security baseline.** electron-vite triple-build; locked `webPreferences` (contextIsolation/sandbox/nodeIntegration:false/webSecurity); strict CSP; `app://` protocol; nav + window-open guards; one frozen typed `window.api` over contextBridge; zod-validated, origin-checked `ipcMain.handle` for every channel.
3. **Reconcile the DB schema (one source of truth) + persistence layer.** Resolve the `app.sqlite`/`user.sqlite` and table-name conflicts across the three docs into a single schema (use the addendum's superset). Open read-only `puzzles.sqlite` from `resourcesPath`; create writable user DB in `userData`; `user_version` migrations.
4. **Native Stockfish 18 integration.** `fetch-engines.mjs` with binary provenance assertion (verify arch via UCI, not filename); `extraResources` + `process.resourcesPath` resolution; hand-rolled UCI wrapper (line-buffer, MultiPV stream, `stop`-before-`go`); **two instances** (analysis big-budget, play capped-budget); Windows-safe kill (`stop`→`quit`→`taskkill /T /F`) on close/quit.
5. **Puzzle DB build pipeline.** `zstd --long=31 -d` → header validation → **theme-aware prune** (keep all thin-theme rows, prune only rich themes) → junction table with covering index → **non-`ORDER BY RANDOM()` selection** (rowid-skip or shuffle column) → `ANALYZE`/`VACUUM`. Assert final row count + DB size as build gates.
6. **Analysis board.** chessground wrapper + chessops `dests`; legal dots/capture rings; last-move/check highlights; right-click arrows/circles; eval bar with the lichess Win% sigmoid (`-0.00368208`, clamped, mate→finite band) that flips with orientation; engine panel (MultiPV 3–5, depth, click-to-preview); recursive variation move list with NAGs + figurine/letter toggle; lichess-verbatim keyboard nav; promotion overlay.
7. **FEN/PGN load with a defined validation/error contract** (the one missing IPC piece for §4.9) + a "copy FEN" affordance.
8. **Openings name lookup.** `build-openings.mjs` from CC0 `chess-openings` at a pinned commit; `epd → {eco,name}` map; runtime deepest-match via chessops `makeFen{epd:true}`; golden-oracle en-passant edge-case test. (Cut the W/D/L explorer — see NEXT.)
9. **Puzzles + Glicko-2 local rating.** `puzzles:next` by theme+rating; correct `FEN+Moves[0]` presentation (solution starts at `Moves[1]`, promotions handled); per-attempt Glicko-2 with RD floor; hint ladder; FSRS-6 (ts-fsrs) review queue for failures. Define orphaned-card behavior for future DB swaps.
10. **Play vs Stockfish at any level.** `UCI_LimitStrength` + `UCI_Elo` 1320–3190; sub-1320 via MultiPV weighted-random (the addendum's Maia-free fallback); color/time-control (untimed default); persist to the game schema; "Review this game" CTA.
11. **Full game review.** Fixed-depth Stockfish over the game; per-move Win%/accuracy/classification (the two *separate* threshold functions — review delta vs practice halved-shift); brilliancy = best/near-best + sound-sacrifice detector (needs MultiPV≥2); cache in review/move-eval tables; per-critical-move local coach text.
12. **Local coaching engine.** Re-implemented-from-scratch motif detectors (fork/pin/skewer/discovered/double-check/hanging/back-rank/mate-net/deflection/interference + the app-built overloaded detector) gated on eval swing; slot-fill NLG with deterministic-hash variant selection and a guaranteed fallback. **All strings authored fresh (no AGPL XML copying).**
13. **Accuracy-based performance estimate.** Per-game Elo *band* (re-fit constants to your SF depth, frozen); inverse-variance aggregation; always a range, always labeled distinct from the Glicko rating.
14. **Famous games (engine-annotated only).** ~100 PD/CC0 move lists, legality-validated at build; build-time Stockfish + coach annotations as shipped JSON. (Human prose → NEXT.)
15. **Saved games + minimal progress.** `My Games` list, PGN import/export, progress snapshots; dual-rating profile header (performance band vs Glicko, never merged).
16. **Settings + Credits/Licenses screen (ship-blocking).** Appearance/board/piece/sound pickers; engine knobs; auto-generated per-asset license manifest; bundled GPL text + **actual Stockfish source tarball** (not just a URL).
17. **Packaging.** electron-builder NSIS + portable; `asarUnpack` better-sqlite3 + `.node`; read-only puzzle DB opens, writable DB created on first run; A1–A13 green in CI on a clean Windows checkout.
18. **SoundManager** (Kenney CC0 default, gesture-unlock, per-event toggles), motion/animation pass honoring `prefers-reduced-motion`, accessibility pass.

**Explicitly OUT of v0 (cut from the specs' v0 claims):**
- **Maia / lc0 human-feel play** — push to NEXT until the weights license is cleared in writing (item a-1). Ship Stockfish-only play in v0.
- **Opening explorer W/D/L stats** — no backend exists; cut the W/D/L column, keep only opening name/ECO.
- **Timed clocks** — untimed/correspondence default; clocks to NEXT.

---

## NEXT-ITERATION FEATURE LIST

> What the next agentic loop should add, in priority order.

1. **Maia-1 human-feel opponent (lc0 + weights)** — *gated on written CSSLab weights-license confirmation*; lc0 CPU build, `go nodes 8`, rating→engine routing (<1320 Maia-1100, <1900 nearest Maia, ≥1900 Stockfish). Promote to a default only once licensed.
2. **Opening explorer W/D/L stats** — `build-stats.mjs` from CC0 Lichess game dumps (Elo/time-control filtered) → Zobrist-keyed stats table; wire the §4.8 explorer's W/D/L column.
3. **Named-player opening books (2b)** — per-player Polyglot `.bin` built at package time from CC0/PD facts (ship only generated books); honest "plays X's repertoire, then a matched engine" framing; Zobrist-hash validation; optional lc0 WDL-Contempt aggression toggle.
4. **Curated human annotations for famous games** — Wikipedia CC-BY-SA + Gutenberg PD prose, partitioned per-annotation with source/license fields and the auto-generated attribution screen.
5. **Maia move-match Elo estimator + Regan complexity correction** — second independent strength estimator, inverse-variance-combined with the accuracy band.
6. **Timed play** — real clocks (increment, flag-fall, persistence), premove for timed games, low-time sounds.
7. **Full curriculum content authoring** — the actual lesson JSON, interactive/guided-board segments, `drillVsEngine`, and `authoredPositions` PGN modules to backfill sub-600 / ≥1900 / thin-theme bands. (Large; could be its own loop.)
8. **Custom CC0 chess move/capture/check sounds** to replace generic Kenney UI audio.
9. **Richer progress dashboards** — long-horizon strength-band-narrowing chart, blunder-rate/accuracy trends, curriculum analytics over the v0 snapshots.
10. **Move-list virtualization/memoization** for very large annotated games (perf hardening).
11. **macOS / Linux builds** — `chmod +x` engine step, per-platform binaries, native-module rebuilds per ABI.
12. **Command palette (Ctrl/Cmd+K)**, additional piece/board themes (attributed CC-BY sets), WDL display.
13. **Puzzle-DB-update migration** — graceful handling of orphaned attempts/SRS cards when a newer `puzzles.sqlite` ships; user-data export/import.
14. **Maia-3 native UCI (feature-flagged)** — only after AGPL-3.0 review; never in any hosted/networked mode; heavier PyTorch packaging.

---

**result:** Delivered the adversarial review. Top blockers to fix before any build: (1) commit the architecture-§10 `.gitignore` + a `.gitattributes` and add `/.devdata/` — the on-disk `.gitignore` currently fails to ignore `.devdata/`, Maia `*.pb.gz` weights, and `resources/engine/**/lc0.exe`, so A1 containment would fail and binaries could enter git; (2) Maia weights license is unconfirmed yet Maia is in v0 — demote to NEXT or get written CSSLab confirmation; (3) reconcile the three conflicting DB schemas (`app.sqlite` vs `user.sqlite`, divergent table names) into one; (4) the opening-explorer W/D/L promise has no backend (cut from v0); (5) author all coach/theme strings fresh to avoid AGPL `puzzleTheme.xml`/`learn.xml` contamination; (6) theme-aware puzzle prune + drop `ORDER BY RANDOM()`; (7) bundle the actual Stockfish/lc0 source tarballs, not just a URL, for offline GPLv3 §6 compliance. Two prioritized, deduplicated feature lists (FOUNDATION v0, 18 ordered items with 3 explicit cuts; NEXT-ITERATION, 14 items) are above.