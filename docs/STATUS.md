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

## Next
- Persist research specs to `docs/`.
- Scaffold the Electron + Vite + React + TS foundation.
- Author data-ingest scripts (Stockfish fetch; Lichess puzzle DB → SQLite).
- Build the analysis board (engine, eval bar, move list, top lines), then test + harden.
