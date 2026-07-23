# Open contradictions — `current-state/` docs

Doc-vs-doc conflicts that involve at least one file in this folder (`STATUS.md`,
`school-build-log.md`, `CREDITS.md`), found by the 2026-07-19 cross-doc scan. **These are UNRESOLVED
and awaiting adjudication — the docs have NOT been changed.** IDs match `building/CONTRADICTIONS.md`;
each conflict below is cross-listed there too (its **Folders** line says where).

**When a contradiction is resolved** (the docs are edited so they agree): delete its entry from this
file *and* from every other folder's `CONTRADICTIONS.md` that lists the same `Cn`. When no entries
remain, this file should contain only this header.

Severity: **BLOCKING** · **NOTABLE** · **MINOR**. "Evidence" = what shipped code/README indicate —
not a ruling.

---

## C3 — [NOTABLE] School authoring effort: MAX vs HIGH · Folders: building, current-state
- **A** `building/SCHOOL-SPEC.md` §7/§0 + `CLAUDE.md`: "Opus 4.8 at MAX reasoning effort" (non-negotiable).
- **B** `current-state/school-build-log.md`: "LEAN STANDARD GOING FORWARD (ch9-40): opus high (not max)" — "User chose".
- **Evidence:** Build log records a user-approved lean standard for 31 of 40 chapters; spec never amended.

## C4 — [NOTABLE] Spaced-repetition scheduler: FSRS-6 vs SM-2-lite · Folders: building, current-state
- **A** `building/content-coaching.md` §4.1: "FSRS-6 (chosen over SM-2)"; `building/ui-ux.md` + `current-state/STATUS.md` also say FSRS-6.
- **B** `current-state/school-build-log.md`: "SM-2-lite … NOT full FSRS".
- **Evidence:** Shipped code `src/main/rating/fsrs.ts` is SM-2-lite; `ts-fsrs` in package.json but imported nowhere. STATUS's FSRS-6 claim doesn't match code.

## C5 — [NOTABLE] Accounts argon2id salt: username vs sha256(username) · Folders: building, current-state
- **A** `building/ACCOUNTS-SPEC.md` L35 (declared "authoritative, wins any disagreement"): "salt = username".
- **B** `building/ACCOUNTS-PARAMS.md` L23 [FROZEN-AT-GENESIS]: "salt = sha256(utf8(foldedUsername))".
- **Evidence:** `current-state/STATUS.md` confirms shipped A1 uses sha256(NFKC-casefolded username); the frozen implementation can never match the spec's literal text.

## C10 — [MINOR] Maia v0 placement: FOUNDATION vs NEXT · Folders: building, current-state
- **A** `building/feature-addendum.md` + `building/ui-ux.md`: "Maia … FOUNDATION (v0)".
- **B** `building/foundation-features.md` + `current-state/STATUS.md`: "Maia/lc0 demoted to NEXT".
- **Evidence:** Largely superseded — Maia later shipped as an optional games-platform dataset. Reconcile wording.
