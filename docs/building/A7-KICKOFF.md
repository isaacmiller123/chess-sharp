# A7 kickoff — commit gate + the network integration pass

Written 2026-07-22 at A6 close. Owner directives in force: **(1) an honest player is NEVER
banned** (§0 paramount; the ban path anchors ONLY on the 5σ conviction — A5-21); **(2) every
agent on accounts work runs on Fable (`claude-fable-5`)** — pin it, then post-hoc audit every
fleet (grep agent transcripts for `claude-opus-4-8`; find-stage bounces get recorded, verify/fix
stages must be re-run if off-policy).

**Repo gotcha:** the git repo is `~/chess/chess-sharp` (branch `web-port`), NOT `~/chess`.
Node/npm live at `/opt/homebrew/bin` — prepend to PATH.

## STATE AT KICKOFF (verify before acting — three sessions wrote this tree)

- A1–A3 committed. **A4 FULLY DONE (owner-confirmed 2026-07-22**; witness-eligibility fixes +
  fold-golden re-freeze landed — test-accounts-ratings 340 / test-web-accounts 167 verified
  green post-landing). A5 done + adjudicated. A6 built, reviewed (single round, 15/15 fixed),
  CALLED. See docs/current-state/STATUS.md tail + docs/reviewing/REVIEW-accounts-a5-2026-07-21.md
  and REVIEW-accounts-a6-2026-07-22.md (their Residual sections are the authoritative task list).
- EVERYTHING from A4 onward is UNCOMMITTED in the working tree. No other lane is known to be
  active at kickoff — still check mtimes before assuming a quiet tree.

## STEP 0 — the commit gate (do this FIRST)

1. Run the full wall: every `scripts/test-*.mjs` registered in package.json (skip engine-heavy
   only if the run environment lacks the engine: test-judge-node, test-judge-fit,
   operator-smoke, non-CI test-judge-calibration) + `npm run typecheck` (node/web/server) +
   `npm run build` + `build:web` + `build:server`.
2. All green ⇒ COMMIT the accumulated A4+A5+A6 work as a checkpoint (a few logical commits is
   fine: A4 fixes / A5 anticheat + adjudication / A6 social + review round). Weeks of
   uncommitted work in a multi-session tree is the project's biggest standing risk.
3. Leave other sessions' still-in-flight files out if a lane is visibly active (check mtimes).

## A7 — MAKE THE SOCIAL LAYER AND VERDICT PLUMBING ACTUALLY SYNC (the last build chunk)

Everything below exists and is suite-proven LOCALLY; nothing moves between peers yet. Build on
the A3 overlay/storage (Kademlia over WebRTC, shard duty, authenticated pointers — the
fuse-record publish pattern is the house template). Bricks, dependency-ordered:

1. **Social record transport.** Publish/fetch/merge for presence claims, friend-edge
   countersignature exchange (the add flow needs the counterparty's signature — design the
   request/consent round-trip over mailbox or live channel), and mailbox relaying.
   The relay's `meta.edgeMicro` input needs the **edge-strength fold**: derive one integer in
   [0,1e6] from (witnessed friend edge, trust T, reputation) per §10 — deterministic, from
   public signed data only; wire it into `mailboxAdmit` at the relay boundary.
   Modules: src/shared/accounts/social/* (pure parts stay pure — transport goes in overlay/
   storage-adjacent code), witness/presence.ts precedent.
2. **Verdict publishing + suppression read path.** `publishVerdictRow`/`adoptVerdictRowJudge`
   (judge/embed.ts) → real overlay publish/store-gate/merge under `tier2VerdictKey(root)` (the
   fuse-record pattern tier2.ts's header names); read-side: fetch → adopt → feed
   pairingLegal/displayState as injected evidence; run `suppressionScan` on verified chains at
   read time. NEVER weaken the A5-33 judge-anchors pin or the 5σ-conviction-only rules.
3. **Witness attestations flowing.** Thread A2 fabric attestations onto appended events in the
   web/renderer append path — this lights up, with no new UI work: §10 staleness
   (lastWitnessedActivityWts), device revocation (the honestly-disabled Revoke control in
   SecurityTab), witnessed badges in ChainViewer/devices. Also the two A5-deferred witness
   disciplines: a witness refuses to sign window w's salt grant before observing ordinal
   w·K−1 on-chain with wts = window-close witnessed time (witness/protocol.ts side, per
   REVIEW-a5 §A5-17); and the canonical-reveal publication slot (ONE authoritative SaltReveal
   per window in storage — per §A5-18 residual).
4. **Renderer un-fixturing.** As each transport lands, flip that DEV_FIXTURE surface to live
   data and remove its FixturePreviewBadge (PeopleTab, presence, mailbox, witness set,
   StoragePanel, verdicts/FairPlay, PIN committee status) — the flag and badges were built
   exactly for this flip; grep DEV_FIXTURE for the full list. No dead buttons: anything not yet
   live keeps its honest badge.
5. **Small in-reach items:** avatar upload (file → base64 → updateProfile + render);
   thread `RatedBinding.tc.incMs` from segments into `tier1Record` (the A5-15 dormant wiring);
   optional chain-level hardening if cheap (one-active-selfban admission rule, 'bad-friend'
   verify code — both documented optional in the A5/A6 review docs).

OUT OF SCOPE for A7: the J6 anticheat recalibration event (match-criterion flip A5-14,
trajectory weight A5-36, clockFit calibration, honest-corpus regeneration — a separate
calibration pass BEFORE real rated play); the manual A-final walkthrough + interim-cookie kill
(after A7 makes the walkthrough meaningful); School work (separate workstream).

## DISCIPLINE (unchanged from A1–A6)

- src/shared/** stays platform-neutral + deterministic (no node:/DOM/ambient time; integer
  math; fail-closed typed errors; additive schemas — never re-freeze an existing golden without
  a deliberate, documented reason).
- Per brick: build (Fable) → suite (esbuild-bundle style, register in package.json +
  .github/workflows/build.yml) → multi-angle Fable adversarial review → fix confirmed → gates
  green → commit. Post-hoc model audit every fleet.
- Multi-client proofs in the test-mp mock-pair style for transport bricks (the §5/§10 sentences
  as executable asserts — e.g. "a sybil flood can't evict an established root's request before
  the offline recipient next syncs" must hold END-TO-END through the relay).
- STATUS.md: append entries only; docs/DOC-GUIDE.md governs doc placement; another chat may own
  broad doc reorganization — re-read before editing shared docs.
