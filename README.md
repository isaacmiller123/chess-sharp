# Chess#

A fully offline, local-first chess **analysis & teaching** desktop app, powered by Stockfish.
Built to study, play, and learn from beginner to ~2000 Elo — no paywalls, no internet required.

> A polished, fully offline chess studio: analysis with full game review, 4.7M puzzles, a
> 0→2000 curriculum, famous games, openings, and grandmaster-style opponents — all bundled.

## Goals
- Full-strength **Stockfish** analysis: top engine lines, eval bar, depth, and move classification.
- **Local, LLM-free interactive coaching** that explains *why* moves are good or bad.
- **Bundled content**: Lichess open puzzle DB, openings, and a structured curriculum (0 → 2000 Elo).
- A **polished, modern UI** in the spirit of the big chess sites — built entirely from open, redistributable assets.

## Tech (provisional — finalized by the architecture spec)
Electron · React · TypeScript · Vite · Stockfish (UCI) · SQLite

## Development
Toolchain: Node 24+, npm 11+, git. Setup scripts (engine fetch, dataset → SQLite build) and full
instructions land with the foundation scaffold. Large binaries and generated databases are **not**
committed — they are fetched/built locally via `npm run setup:*`.

## Licensing
The bundled engine, datasets, and visual/audio assets are open / redistributable
(GPL / CC0 / MIT / CC-BY-SA as applicable); third-party licenses are tracked under `docs/`.
**No proprietary site assets are included.**
