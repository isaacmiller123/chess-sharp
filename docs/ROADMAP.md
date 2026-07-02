# Chess# — Roadmap & future-work reminders

> Running list of everything still to do, so nothing gets lost between sessions.
> Status per the owner (2026-06-30): the whole thing is **~60% there**.
> Authoritative school spec: `docs/SCHOOL-SPEC.md`. Live school build state: `docs/school-build-log.md`.

## 🔜 In progress / recently shipped (this session)
- [x] **Removed the old Lessons tab → folded into the School.** Deleted the `Lessons` nav tab,
      `features/lessons/*`, and the `curriculum` backend/IPC/types. Home "next" card now continues the
      current School chapter / starts the next / prompts placement.
- [x] **Moved Famous Games into Analysis.** Standalone Famous tab + `features/famous/*` deleted; a
      "Load famous game" picker inside Analysis loads any famous game into the real analysis board
      (eval bar, review, coach, badges all light up).
- [x] **Audited + revised the Analysis tab + own-game flow.** Fixed: the broken "click a saved game →
      empty board" (gameId now threads through; saved games actually load + orient to your side);
      "Analyze this game" button on the end-of-game banner; a single engine crash no longer
      permanently wedges all reviews (timeout + exit handler + review:cancel); eval-bar fake +0.00
      when engine off; one-frame stale arrows after navigating; keyboard nav hijacking page scroll;
      eval-graph marker leaking out of variations; review accuracy now persists to the game row so the
      Progress accuracy column fills; perf:estimate returns YOUR side not a 2-player average; mate-0
      mis-scoring; move-list autoscroll; loaded-game header strip; responsive layout; MultiPV persists;
      inline FEN errors. (Owner said "more to do from there" — awaiting next direction.)

- [x] **Full-project audit-and-fix pass (2026-07-02).** 6 subsystem auditors → triage → 6 fixers →
      integration verify: 47 verified defects fixed (3 critical: dead SRS/streak systems, custom mode
      moving the Glicko rating, stale placement completions → v7 `auto_completed` provenance migration;
      13 high incl. unsolvable underpromotion curriculum items, sawtooth eval graph, wrong-side clock
      drain, review results never persisted, retry double-rating, fake Home daily card, `eloFloor`
      leaking over IPC). Typecheck + build clean; installed and verified live at user_version 7.

- [x] **Polish overhaul (2026-07-02, owner-directed).** 8-agent fleet: School UI overhauled (tiered
      journey layout, hero current-chapter, lesson timeline, capstone test card); school playthrough
      polished (custom annotation brushes, debrief blank-square bug fixed via per-line `fen`, move
      history in boss/placement/model, hint ladders in school puzzles + Custom/Daily modes, Viktor
      persona with portrait + states); review quality (depth 18-20, chess.com classification incl.
      Brilliant/Great/Miss, badge chips on every move, per-side review table, recalibrated Elo estimate
      w/ ACPL); sub-1320 engine strength rebuilt (main-process MultiPV softmax, no more uniform-random
      moves); famous games start at move 1; "Your games | Famous" browser in Analysis; opening line
      moved into the sidebar; openings grouped family→variations; settings overhaul (6 app themes,
      QoL toggles: autoQueen/confirmResign/hints/engine-arrows/eval-bar/low-time/volume, per-scope
      progress reset with confirm).

## ⏳ Deferred (needs a decision or owner action)
- [ ] **Mac Stockfish engine — upload to the release.** ROOT CAUSE: the app uses a lean installer
      that fetches Stockfish at runtime from the `datasets-v1` GitHub release, but only the Windows
      binary (`stockfish-sf18-win-x64.exe`) is uploaded — the mac asset `stockfish-sf18-mac-arm64`
      is **missing**, so a fresh Mac install's engine download 404s. (This dev machine is fine — it
      already has the engine imported at `~/Library/Application Support/chess-sharp/datasets/engine/`.)
      The binary exists at `resources/engine/mac/stockfish` (113 MB, Mach-O arm64).
      - **Fix A (keep lean, needs your GitHub login):** `brew install gh && gh auth login`, then
        `gh release upload datasets-v1 resources/engine/mac/stockfish#stockfish-sf18-mac-arm64 --repo isaacmiller123/chess-sharp`
      - **Fix B (no credentials, I can do it):** bundle the engine into the Mac build via
        `electron-builder.yml` extraResources — Mac installer grows ~113 MB, diverges from lean design.
      - Deferred for now ("not worried about git yet").
- [ ] **chess.com 1:1 puzzle-rating rework.** Behavior-match their puzzle rating model. (The puzzle
      team flagged this as design-forked and left the Glicko-2 ladder intact; Rush deliberately
      doesn't move it.)
- [ ] **Proactive in-game Viktor coaching.** Viktor narrates at instructive moments during live play
      (the `narrate` path is built but not wired into a live game loop).

## 🧭 Exploratory (asked about; not building yet)
- [ ] **Web port.** The renderer is already React/TS; the blockers are the Electron-only main process
      (node:sqlite DBs, local Stockfish, IPC). Path: replace IPC with a server/WASM backend —
      Stockfish.wasm in-browser for the engine, a hosted DB/API for puzzles/games. Notes in session.

## ✅ Done (for reference)
- **Internet multiplayer (2026-07-02):** play any two computers anywhere — one player hosts and gets a
  code like `A1B2C-D3E4F`, the other enters it and connects, across NATs/countries, with no user-run
  server and no port forwarding. Replaces the old same-LAN WebSocket transport entirely. Built on WebRTC
  data channels in the renderer (Chromium `RTCPeerConnection`), peer discovery via **trystero** (Nostr
  relays); the code is a random room key, not an IP. Host-authoritative clocks/turn-order,
  draw/resign/rematch, wire-level heartbeat, 30s discovery timeout. Harnesses: `scripts/test-mp.mjs`
  (pure-session assertions over an in-memory transport pair) and `scripts/check-relays.mjs` (relay/TURN
  reachability probe).
- Mac port (cross-platform, congruent codebase); analysis-loop freeze fixed.
- 40-chapter Chess School authored, soundness-audited (all pass), installed.
- Viktor coach; board-centric lesson UI; chapter tests.
- Placement game → internal-Elo estimate → name-based chapter unlock (Elo never shown), shipped.
- Old Lessons tab removed → School; Famous folded into Analysis; Analysis own-game-review fixed.
- **Puzzles trainer finished (DB v5):** 4 modes — Train (adaptive), Custom/Themed (pick themes+
  difficulty+length → focused set + accuracy-ring summary), Rush/Storm (rush3/rush5/storm/survival,
  prefetched queue + climbing band + lives/clock HUD, own high-score), Daily (deterministic daily +
  local streak + cross-mode stats + history). Rush doesn't move the Glicko ladder.
- **School ideas built (DB v6):** (1) test P1 polish — `recordTest` is now server-authoritative on
  pass/fail, fail-both resets the whole chapter (keeps best_pct), multi-ply "play the opening out"
  supported; (2) weakness-driven "recommended next chapter" (name-based, never Elo); (3) SM-2-lite
  spaced repetition of concepts (concept_srs + a "reviews due" drill); (4) daily lesson + local-day
  study streak. Surfaced via a Today card + Recommended-next card on the School home.
