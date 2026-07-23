# Documentation guide — how docs are organized (read this before adding or editing any doc)

**Purpose.** Multiple chats/agents work this repo in parallel. This guide makes the project's
written record **congruent across chats**: every doc has exactly one home, every chat files new
docs the same way, and nobody has to guess where something lives. If you are an agent or a person
about to create or change a `.md`, follow this file.

The project docs live under `docs/` in three folders by **lifecycle role**:

| Folder | Holds | The question it answers |
|---|---|---|
| `docs/building/` | Specs, params, plans, kickoffs, roadmaps, architecture, design, curricula, research inputs | *What are we building, and how?* |
| `docs/reviewing/` | Assessments, audits, adversarial-review reports, code-review findings, viability studies | *Is it correct / sound / worth doing?* |
| `docs/current-state/` | Living status logs, build logs, shipped-product records | *Where do things actually stand right now?* |

The distinction is **role, not topic.** The account system has a spec (building), its review
reports (reviewing), and its status entry (current-state) — three docs, three folders. Sort by what
the doc is *for*, never by which feature it mentions.

---

## Where each existing doc lives (authoritative mapping)

**`docs/building/`**
`ACCOUNTS-SPEC.md` · `ACCOUNTS-PARAMS.md` · `A3-KICKOFF.md` · `SCHOOL-SPEC.md` ·
`school-curriculum.md` · `GAMES-PLATFORM-SPEC.md` · `MP-V3-SPEC.md` · `WEB-PORT-SPEC.md` ·
`WEB-DEPLOY.md` · `ROADMAP.md` · `architecture.md` · `ui-ux.md` · `content-coaching.md` ·
`feature-addendum.md` · `foundation-features.md` · `research-findings.md` · `DATASETS.md` ·
`AUTHOR-AGENT.md`

**`docs/reviewing/`**
`VIABILITY.md`
*(mostly a home for future output — see "review reports" below)*

**`docs/current-state/`**
`STATUS.md` · `school-build-log.md` · `CREDITS.md`

---

## Creating a new doc

1. **Pick the folder by role** using the table above. If a doc genuinely spans two roles, split it:
   the durable spec goes in `building/`, its findings in `reviewing/`, its status in
   `current-state/`. Do not duplicate the same content across folders.
2. **Name it** in the style already present in its folder: SHOUTING-KEBAB for specs/plans
   (`ACCOUNTS-SPEC.md`), lower-kebab for logs/inputs (`school-build-log.md`). One topic per file.
3. **Header.** Start with a one-line statement of what the doc is and its status, e.g.
   `# Ratings fold spec — A4, binding. Status: draft (2026-07-19).` Use absolute dates, never
   "today"/"last week".
4. **Cross-link** related docs by relative path (`../building/ACCOUNTS-SPEC.md`) so a move is
   greppable. Link, don't copy.
5. **Review reports** (the output of an adversarial-review / code-review / audit round) go in
   `reviewing/` as `REVIEW-<area>-<date>.md` (e.g. `REVIEW-accounts-a3-2026-07-19.md`): what was
   attacked, findings + verdicts, what was fixed, residual accepted compromises. This is where the
   review work that used to live only in transcripts becomes a durable, cross-chat record.

## Updating an existing doc

- **Edit in place** — do not fork a "v2". The file is the single source of truth for its topic.
- `current-state/STATUS.md` is **append-newest-at-the-bottom**, one `## Phase … (date)` section per
  milestone. Never rewrite history; add a new section.
- When a doc's **role changes** (e.g. a build plan becomes purely historical), move the *file*
  between folders and update this guide's mapping table in the same change. Moving is cheap; a
  mis-filed doc is the confusion this system exists to prevent.
- If two docs disagree, the **binding spec wins** (specs say "binding" / "authoritative" in their
  header); fix the other doc rather than leaving the contradiction.
- When you change where a doc lives, grep the repo for its old path and fix references you own.
  **Do not edit files another chat is actively working on** to fix a stale reference — note it here
  instead (see below).

## Tracking contradictions between docs

Each folder has a `CONTRADICTIONS.md` listing doc-vs-doc conflicts that involve one of its files
(stable ids `C1`, `C2`, …; cross-folder conflicts are cross-listed, and each entry's **Folders**
line says where). It records the conflict, not a fix — the docs stay as-is until adjudicated.
**When you resolve a conflict** (edit the docs so they agree), delete its entry from every folder's
`CONTRADICTIONS.md` that lists that id. New conflict spotted → add it in the same format. An empty
`CONTRADICTIONS.md` should hold only its header.

## Deliberately NOT in this system (leave in place)

These are load-bearing by location; moving them breaks the app, packaging, or the harness:

- `CLAUDE.md`, `README.md`, `LICENSE`, `THIRD-PARTY-NOTICES.md` — repo-root conventions / harness.
- `resources/manuals/*.md` — **runtime-loaded** by the app (`import.meta.glob`, ManualPane.tsx).
- `resources/**/LICENSE.txt`, `ATTRIBUTION*`, `SOURCES.txt`, `resources/assets/sound/README.md`,
  `src/renderer/src/assets/sounds/ATTRIBUTION.md` — legal/attribution files that must sit next to
  their assets.

## Old → new paths (for stale references)

The spec/design docs moved from `docs/` into `docs/building/` (and `STATUS.md`/`CREDITS.md` into
`docs/current-state/`). Code comments under `src/renderer/**` that still say `docs/ACCOUNTS-SPEC.md`,
`docs/GAMES-PLATFORM-SPEC.md`, `docs/CREDITS.md`, `docs/ui-ux.md`, `docs/content-coaching.md` now
resolve to `docs/building/<same-file>` (or `docs/current-state/CREDITS.md`). They were left untouched
to avoid colliding with in-flight renderer work; update them opportunistically when you edit that code.
