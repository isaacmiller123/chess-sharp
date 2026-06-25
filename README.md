# Chess#

**A fully offline, local-first chess analysis & teaching studio for Windows — powered by Stockfish.**
Study, play, and learn from beginner to ~2000 Elo. No accounts, no paywalls, no internet required (after a one-time dataset import).

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
![Platform](https://img.shields.io/badge/platform-Windows-blue)
![Electron](https://img.shields.io/badge/Electron-42-47848F)

> A polished chess studio in the spirit of the big sites — analysis with full game review, millions of
> puzzles, a 0→2000 curriculum, famous games, a complete openings explorer, and grandmaster-style
> opponents — built entirely from open, redistributable assets and running entirely on your machine.

---

## Features

- **Analysis board** — full-strength Stockfish with multi-line evaluation, an eval bar, depth control, the engine's top lines drawn as arrows on the board, and one-click full **game review** (accuracy, blunders, brilliants, and an Elo estimate).
- **Play vs the engine** — pick an Elo from beginner to grandmaster, or face **grandmaster-style bots** that play in the manner and openings of famous players (Tal, Fischer, …). Clocks, resign, and full game history.
- **Puzzles** — the complete **Lichess puzzle database** (~6 million), with a Glicko-2 puzzle rating, themes, a hint ladder, and streaks.
- **Lessons** — a structured **0 → 2000 Elo curriculum** with interactive boards you play on, guided explanations, and linked puzzle drills.
- **Openings explorer** — the full **Lichess opening book** (3,733 named ECO lines), searchable and replayable move-by-move, with live opening detection on the board.
- **Famous games** — annotated master games with idea explanations.
- **Local coaching** — explains *why* moves are good or bad, entirely on-device (no LLM, no network).
- **Progress & profile** — every game and puzzle is saved locally; a dashboard tracks your ratings and history. Custom username, avatar, board/piece themes, and engine preferences.

Everything is **local-first**: your games, ratings, and progress live in a SQLite database under your user profile and never leave your machine.

---

## Getting started

### Option A — Install the app (recommended)

1. Download the latest **`Chess#-Setup-*.exe`** (installer) or **`Chess#-Portable-*.exe`** from the [Releases page](https://github.com/isaacmiller123/chess-sharp/releases).
2. Run it and launch Chess#.
3. Open **Settings → Datasets** and click **Import datasets**. This one-time download fetches the Stockfish engine and the puzzle database (see [Datasets](#datasets) below). After it finishes, every feature is available and the app is fully offline.

### Option B — Build from source

See [Development](#development).

---

## Datasets

To keep the repository and installer small, the two large, redistributable datasets are **not** bundled — they are imported at runtime, with one click, from this project's public GitHub release:

| Dataset | Source | License | Download |
|---|---|---|---|
| **Stockfish 18** engine (Windows x64, NNUE embedded) | [official-stockfish/Stockfish](https://github.com/official-stockfish/Stockfish) | GPL-3.0 | ~109 MB |
| **Lichess puzzle database** (compressed) | [database.lichess.org](https://database.lichess.org/) | CC0-1.0 | ~673 MB → 2.0 GB on disk |

The smaller content (the openings book, curriculum, famous games, persona definitions, piece/sound assets) is bundled in the app and works immediately.

Imported datasets are stored under your user-data folder (`%APPDATA%/Chess#/datasets/`) and verified by SHA-256 on download. Full provenance, licensing, and instructions for self-hosting or rebuilding the datasets are in **[docs/DATASETS.md](docs/DATASETS.md)**.

---

## Development

**Prerequisites:** Node 24+, npm 11+, Git. Windows for packaging.

```bash
git clone https://github.com/isaacmiller123/chess-sharp.git
cd chess-sharp
npm install
```

The large binaries and generated databases are **not** committed. Fetch/build them locally:

```bash
npm run setup:engines    # download Stockfish into resources/engine
npm run setup:puzzles    # download the Lichess puzzle dump
npm run build:puzzles    # build resources/data/puzzles.sqlite from the dump (Python)
npm run build:openings   # regenerate the openings lookup map
```

Then:

```bash
npm run dev              # run the app in development (electron-vite)
npm run typecheck        # tsc for both the main and renderer projects
npm run dist:exe         # build an unpacked app into release/win-unpacked
npm run package          # build the NSIS installer + portable exe
```

> The packaged build is intentionally **lean** — it does not embed the engine or the puzzle DB. Those are
> imported at runtime via Settings → Datasets, so the installer stays small and the repo stays clean.

### Project layout

```
src/
  main/        Electron main process — IPC, engine pool, SQLite, datasets importer
  preload/     The single typed, frozen window.api bridge (contextIsolation on)
  renderer/    React UI (features: play, analysis, puzzles, lessons, openings, …)
  shared/      Types shared across processes
scripts/       Dataset fetch/build scripts
resources/     Bundled content (openings, curriculum, famous, personas, assets)
docs/          Architecture, UX, content, and dataset documentation
```

Architecture, UX, and content-design notes live in **[docs/](docs/)** (`architecture.md`, `ui-ux.md`, `content-coaching.md`, `foundation-features.md`, `research-findings.md`).

---

## Tech

Electron 42 · React 19 · TypeScript · Vite / electron-vite · chessground · chessops · Stockfish 18 (UCI) · Node `node:sqlite` · Glicko-2 · Zod

---

## Licensing & credits

Chess# is licensed under **GPL-3.0-or-later** (see [LICENSE](LICENSE)) — a consequence of bundling and
distributing the GPL-licensed Stockfish engine, which is the right license for an open, redistributable
project like this.

Bundled / imported third-party content and its licenses are listed in **[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)**:

- **Stockfish** — GPL-3.0. Corresponding source: <https://github.com/official-stockfish/Stockfish> (tag `sf_18`).
- **Lichess puzzle database** — CC0-1.0 (public domain), via <https://database.lichess.org/>.
- **lichess-org/chess-openings** — CC0-1.0.
- Piece sets and sounds — open licenses (CC0 / CC-BY-SA / MIT as noted in Settings and the notices file).

**No proprietary site assets are included.** This project is not affiliated with Lichess, Chess.com, or the Stockfish team.
