# Claude Code skills research — external skills/plugins worth adopting for Chess# development. Status: research input, verified 2026-07-21.

**What this is.** A multi-agent research pass (64+ candidates surfaced across official Anthropic
sources, community collections, and stack/domain/process-specific searches; every recommendation
below was independently verified by fetching the actual repo — existence, SKILL.md/plugin format,
stars, recency, license). Purpose: give any Claude Code session working this repo a vetted menu of
skills for building, review, organization, and future expansion. Related: [DOC-GUIDE](../DOC-GUIDE.md),
[ROADMAP](ROADMAP.md), [architecture](architecture.md).

**Install patterns.**
- Official marketplace plugins: `/plugin marketplace add anthropics/claude-plugins-official` once,
  then `/plugin install <name>@claude-plugins-official`.
- Third-party marketplaces: `/plugin marketplace add <org>/<repo>` then `/plugin install <plugin>@<marketplace>`.
- Bare skills (no plugin packaging): clone and copy the skill dir into `.claude/skills/` in this repo.

---

## Tier 1 — highest leverage, install first (all verified real + maintained)

| Skill / plugin | Source | Why for Chess# |
|---|---|---|
| **superpowers** (full collection) | [obra/superpowers](https://github.com/obra/superpowers) — 258k★, MIT, pushed 2026-07-20 | Encodes the exact disciplines this project already improvises: `writing-plans`/`executing-plans` (the A-phase brick pattern), `test-driven-development` (fits the exit(1) test-*.mjs wall), `subagent-driven-development` (builder/reviewer separation), `systematic-debugging`, `verification-before-completion`, `brainstorming` (future-feature ideation). Install: `/plugin install superpowers@claude-plugins-official`. **Caveat:** keep model selection under project control — accounts builders/reviewers are pinned to Fable, never Opus. |
| **claude-code-setup** | [anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/claude-code-setup) — Apache-2.0 | One-shot read-only audit of this repo that proposes project-specific hooks/skills/subagents (would map the 50+ test-*.mjs suites, the three-target build, CI). Good bootstrap before hand-rolling the custom skills in §Custom below. |
| **hookify** | [official plugins](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/hookify) | Turns recurring session rules into *enforced* hooks instead of memory notes: repo is `~/chess/chess-sharp` not `~/chess`; prepend `/opt/homebrew/bin` to PATH; run the matching suite after touching engine/accounts code; DOC-GUIDE bucket rules on new .md files. |
| **pr-review-toolkit** | [official plugins](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/pr-review-toolkit) — MIT | 6 per-concern reviewer subagents (code-reviewer, silent-failure-hunter, type-design-analyzer, pr-test-analyzer…) that slot into the adversarial-review workflow used on accounts phases. Same Fable-model caveat. |
| **typescript-lsp** | [official plugins](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/typescript-lsp) | LSP-backed navigation + edit-time type errors across the three tsconfig targets (node/web/server) — catches cross-target breakage before the wall runs. |
| **security-guidance** | [official plugins](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/security-guidance) — v2.0.6, 2026-06 | Always-on hook (~25 regex patterns + guidance) warning during every edit — directly relevant to the remaining accounts phases (A5 anticheat, A6 social/UI) touching keys, witness fabric, WebRTC. |

## Tier 2 — security & correctness for the accounts/crypto layer (Trail of Bits)

All in [trailofbits/skills](https://github.com/trailofbits/skills) — 6.2k★, CC-BY-SA-4.0, actively
maintained (pushed 2026-07-20). `/plugin marketplace add trailofbits/skills` then install per plugin.

- **property-based-testing** — 10-type property catalog + anti-patterns. Perfect fit for invariant-rich
  code here: RS 12-of-40 round-trips, Kademlia routing properties, move-legality across 20+ games;
  properties can live inside the existing test-*.mjs harness.
- **differential-review** — auditor-grade diff-review methodology (methodology/adversarial/patterns
  guides). Drop-in upgrade for the multi-angle review rounds on A5/A6.
- **constant-time-analysis** — compiles code and inspects emitted output for secret-dependent
  branches/variable-time ops; supports JavaScript. Rare, high-value check for ed25519/noble paths.
- **insecure-defaults** — hunts permissive defaults (fallback secrets, open IPC, wide CSP,
  unauthenticated peer paths) — exactly the P2P/Electron failure modes this app carries.

## Tier 3 — UI, testing, and process

- **frontend-design** — both the [official plugin](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/frontend-design)
  and the [anthropics/skills version](https://github.com/anthropics/skills/tree/main/skills/frontend-design).
  Anti-generic-AI design methodology for the huge UI surface (school, 22 games, A6 social UI). Install one (plugin form preferred).
- **webapp-testing** — [anthropics/skills](https://github.com/anthropics/skills/tree/main/skills/webapp-testing), Apache-2.0.
  Playwright toolkit with `with_server.py` server-lifecycle management — headless smoke-tests of the
  web port (board rendering, puzzles, school flows) that the logic-level suites don't cover. web.yml
  already installs Playwright chromium, so CI is pre-wired for it.
- **playwright-skill** — [lackeyjb/playwright-skill](https://github.com/lackeyjb/playwright-skill), 2.9k★, MIT.
  Lower-level Playwright control; Playwright's Electron driver enables true E2E runs of the *packaged*
  desktop app. (Quiet since 2025-12 — fine, it's a thin stable wrapper.)
- **claude-md-management** — [official plugins](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/claude-md-management).
  `/revise-claude-md` + staleness audit; useful given how much cross-chat congruence this project
  leans on (CLAUDE.md, DOC-GUIDE, memory).
- **feature-dev** *(maybe)* — [official plugins](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/feature-dev).
  explore→architect→implement→review pipeline; overlaps with the A-phase workflow already in use,
  so adopt only if the home-grown pattern needs replacing.
- **pyright-lsp** *(maybe)* — [official plugins](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/pyright-lsp).
  Edit-time typechecking for the Python puzzle/engine pipeline scripts; only pays off when that
  pipeline is being extended.
- **wshobson/agents** *(selective)* — [wshobson/agents](https://github.com/wshobson/agents), 38.1k★, MIT, 2026-07-18.
  94-plugin marketplace; take only `tdd-workflows`, `debugging-toolkit`, `code-refactoring`,
  `comprehensive-review`. **Caveat:** its agents pin haiku/sonnet/opus per agent — override models
  (accounts work = Fable only).
- **cicd-pipeline-skill** *(maybe)* — [LambdaTest/agent-skills](https://github.com/LambdaTest/agent-skills/tree/main/cicd-pipeline-skill), 336★.
  Generic CI-authoring playbook; heavily vendor-slanted toward LambdaTest cloud. Use the
  reference/playbook.md ideas at most; skip the vendor parts.

## Rejected after verification

- **ARFxTech/claude-skills electron-development** — skip: thin/low-quality on inspection.

## Found but NOT yet independently verified (gap round; verify before relying on)

Surfaced by a completeness critic targeting three under-covered areas — Electron
hardening/distribution, WASM engine tooling, SQLite/large-dataset pipelines — plus stack extras:

- 3D/graphics: [EnzeD/r3f-skills](https://github.com/EnzeD/r3f-skills),
  [emalorenzo/three-agent-skills](https://github.com/emalorenzo/three-agent-skills),
  [Nice-Wolf-Studio/claude-skills-threejs-ecs-ts](https://github.com/Nice-Wolf-Studio/claude-skills-threejs-ecs-ts)
- WASM: [derushio/wasm-skills](https://github.com/derushio/wasm-skills),
  [mohitmishra786/low-level-dev-skills](https://github.com/mohitmishra786/low-level-dev-skills) (wasm-emscripten)
- SQLite/data: [0xDarkMatter/claude-mods sqlite-ops](https://github.com/0xDarkMatter/claude-mods/tree/main/skills/sqlite-ops),
  [duckdb/duckdb-skills](https://github.com/duckdb/duckdb-skills),
  [wshobson/agents data-engineering](https://github.com/wshobson/agents/tree/main/plugins/data-engineering)
- Electron hardening/release: [agents-inc/skills desktop-security-electron](https://github.com/agents-inc/skills/blob/main/src/skills/desktop-security-electron),
  [pedronauck/skills electron-release](https://github.com/pedronauck/skills/blob/main/skills/community/electron-release),
  [nguyencongnamit/skills-library electron-security](https://github.com/nguyencongnamit/skills-library/blob/main/skills/electron-security)
- Domain curiosities: [robominds/stockfish-skill](https://github.com/robominds/stockfish-skill) (local UCI analysis),
  Apache Cassandra's [tla-plus skill](https://github.com/apache/cassandra/tree/trunk/.claude/skills/tla-plus)
  (formal-spec authoring — interesting for the witness fabric / checkpoint protocol),
  [dweinstein/mobile-security-skills crypto-review](https://github.com/dweinstein/mobile-security-skills/tree/main/skills/crypto-review)

## Custom project skills worth authoring (no external equivalent exists)

Repo analysis surfaced recurring workflows that external skills can't know; these belong in
`.claude/skills/` in this repo (hookify can enforce the hard rules among them):

1. **run-the-wall** — PATH prepend + typecheck×3 + all three builds + every `scripts/test-*.mjs`
   with a per-suite pass/fail summary (today manual; the suite list drifts across three places).
2. **add-test-suite** — scaffold the esbuild-bundle+check() harness pattern and wire all three
   registration points (package.json alias, build.yml loop, web.yml glob) consistently.
3. **cut-release** — version bump → wall green → tag v* → monitor build.yml matrix → verify
   release assets include latest*.yml/blockmaps for the electron-updater feed.
4. **dataset-setup** — the setup:engines/setup:puzzles/build:puzzles chain, imported-vs-bundled
   resolution, and the patch-ffish-csp postinstall gotcha (`--ignore-scripts` forgets it).
5. **web-desktop-parity** — desktop-only changes silently break the web port; codify
   typecheck:web + build:web + build:server + web suites before any src/main or renderer merge.
6. **file-a-doc** — enforce DOC-GUIDE bucket rules + STATUS.md append-only convention.
7. **school-chapter-authoring** — encode the SCHOOL-SPEC binding workflow (per-chapter agents,
   play-test, cross-check vs curriculum, validate-chapter.mjs).
8. **accounts-phase-workflow** — the A-phase pattern: kickoff doc → Fable-only build →
   multi-angle adversarial review → gates → STATUS.md entry → review report in docs/reviewing/.
