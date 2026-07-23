# Open contradictions — `building/` docs

Doc-vs-doc conflicts that involve at least one file in this folder, found by the 2026-07-19
cross-doc scan. **These are UNRESOLVED and awaiting adjudication — the docs have NOT been changed.**
Each has a stable ID (C1–C12). A conflict that spans folders is cross-listed in the other folder's
`CONTRADICTIONS.md` too; its **Folders** line says where.

**When a contradiction is resolved** (the docs are edited so they agree): delete its entry from this
file *and* from every other folder's `CONTRADICTIONS.md` that lists the same `Cn`. When no entries
remain, this file should contain only this header.

Severity: **BLOCKING** (an auto-loaded/binding doc would mislead a build) · **NOTABLE** (real
conflict, one side must be chosen) · **MINOR** (superseded/stale wording). "Evidence" = what shipped
code/README indicate, to speed adjudication — not a ruling.

---

## C1 — [BLOCKING] School chapter count: 20 vs 40 · Folders: building, current-state
- **A** `CLAUDE.md` (auto-loaded every session): "Scale: … ~20 chapters (100-Elo bands), 3–6 lessons each".
- **B** `building/SCHOOL-SPEC.md` §2.2: "Count is 40, logarithmically weighted (274 lessons)".
- **Evidence:** `README.md` ("40 chapters") and `current-state/school-build-log.md` ("ALL 40 CHAPTERS COMPLETE") = 40 shipped; CLAUDE.md summary appears stale.

## C2 — [NOTABLE] SCHOOL-SPEC internal chapter count: 40 vs 20 · Folders: building
- **A** `building/SCHOOL-SPEC.md` §2.2: "Count is 40".
- **B** `building/SCHOOL-SPEC.md` §6/§7/§8: "the 20 chapters" / "Repeat through all ~20" / "assignment of openings to the 20 chapters".
- **Evidence:** §2.2 was updated to 40 but §6–8 were not; `building/school-curriculum.md` fixes 40 (8 batches of 5). Same-file inconsistency.

## C3 — [NOTABLE] School authoring effort: MAX vs HIGH · Folders: building, current-state
- **A** `building/SCHOOL-SPEC.md` §7/§0 + `CLAUDE.md`: "Opus 4.8 at MAX reasoning effort" (non-negotiable).
- **B** `current-state/school-build-log.md`: "LEAN STANDARD GOING FORWARD (ch9-40): opus high (not max)" — "User chose".
- **Evidence:** Build log records a user-approved lean standard for 31 of 40 chapters; spec never amended.

## C4 — [NOTABLE] Spaced-repetition scheduler: FSRS-6 vs SM-2-lite · Folders: building, current-state
- **A** `building/content-coaching.md` §4.1: "Spaced repetition — FSRS-6 (chosen over SM-2)"; `building/ui-ux.md` + `current-state/STATUS.md` also say FSRS-6.
- **B** `current-state/school-build-log.md`: "SM-2-lite … NOT full FSRS".
- **Evidence:** Shipped code `src/main/rating/fsrs.ts` is SM-2-lite; `ts-fsrs` is in package.json but imported nowhere. STATUS's FSRS-6 claim doesn't match code.

## C5 — [NOTABLE] Accounts argon2id salt: username vs sha256(username) · Folders: building, current-state
- **A** `building/ACCOUNTS-SPEC.md` L35 (declared "authoritative, wins any disagreement"): "salt = username".
- **B** `building/ACCOUNTS-PARAMS.md` L23 [FROZEN-AT-GENESIS]: "salt = sha256(utf8(foldedUsername))" (note: raw username < 8 bytes, hash-wasm rejects it).
- **Evidence:** `current-state/STATUS.md` confirms shipped A1 uses sha256(NFKC-casefolded username). The frozen implementation can never match the spec's literal text; different keys.

## C6 — [NOTABLE] Maia weights license: MIT vs GPL-3.0 · Folders: building
- **A** `README.md`: "KataGo / Maia nets — MIT".
- **B** `building/DATASETS.md` + `building/feature-addendum.md`: Maia weights "GPL-3.0" (conservative; upstream leaves weights license unstated).
- **Evidence:** Compliance-facing claim; cannot be both. Provenance manifest is the conservative source of record.

## C7 — [NOTABLE] Maia net count: nine (100-Elo steps) vs five (200-Elo steps) · Folders: building
- **A** `building/feature-addendum.md` + `building/ui-ux.md`: "nine nets, 1100–1900, 100-Elo steps".
- **B** `building/DATASETS.md`: "five (1100/1300/1500/1700/1900)".
- **Evidence:** Code `src/main/datasets/maia.ts` ships exactly five; addendum + UI slider still promise nine.

## C8 — [NOTABLE] Maia/lc0 search budget: `go nodes 8` vs `nodes=1` · Folders: building
- **A** `building/feature-addendum.md` + `building/architecture.md` (incl. the maia:play IPC contract): "go nodes 8".
- **B** `building/GAMES-PLATFORM-SPEC.md`: "nodes=1" / "Play at nodes=1".
- **Evidence:** Two binding specs mandate different values for the same engine call; addendum explicitly rejects nodes 1.

## C9 — [NOTABLE] lc0 version: 0.31.x vs 0.32.1 · Folders: building
- **A** `building/architecture.md` locked-version table: "lc0 0.31.x".
- **B** `building/DATASETS.md` (sha256-verified binaries) + `building/ROADMAP.md`: "lc0 0.32.1".
- **Evidence:** Shipped/checksum-verified binary is 0.32.1; architecture table is stale.

## C10 — [MINOR] Maia v0 placement: FOUNDATION vs NEXT · Folders: building, current-state
- **A** `building/feature-addendum.md` + `building/ui-ux.md`: "Maia … FOUNDATION (v0)".
- **B** `building/foundation-features.md` + `current-state/STATUS.md`: "Maia/lc0 demoted to NEXT".
- **Evidence:** Largely superseded — Maia later shipped as an optional games-platform dataset. Reconcile wording.

## C11 — [MINOR] 2D chess board library: chessground vs chessgroundx · Folders: building
- **A** `building/ui-ux.md`: "Board = chessground".
- **B** `building/GAMES-PLATFORM-SPEC.md`: "chessgroundx (replaces chessground app-wide)".
- **Evidence:** Newer games-platform spec supersedes ui-ux; README lists both.

## C12 — [MINOR] KataGo net sizes: spec vs checksum-verified manifest · Folders: building
- **A** `building/GAMES-PLATFORM-SPEC.md`: "b6c96 4.7MB, b10c128 13.8MB".
- **B** `building/DATASETS.md` (sha256, byte-exact): "3.7MB, 11.1MB".
- **Evidence:** Manifest figures are checksum-verified; 25–27% gap is beyond rounding.
