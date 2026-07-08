# Chess#

**A fully offline, local-first board-game studio for Windows & macOS — chess analysis, a 0→2000 teaching school, worldwide multiplayer, and a whole library of games — powered by Stockfish and friends.**
No accounts, no paywalls, no internet required for single-player (after a one-time dataset import).

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS-blue)
![Electron](https://img.shields.io/badge/Electron-42-47848F)
[![Release](https://img.shields.io/github/v/release/isaacmiller123/chess-sharp?sort=semver)](https://github.com/isaacmiller123/chess-sharp/releases/latest)

> A polished studio in the spirit of the big sites — full game review, ~6 million puzzles, a
> 0→2000 curriculum, grandmaster-style opponents, and **peer-to-peer online play** — plus a
> library of **20+ board games** (chess variants, xiangqi, shogi, go, checkers, othello, and
> more), each playable local, versus a bot, or online. Built entirely from open, redistributable
> assets and running entirely on your machine.

---

## Features

### Chess

- **Analysis board** — full-strength Stockfish with multi-line evaluation, an eval bar, depth control, the engine's top lines drawn as arrows, and one-click **game review** with chess.com-style move classifications (Brilliant / Great / Blunder / Miss …), per-side accuracy, factual move comments, and an **empirically-calibrated Elo estimate** (fitted to real engine games, shown with an honest ± band).
- **Play vs the engine** — pick any strength from beginner to grandmaster. Weak (sub-1320) play is calibrated so low-rated bots feel human, not random. Optional **"Human" style** uses **Maia** neural nets (1100–1900) that play like real players of that rating.
- **Grandmaster bots** — **24 grandmaster personas** across every era (Morphy, Tal, Fischer, Kasparov, Carlsen, and more), each with a photo, play-style description, famous-games button, peak Elo **and** an era-adjusted "today" estimate. Realistic time management, takebacks, hint ladders, and themeable sound effects (lichess / chess.com / realistic).
- **Puzzles** — the complete **Lichess puzzle database** (~6 million) with a Glicko-2 rating, theme filters, **Custom / Rush / Daily** modes, a hint ladder, and retry-on-wrong.
- **School** — a structured **0 → 2000 Elo curriculum** (40 chapters) led by coach **Viktor**: interactive boards you play on, guided explanations, per-chapter tests, and placement that estimates your Elo and unlocks lessons up to your level.
- **Openings explorer** — the full **Lichess opening book** (3,733 named ECO lines), searchable and replayable, with live opening detection that persists on the board.
- **Online multiplayer** — **worldwide peer-to-peer play over WebRTC.** One player hosts and shares a short code; the other joins from anywhere — no server to run, no port forwarding, no account. Host-authoritative clocks, first-move grace, reconnect grace, draw/rematch, and "won on time" all behave like the big sites.

### The games library

A dedicated **Games** tab with a card for every game — each playable **local (pass-and-play)**, **vs a 5-level bot**, or **online** (the same join-code system as chess), with an in-app **manual** (rules + strategy) for each:

- **Chess & variants** — Chess960, Crazyhouse, Atomic, Antichess, King of the Hill, Three-Check, Horde, Racing Kings, and Setup (placement) chess.
- **Regional chess** — **Xiangqi** (Chinese), **Shogi** (Japanese), **Janggi** (Korean), **Makruk** (Thai).
- **Draughts** — **Checkers** (American 8×8) and **International draughts** (10×10).
- **Territory & connection** — **Go** (9×9 / 13×13 / 19×19, with dead-stone marking + area scoring), **Gomoku**, **Hex**.
- **Classics** — **Othello / Reversi**, **Connect Four**, **Nine Men's Morris**, **Tic-Tac-Toe**.
- **Variant Lab** — a **custom-variant editor**: pick a template (30-Pawn army, Amazon queen, Nuclear, tiny/grand boards…), set the board size, paint the start position, tweak the rules, and play your creation locally — all validated live by the engine.

Every game renders in polished **2D**, and the flagship games (chess, checkers, go, gomoku, othello, connect four) also offer a **3D board** (a photoreal marble chess set, slate go stones, felt-and-wood boards) — a per-game toggle that falls back to 2D if the GPU can't manage it.

Everything is **local-first**: your games, ratings, and progress live in a SQLite database under your user profile and never leave your machine. Online play connects your two devices directly, end-to-end encrypted, with only public relays used to introduce the peers.

---

## Getting started

### Option A — Install the app (recommended)

1. Download the latest build from the [Releases page](https://github.com/isaacmiller123/chess-sharp/releases/latest):
   - **Windows (x64)** — `Chess-Setup-*.exe` (installer), `Chess-Portable-*.exe` (single-file portable), or `Chess-*-win-x64.zip` (unzip-and-run).
   - **macOS** — `Chess-*-arm64.dmg` (Apple Silicon) or `Chess-*-x64.dmg` (Intel); matching `.zip` builds are also published.
2. Run it. These builds are **unsigned**, so the OS shows a one-time warning on first launch — clear it as described in [First run: unsigned builds](#first-run-unsigned-builds) below.
3. Open **Settings → Datasets** and click **Import datasets**. This one-time download fetches the Stockfish engine (matched to your OS) and the puzzle database (see [Datasets](#datasets) below). Optional game engines (Fairy-Stockfish, KataGo, Maia) can be imported the same way when you first play those games. After the core import, every chess feature works fully offline.

> **Playing online with a friend:** both of you install the app, one opens **Play → Online → Host** and shares the code, the other picks **Join** and enters it. It works across different networks and countries. Both players must run the **same version** (the wire protocol is version-checked; mismatched versions refuse politely rather than misbehave).

### First run: unsigned builds

The published installers are **not code-signed** (no Apple Developer ID, no Windows Authenticode certificate). They are safe to run — the OS just doesn't recognize the publisher, so it warns you once.

- **Windows (SmartScreen).** Double-clicking the `.exe` may show *"Windows protected your PC"*. Click **More info → Run anyway**. For the portable `.exe`/`.zip`, Windows may also flag the download — right-click the file → **Properties** → tick **Unblock** → **OK** before running.
- **macOS (Gatekeeper).** The first launch may say the app *"cannot be opened because Apple cannot check it for malicious software."* Either right-click (Control-click) the app → **Open** → **Open**, or go to **System Settings → Privacy & Security** and click **Open Anyway**. If a browser set the quarantine flag, `xattr -dr com.apple.quarantine "/Applications/Chess#.app"` in Terminal clears it.

Signing/notarization would remove these prompts, but requires a paid Apple Developer ID and a Windows code-signing certificate, which this project does not currently ship.

### Option B — Build from source

See [Development](#development).

---

## Datasets

To keep the repository and installer small, the large, redistributable datasets are **not** bundled — they are imported at runtime, with one click, from this project's public GitHub release. The **core** import (needed for analysis, bots, and puzzles) is Stockfish + the puzzle database; the rest are **optional**, imported only when you first play the games that need them.

| Dataset | Used for | Source | License |
|---|---|---|---|
| **Stockfish 18** (per-OS binary) | analysis, chess bots | [official-stockfish/Stockfish](https://github.com/official-stockfish/Stockfish) | GPL-3.0 |
| **Lichess puzzle database** | ~6M puzzles | [database.lichess.org](https://database.lichess.org/) | CC0-1.0 |
| **Fairy-Stockfish** *(optional)* | chess variants + xiangqi / shogi / janggi / makruk bots | [fairy-stockfish](https://github.com/fairy-stockfish/Fairy-Stockfish) | GPL-3.0 |
| **KataGo** + nets *(optional)* | Go bots (incl. a human-like net) | [lightvector/KataGo](https://github.com/lightvector/KataGo) | MIT |
| **lc0 + Maia nets** *(optional)* | human-like chess bots (1100–1900) | [lc0](https://github.com/LeelaChessZero/lc0) · [CSSLab/maia-chess](https://github.com/CSSLab/maia-chess) | GPL-3.0 / MIT |

Every engine binary matches your OS/CPU automatically and is verified by SHA-256 on download. The smaller content (openings book, curriculum, famous games, persona photos, game piece/board art, sounds, manuals) is bundled in the app and works immediately. Imported datasets live under your user-data folder. Full provenance, licensing, and self-hosting/rebuild instructions are in **[docs/DATASETS.md](docs/DATASETS.md)**; third-party art credits are in-app under **Settings → Credits** and in **[docs/CREDITS.md](docs/CREDITS.md)**.

---

## Development

**Prerequisites:** Node 24+, npm 11+, Git, and Python 3 (for the dataset build scripts). Package on the OS you're targeting: Windows produces the `.exe` installer, macOS produces the `.dmg`/`.zip`. Everything else (dev, typecheck, the test suites) runs the same on both.

```bash
git clone https://github.com/isaacmiller123/chess-sharp.git
cd chess-sharp
npm install
npm run dev              # run the app in development (electron-vite)
npm run typecheck        # tsc for both the main and renderer projects
npm run build            # build renderer + main bundles
npm run package          # build installer(s): NSIS + portable .exe + .zip (Windows), dmg + zip (macOS)
```

The large binaries and generated databases are **not** committed — the app imports them at runtime (see [Datasets](#datasets)); to build them locally use the `setup:*` / `build:*` npm scripts.

### Tests

The app ships with a wall of headless suites (rules, board-key mapping, the online protocol + store, bot legality, Elo calibration, ratings integrity, migrations, manuals, and more — **~1,900 assertions**), each an esbuild-bundled `scripts/test-*.mjs`. Run any with `node scripts/<name>.mjs`.

> **CI:** [`.github/workflows/build.yml`](.github/workflows/build.yml) builds **both platforms** on a `macos-latest` / `windows-latest` matrix and **runs the platform-agnostic test suites on both OSes** on every `v*` tag or manual dispatch — so cross-platform congruence is enforced by machine, not by hand. Tag builds also publish the installers to a GitHub Release automatically. Nothing is auto-published from `main`.

The macOS `.dmg`/`.zip` and the Windows `.exe`/`.zip` are **unsigned** — see [First run: unsigned builds](#first-run-unsigned-builds). The packaged build is intentionally **lean**: it does not embed the engine or the puzzle DB (those are imported at runtime), so the installer stays small.

### Project layout

```
src/
  main/        Electron main process — IPC, engine pools, SQLite + migrations, datasets importer
  preload/     The single typed, frozen window.api bridge (contextIsolation on)
  renderer/    React UI (features: play, analysis, puzzles, school, openings, games, progress, settings)
    games/     The game kernel: per-game rules specs, registry, boards (2D + shared 3D renderer)
  shared/      Types + the online wire protocol, shared across processes
scripts/       Dataset fetch/build scripts + the test suites
resources/     Bundled content (openings, curriculum, famous games, personas, manuals, game art, sounds)
docs/          Architecture, specs (school, multiplayer, games platform), and dataset documentation
```

Design specs and notes live in **[docs/](docs/)** — including `SCHOOL-SPEC.md`, `MP-V3-SPEC.md` (multiplayer), `GAMES-PLATFORM-SPEC.md`, `architecture.md`, and `DATASETS.md`.

---

## Tech

Electron 42 · React 19 · TypeScript · Vite / electron-vite · chessground + chessgroundx · chessops + Fairy-Stockfish (ffish WASM) · Stockfish 18 / lc0 + Maia / KataGo (UCI/GTP) · tenuki (Go) · rapid-draughts · @sabaki/shudan · three.js / react-three-fiber (3D) · trystero (WebRTC P2P) · Node `node:sqlite` · Glicko-2 · Zod

---

## Licensing & credits

Chess# is licensed under **GPL-3.0-or-later** (see [LICENSE](LICENSE)) — a consequence of bundling and distributing the GPL-licensed Stockfish and Fairy-Stockfish engines.

Bundled / imported third-party content and its licenses are listed in **[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)** and **[docs/CREDITS.md](docs/CREDITS.md)**:

- **Stockfish / Fairy-Stockfish / lc0** — GPL-3.0. **KataGo / Maia nets** — MIT.
- **Lichess puzzle database** and **lichess-org/chess-openings** — CC0-1.0.
- Game piece sets, board textures, 3D models, and sounds — open licenses (CC0 / CC-BY / MIT / Apache-2.0 as noted in Settings → Credits).

**No proprietary site assets are included.** This project is not affiliated with Lichess, Chess.com, or the Stockfish team.
