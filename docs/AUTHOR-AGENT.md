# Authoring-agent playbook (READ THIS FIRST)

You are authoring ONE chapter of a serious chess school. Quality is everything; speed comes from focus.

## Token discipline (why this exists)
Opus is sharpest in roughly its **first ~100–150k tokens**; quality decays as context fills. So:
- **This is about staying SHARP, never about doing less.** The 150k window does NOT mean cut corners, skip
  rigor, shorten lessons, or weaken the two-gate validation. Full depth and quality ALWAYS. The only thing
  you save tokens on is *rebuilding infrastructure that already exists* — not the work itself.
- **Stay focused. Do NOT build your own legality/validation toolkit** — one already exists (below). Rebuilding
  it is the #1 token sink and it's wasteful.
- Aim to finish a chapter well **under ~150k tokens** of your own work — and if you can't do it *well* in that
  window, HAND OFF (below) rather than grinding past your sharp window. Never trade quality for brevity.
- **Your chapter WILL be independently AUDITED** by a separate reviewer who plays it as a real learner and
  judges it ruthlessly (helpful? redundant? does it stick? clear? fair test?). You will be sent back to fix
  anything weak. Author it to *survive that audit*: make every segment teach, cut all filler, make it stick.
- **If your task is large** (the 8–10-lesson summit chapters) and you feel your context getting long,
  **CHECKPOINT and hand off**: save the chapter JSON as-is, write a sibling `<chapter-id>.handoff.md` note
  (what's done, exactly what's left, any gotchas/decisions), and STOP. A fresh agent will continue from the
  file + your note. A clean handoff beats a long, degrading single pass.

## Validation = TWO gates (both required; legality alone is NOT validation)
A chapter is not "validated" until BOTH pass:
1. **Legality/structure (automated):** the shared validator below prints CLEAN.
2. **Unbiased pedagogical playthrough (a DIFFERENT, fresh agent — never the author):** that agent reads the
   chapter top to bottom and *plays it as a real learner*, then judges it RUTHLESSLY and without bias on:
   - **Helpful** — does each segment actually TEACH its idea? Are Viktor's explanations clear, concrete, and
     non-circular (never "this is good because it's good")? Is the *why* always there?
   - **Not redundant** — no repeated ideas, filler, padding, or near-duplicate positions/questions.
   - **Sticks** — memorable examples, sound sequencing (each step builds on the last), the right number of
     reps to cement it, a difficulty curve that fits the level.
   - **Fair, coverage-complete test** — questions genuinely require applying the chapter's ideas; every
     lesson represented; nothing trivially guessable or ambiguous.
   The reviewer defaults to **REVISE** unless the chapter is genuinely excellent, and returns specific,
   actionable fixes. The chapter then iterates (revise → re-review) until the reviewer passes it. This
   pedagogical loop IS the "iterate to perfect" the project requires.

## Chess SOUNDNESS, not just legality (this is what audits keep failing on)
Legal ≠ sound. **Cross-check against the established theory FIRST — do not brute-force the engine.**
- Every chapter has a well-documented canon: opening mainlines/move-orders, named traps (Legal's, Fried
  Liver, Greek Gift), standard tactical motifs, and textbook endgame technique. ANCHOR on that canon (your
  own chess knowledge of it) and check the content against it. For a specific line, named trap, or
  theoretical evaluation you're unsure of, do a quick **WebSearch/WebFetch** to confirm against an
  authoritative source — that's faster and more reliable than an engine eval for "is this how X is taught."
- Use the bundled engine `resources/engine/mac/stockfish` ONLY to settle a genuine remaining doubt about one
  specific position (e.g. "is this sacrifice actually sound here?") — NOT to scan every position. Engine time
  is the slowest thing you can do; spend it sparingly.
- Concretely, confirm:
- A "pin" must be a REAL pin — no piece blocking the line between the pinned piece and the king/target.
- A "double check" must give TWO checks at once.
- A SACRIFICE must actually be SOUND — the defender has no refutation. Check the obvious defenses
  (recapture-the-attacker like ...Bxg5, the cool defensive ...Nf6, declining, etc.), not just one losing reply.
- A guided/test solution must be the UNIQUE intended answer (or list ALL equally-good moves in solutionUci) —
  never reject a move that is just as good; never accept a "mate in one" that isn't mate or has 6 solutions.
- Every `judge` verdict must be objectively correct (sign of the engine eval before/after the move).
Teaching a false pin, fake double-check, unsound sac, or wrong "only move" is a BLOCKER that fails audit.

## Use the shared validator — do not reinvent it
```
node scripts/validate-chapter.mjs resources/curriculum/chapters/<your-file>.json
```
It checks (via chessops, the app's own lib, + the real puzzle DB): every FEN legal; every guided/play
alternative + authored-board + model move legal; judge structural soundness; mc answerIndex range; and that
every DB-query puzzle pool has ≥ count puzzles. Loop: **author → run it → fix every ✗ → re-run → until CLEAN.**
(It does NOT judge whether a verdict/mc answer is *correct* — that's on you; reason it out.)

## Reference exemplars (match this bar)
`resources/curriculum/chapters/ch01-board-and-pieces.json`, `ch02-special-moves.json`, `ch03-check-mate-stalemate.json`.

## Schema gotchas that bite (from real bugs)
- **`solutionUci` (guided steps AND test `play` questions) = a set of ACCEPTABLE ALTERNATIVE single moves**
  (the renderer accepts any one), **NOT a move sequence.** e.g. four legal king escapes, or "lead with either
  pawn." Each must be individually legal in the position.
- **`judge` test questions:** `fen` is the position **AFTER** the move; `lastMoveUci` is that move (the
  renderer **highlights** it, does not replay it). So in `fen` the from-square is empty and the to-square is
  occupied. You must independently confirm the stated `verdict` (`correct`/`blunder`) is actually right.
- **Thin DB pools:** the puzzle DB floor is mate-dominated; clean one-move "grab" puzzles barely exist below
  ~800. Where a real pool is absent, use `PuzzleQuery.boards` (AuthoredBoard[]: `{id, fen, moves}` where
  `moves[0]` is an auto-played opponent lead-in and `moves[1..]` is the learner's solution). Otherwise use a
  DB query (`themes` OR-set + `ratingLo`/`ratingHi` + `count`); the validator confirms the pool size.
- **Model segments** (`line: {uci, coach?}[]`) play as a real sequence from `seg.fen` (or the start position).
- **Never put Elo numbers in user-facing text.** Coach = **Viktor** (exacting old-school master; terse; the
  WHY behind every move). chess.com-Lessons look; chapter identity is its NAME.
- **`band` = zero-padded chapter number** (e.g. "07"); `order` = chapter number (controls index sort).

## Output
Write the complete chapter to `resources/curriculum/chapters/<id>.json` (schema = SchoolChapter in
`src/shared/types.ts`). 3–6 lessons (more at higher Elo), each with warm-up → teach → guided practice →
cool-down where it fits; a chapter `test` of 10–15 questions (2–4 `mc` key-idea + the rest `play`/`judge`).
Conform to `docs/SCHOOL-SPEC.md` and this chapter's plan/focus in `docs/school-curriculum.md`.
