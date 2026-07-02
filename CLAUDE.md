# Chess# — project instructions

## Chess School is governed by a binding spec
**[docs/SCHOOL-SPEC.md](docs/SCHOOL-SPEC.md) is the authoritative source of truth for all School work**
(curriculum, lessons, tests, placement/Elo, UI, and the build process). Read it before any School change and
conform to it exactly. It outranks any code comment, memory, or prior plan. Do not stray from it; changes
need explicit user approval.

Non-negotiables from that spec, summarized:
- **Scale:** beginner → 2000 Elo, ~20 chapters (100-Elo bands), 3–6 lessons each (soft). A lesson = a new
  opening + scenarios & how to exploit them + Elo-appropriate warm-up AND cool-down puzzles. Openings
  include London System, Vienna, Bong Cloud, and similar.
- **Placement & unlock:** placement game(s) estimate Elo from accuracy vs engine level (chess.com-style);
  lessons unlock up to the user's Elo.
- **Chapter test:** 10–15 questions, ≥70% to pass, 2 attempts, correct answers hidden on fail, fail both ⇒
  retake the whole chapter, takeable at any point. 2–4 multiple-choice "key idea" questions; the rest are
  board questions (play the opening out, exploit the explained moves, judge opponent moves correct/blunder).
- **Look:** must be genuinely polished (chess.com/Lichess-grade), not just "consistent." Current UI is
  unacceptable.
- **Authoring:** Opus 4.8 at MAX effort, one agent per chapter, each play-tests and self-verifies against its
  plan; then cross-check all chapters against the master curriculum; iterate until perfect.

Coach persona = **Viktor** (exacting old-school master).

## Build/run notes
- Node/npm/brew are at `/opt/homebrew/bin` (NOT on default PATH) — prepend it for shell commands.
- Cross-platform Win+Mac (see docs/DATASETS.md, docs/architecture.md). Engine + puzzle DB load via
  src/main/datasets (imported-first, then bundled). Keep all hooks before any early return in React (a
  hook-after-return caused a prior #300 crash).
