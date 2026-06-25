# Third-party notices

Chess# is distributed under GPL-3.0-or-later (see [LICENSE](LICENSE)). It bundles or imports the following
third-party software and data. Each is used under its own license, reproduced or linked below.

---

## Stockfish (chess engine)

- **Project:** https://github.com/official-stockfish/Stockfish
- **Version:** Stockfish 18 (tag `sf_18`)
- **License:** GNU General Public License v3.0 (GPL-3.0)
- **Corresponding source:** https://github.com/official-stockfish/Stockfish/tree/sf_18
- **Notes:** Distributed as the official Windows x86-64 (AVX2) build with the NNUE evaluation network
  embedded. GPLv3 requires that the corresponding source be available to recipients; it is, at the link
  above, and Chess# is itself GPL-3.0-or-later. Stockfish's NNUE network is trained in part on
  Leela Chess Zero self-play data (ODbL); that affects the network's training data, not redistribution of
  the compiled binary, which is governed by GPLv3.

## Lichess puzzle database

- **Source:** https://database.lichess.org/
- **License:** Creative Commons CC0 1.0 Universal (public domain dedication)
- **Notes:** ~6 million puzzles. Used to build the bundled/imported `puzzles.sqlite`. CC0 imposes no
  conditions; attribution is given voluntarily.

## lichess-org/chess-openings (ECO opening book)

- **Source:** https://github.com/lichess-org/chess-openings
- **License:** Creative Commons CC0 1.0 Universal (public domain dedication)
- **Notes:** 3,733 named ECO lines. Used to generate the openings explorer dataset and the live
  position-lookup map.

## Chessground (board UI)

- **Project:** https://github.com/lichess-org/chessground
- **License:** GPL-3.0

## chessops (chess rules / FEN / PGN)

- **Project:** https://github.com/niklasf/chessops
- **License:** GPL-3.0

## Piece sets

The bundled piece sets (e.g. cburnett, merida, chessnut, fantasy, pirouetti) originate from the Lichess
asset collection and are used under their respective open licenses (CC0 / CC-BY-SA / GPL as applicable).
The active set's author and license are shown in **Settings → Appearance**.

## Sounds

Bundled move/notify sounds are from open sources under permissive/CC licenses.

## Icons

UI icons are from [Lucide](https://lucide.dev/) — ISC License.

---

If you believe any attribution here is incomplete or incorrect, please open an issue.
