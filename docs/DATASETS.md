# Datasets

Chess# keeps the repository and installer lean by **not** committing or bundling the two large datasets it
needs. Instead they are imported at runtime, with one click, from this project's public GitHub release, and
stored under your user-data folder. This document covers what they are, where they come from, their
licenses, and how to host or rebuild them yourself.

## What gets imported

| Key | Dataset | Imported file | Download size | On-disk size |
|---|---|---|---|---|
| `engine` | Stockfish 18 (per-OS binary, NNUE embedded) | `datasets/engine/stockfish.exe` (Windows) · `datasets/engine/stockfish` (macOS/Linux) | ~109 MB | ~109 MB |
| `puzzles` | Lichess puzzle database (Zstandard-compressed SQLite) | `datasets/puzzles.sqlite` | ~673 MB | ~2.0 GB |

The engine artifact is selected per `process.platform`/`process.arch` (see `ENGINE_ARTIFACTS` in
`src/main/datasets/datasets.service.ts`); the puzzle SQLite is byte-for-byte identical on every OS. Both
are stored under `app.getPath('userData')/datasets/` — `%APPDATA%/Chess#/datasets/` on Windows,
`~/Library/Application Support/Chess#/datasets/` on macOS (in development this is redirected to
`<project>/.devdata/datasets/`). Every consumer resolves an **imported file first**, then any bundled file,
so importing applies without a reinstall.

The smaller content — the openings book, the 0→2000 curriculum, famous games, persona definitions, and
piece/sound assets — is committed to the repo and bundled in the app, so those features work immediately.

## How the importer works

`Settings → Datasets → Import datasets` triggers the main-process importer (`src/main/datasets`):

1. Streams the artifact matching the host OS/arch from the release URL.
2. For the puzzle DB, decompresses the Zstandard stream on the fly using Node's built-in `zlib` zstd
   support (Node 24+ / Electron 42) — no external tools required.
3. Verifies the download against a known **SHA-256** and writes atomically (`*.part` → rename), so a failed
   or cancelled download never leaves a corrupt install.
4. On macOS/Linux, marks the freshly written engine binary executable (`chmod 0o755`) so it can be spawned.

The download is the only time the app touches the network; everything afterwards is fully offline.

## Provenance & licensing

### Stockfish 18 — GPL-3.0

- **Binary source:** the official release at <https://github.com/official-stockfish/Stockfish/releases>
  (tag `sf_18`), one binary per OS/CPU — `stockfish-windows-x86-64-avx2` on Windows,
  `stockfish-macos-m1-apple-silicon` on Apple-Silicon macOS (and the matching `stockfish-macos-x86-64-avx2`
  on Intel). The NNUE evaluation network is embedded in each binary.
- **License:** GNU GPL v3. Redistributing the binary obliges us to offer the **corresponding source**.
  That source is the upstream repository at tag `sf_18`:
  <https://github.com/official-stockfish/Stockfish/tree/sf_18>. Because Chess# itself is licensed
  GPL-3.0-or-later, this obligation is satisfied for the whole distribution.

### Lichess puzzle database — CC0-1.0

- **Source dump:** `https://database.lichess.org/lichess_db_puzzle.csv.zst` (~300 MB), from
  <https://database.lichess.org/> — ~6 million puzzles, columns
  `PuzzleId, FEN, Moves, Rating, RatingDeviation, Popularity, NbPlays, Themes, GameUrl, OpeningTags`.
- **License:** Creative Commons CC0 1.0 (public domain). No attribution required; credit is given gladly.
- Chess# builds the dump into an indexed `puzzles.sqlite` (see `scripts/build_puzzles_db.py`) and
  distributes that SQLite file Zstandard-compressed.

### lichess-org/chess-openings — CC0-1.0

- **Source:** the `a.tsv`–`e.tsv` files at <https://github.com/lichess-org/chess-openings> — 3,733 named
  ECO lines (`eco`, `name`, `pgn`).
- **License:** CC0 1.0 (public domain).
- The openings explorer dataset (`src/renderer/src/features/openings/openings-db.json`) and the live
  position-lookup map (`resources/openings/openings.json`) are generated from these and committed, since
  they are small.

## Rebuilding the datasets yourself

You don't need the release to build everything from the original public sources:

```bash
# Stockfish engine -> resources/engine/<os>/stockfish[.exe]  (auto-detects your OS/CPU)
npm run setup:engines

# Lichess puzzle dump -> data/raw, then build the SQLite DB -> resources/data/puzzles.sqlite
# (build:puzzles needs Python 3.14+ for stdlib zstd, or `pip install zstandard` on older Python)
npm run setup:puzzles
npm run build:puzzles

# Openings (both the explorer list and the lookup map)
npm run build:openings        # resources/openings/openings.json (EPD -> {eco,name})
node scripts/build-openings-list.mjs  # src/.../openings-db.json (full searchable book)
```

## Hosting the release assets (maintainers)

The importer (`src/main/datasets/datasets.service.ts`) points at a release named `datasets-v1`. It needs the
shared puzzle DB plus **one engine binary per supported platform** — the raw binary, not the upstream
archive (the importer streams a single file; it does not unzip/untar):

- `puzzles.sqlite.zst` — `resources/data/puzzles.sqlite` compressed with Zstandard (level ~12). Shared by all OSes.
- `stockfish-sf18-win-x64.exe` — a copy of `resources/engine/win/stockfish.exe`.
- `stockfish-sf18-mac-arm64` — a copy of `resources/engine/mac/stockfish` (Apple Silicon).

Each engine asset name + its `bytes`/`sha256` live in the `ENGINE_ARTIFACTS` map in
`src/main/datasets/datasets.service.ts`, keyed by `${process.platform}-${process.arch}`. **Adding a platform
= upload its raw binary here and add one verified row to that map.** Until a platform's asset is uploaded,
Macs/PCs of that kind can still run from a *bundled* engine (a from-source build) but cannot import one.

To regenerate and publish them:

```bash
# Compress the puzzle DB (Node has zstd built in; no CLI needed)
node -e "const fs=require('fs'),z=require('zlib'),{pipeline}=require('stream'); \
  pipeline(fs.createReadStream('resources/data/puzzles.sqlite'), \
  z.createZstdCompress({params:{[z.constants.ZSTD_c_compressionLevel]:12}}), \
  fs.createWriteStream('puzzles.sqlite.zst'), e=>{if(e)throw e; console.log('done')})"

# Engine binaries (run setup:engines on each OS first to populate resources/engine/<os>/)
cp resources/engine/win/stockfish.exe stockfish-sf18-win-x64.exe   # on Windows
cp resources/engine/mac/stockfish      stockfish-sf18-mac-arm64    # on Apple-Silicon macOS

# Record the sha256 + byte size for each, then update ENGINE_ARTIFACTS to match:
shasum -a 256 stockfish-sf18-mac-arm64 && stat -f%z stockfish-sf18-mac-arm64

gh release create datasets-v1 \
  puzzles.sqlite.zst stockfish-sf18-win-x64.exe stockfish-sf18-mac-arm64 \
  --title "Datasets v1" --notes "Stockfish 18 engines (per-OS) + Lichess puzzle DB (compressed)."
# (or `gh release upload datasets-v1 stockfish-sf18-mac-arm64` to add the Mac binary to an existing release)
```

If you change the asset bytes, update the matching `bytes`/`sha256` fields in
`src/main/datasets/datasets.service.ts` (the importer verifies them). The current `darwin-arm64` row already
carries the verified checksum for `stockfish-sf18-mac-arm64`.
