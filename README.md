# Chess#

**A fully offline, local-first chess analysis & teaching studio for Windows & macOS — powered by Stockfish.**
Study, play, and learn from beginner to ~2000 Elo. No accounts, no paywalls, no internet required (after a one-time dataset import).

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS-blue)
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

1. Download the latest build from the [Releases page](https://github.com/isaacmiller123/chess-sharp/releases/latest):
   - **Windows (x64)** — `Chess-Setup-*.exe` (installer), `Chess-Portable-*.exe` (single-file portable), or `Chess-*-win-x64.zip` (unzip-and-run).
   - **macOS** — `Chess-*-arm64.dmg` (Apple Silicon) or `Chess-*-x64.dmg` (Intel); matching `.zip` builds are also published. If a Mac build isn't published yet, use [Option B](#option-b--build-from-source) — the macOS app builds and runs from source today.
2. Run it and launch Chess#. These builds are **unsigned**, so the OS shows a one-time warning on first launch — clear it as described in [First run: unsigned builds](#first-run-unsigned-builds) below.
3. Open **Settings → Datasets** and click **Import datasets**. This one-time download fetches the Stockfish engine (matched to your OS) and the puzzle database (see [Datasets](#datasets) below). After it finishes, every feature is available and the app is fully offline.

### First run: unsigned builds

The published installers are **not code-signed** (no Apple Developer ID, no Windows Authenticode certificate). They are safe to run — the OS just doesn't recognize the publisher, so it warns you once. This is expected for an open-source, from-source project.

- **Windows (SmartScreen).** Double-clicking the `.exe` may show *"Windows protected your PC"*. Click **More info → Run anyway**. For the portable `.exe`/`.zip`, Windows may also flag the download — right-click the file → **Properties** → tick **Unblock** → **OK** before running.
- **macOS (Gatekeeper).** The first launch may say the app *"cannot be opened because Apple cannot check it for malicious software."* Either right-click (Control-click) the app → **Open** → **Open**, or go to **System Settings → Privacy & Security** and click **Open Anyway**. If a browser set the quarantine flag, `xattr -dr com.apple.quarantine "/Applications/Chess#.app"` in Terminal clears it.

Signing/notarization would remove these prompts, but requires a paid Apple Developer ID and a Windows code-signing certificate, which this project does not currently ship.

### Option B — Build from source

See [Development](#development).

---

## Datasets

To keep the repository and installer small, the two large, redistributable datasets are **not** bundled — they are imported at runtime, with one click, from this project's public GitHub release:

| Dataset | Source | License | Download |
|---|---|---|---|
| **Stockfish 18** engine (per-OS binary, NNUE embedded) | [official-stockfish/Stockfish](https://github.com/official-stockfish/Stockfish) | GPL-3.0 | ~109 MB |
| **Lichess puzzle database** (compressed) | [database.lichess.org](https://database.lichess.org/) | CC0-1.0 | ~673 MB → 2.0 GB on disk |

The engine binary matches your OS/CPU automatically (Windows x64 `.exe`, macOS Apple-Silicon/Intel). The puzzle database is a plain SQLite file and is identical on every platform. The smaller content (the openings book, curriculum, famous games, persona definitions, piece/sound assets) is bundled in the app and works immediately.

Imported datasets are stored under your user-data folder — `%APPDATA%/Chess#/datasets/` on Windows, `~/Library/Application Support/Chess#/datasets/` on macOS — and verified by SHA-256 on download. Full provenance, licensing, and instructions for self-hosting or rebuilding the datasets are in **[docs/DATASETS.md](docs/DATASETS.md)**.

---

## Development

**Prerequisites:** Node 24+, npm 11+, Git, and Python 3 (for the dataset build scripts — 3.14+ for the built-in zstd, or `pip install zstandard` on older versions such as the macOS system Python). Package on the OS you're targeting: Windows produces the `.exe` installer, macOS produces the `.dmg`/`.zip`. Everything else (dev, typecheck, engine smoke test) runs the same on Windows and macOS.

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
npm run smoke:engine     # headless UCI smoke test of the bundled engine (any OS)
npm run dist:exe         # build an unpacked app for your OS (release/<platform>-unpacked)
npm run package          # build the installer(s): NSIS + portable .exe + .zip on Windows, dmg + zip on macOS
```

Windows produces `Chess-Setup-*.exe`, `Chess-Portable-*.exe`, and `Chess-*-win-x64.zip` (x64); macOS produces the `.dmg`/`.zip` for arm64 and x64. electron-builder cannot cross-compile the installers, so package each on its own OS.

> **CI:** [`.github/workflows/build.yml`](.github/workflows/build.yml) builds both platforms on GitHub Actions — a `macos-latest` / `windows-latest` matrix (Node 22) that runs `npm ci`, `npm run typecheck`, `npm run build`, then `electron-builder --publish never`, and uploads the installers as workflow artifacts. It runs on `workflow_dispatch` or when a `v*` tag is pushed. Nothing is auto-published to a release; download the artifacts and attach them yourself.

> The macOS `.dmg`/`.zip` and the Windows `.exe`/`.zip` produced by `npm run package` (and by CI) are **unsigned**. They run locally, but the first launch on another machine trips Gatekeeper (macOS) or SmartScreen (Windows) — see [First run: unsigned builds](#first-run-unsigned-builds). Removing those prompts requires a Developer ID identity + notarization on macOS and an Authenticode certificate on Windows — see `electron-builder.yml`.

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
