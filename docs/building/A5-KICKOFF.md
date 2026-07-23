# A5 kickoff — anticheat: the canonical judge. Status: building (2026-07-21).

Chess# decentralized accounts phase **A5** per `docs/building/ACCOUNTS-SPEC.md` §8 (canonical
judge), §9 (bans), §7(b) (oracle bounding / commit-reveal), §14-A5 (proof). Params:
`docs/building/ACCOUNTS-PARAMS.md` §Judge + `src/shared/accounts/judge/params.ts` (**PARAMS_A5**,
lead-authored — every value provisional-until-calibrated; calibration carries the proof
obligations). Repo `~/chess/chess-sharp`, branch `web-port`.

═══ OWNER DIRECTIVES ═══
- Every accounts agent runs on **Fable (claude-fable-5)**, pinned per agent, session effort MAX.
- Build + test-as-you-build (suites green before reporting). The owner runs the adversarial review
  separately after the phase; builders do NOT spawn review fleets.

═══ STATE (what A5 builds on) ═══
A1–A4 complete incl. the A4 29-finding review fix pass (see docs/current-state/STATUS.md, and
docs/reviewing/REVIEW-accounts-a4-2026-07-19.md for the 2 deferrals A5 picks up). Facts that matter:
- **Judge substrate (A2)**: `server/judge/{contentHash.ts, nodeEngine.ts}` — Node harness for the
  pinned WASM; JUDGE_WASM_SHA256 = a8fbc05e… (= PARAMS_A5.judgeWasmSha256); suite
  test-judge-node.mjs (17). Web: `src/web/engines/assets.ts` does context-sensitive engine
  selection for play/analysis — the judge must BYPASS it (always `stockfish-18-lite-single`).
- **Wave 0 (lead, done)**: event types `pairing` (PairingPayload — witnessed match-time record in
  BOTH chains; the self-executing abort/no-show obligation) and `selfban` (SelfBanPayload) with
  strict zod schemas; PARAMS_A5 + digest. Folds pass unknown types through (contract holds, suites
  green).
- **estElo corpus harness**: scripts/gen-elo-corpus.mjs + fit-elo-model.mjs + test-est-elo.mjs
  (shipped fit is depth-12 MultiPV-2 — does NOT transfer to judge configs; refit obligation).
- **Trust**: mm/trust.ts is body-only w/ read-time trustEvidenceOf; forensic terms enter at A5 and
  weights renormalize (params [A5-CALIBRATED]; the lead adds the weight rows on request — STOP and
  ask, never edit ratings/params.ts yourself).
- a4-v1 fold has the reserved `bans: {}` shape. NOTHING IS SHIPPED: evolving a4-v1 in place and
  re-freezing goldens is the correct move (same pre-ship practice as A1's pwNorm).

═══ BRICKS (dependency order) ═══
**J1 — judge core (wave 1).** `src/shared/accounts/judge/` (platform-neutral core): the judged-
game protocol — per-position fixed-node analysis (`go nodes N`, never depth/time), fixed MultiPV,
Hash=hashMb, `ucinewgame`+TT clear per judged game; canonical `JudgeOutput` schema (per ply:
multipv [{moveUci, scoreCpOrMate}]; integers only, mate encoded distinctly) + canonicalHash digest
— the unit of cross-platform verdict parity. Engine ADAPTERS behind one interface: node (wrap
server/judge/nodeEngine) + web worker (new src/web/engines/judge.ts, hash-verified load, bypasses
assets.ts). Determinism gate: extend test-judge-node — replay-after-arbitrary-prior-use ⇒
bit-identical JudgeOutput digest; same digest across two fresh engine instances. Engine-dependent
suites stay local-only if CI lacks the binary (follow test-judge-node's existing gating).
**J5 — pairing records + obligation (wave 1, parallel).** The A4-12 machinery: builders in
ratings/conduct.ts (makePairingPayload; both-chains anchoring contract), witnessCore gate (a
witness serves a rated game only when both players' pairing anchors are countersigned — 2c poison
pattern), reputation fold rules: a 'pairing' unsettled by a later bound segment/conduct event for
the same game (windowed, like pend) counts as abandonment-class misconduct; settled pairings are
neutral. Chains lacking a pairing the opponent's chain carries = cross-chain evidence (document;
enforcement parity with segments). RepState/pair-map growth stays O(window). Suites: extend
test-accounts-reputation + test-mp-v6 (witness gate). Re-freeze ratings-suite fold goldens +
accounts-fixture a4StateHash if RepState shape changes (permitted, report).
**J2 — Tier-1 signals (wave 2).** Pure functions over (transcript, clocks, JudgeOutput): ACPL vs
estimated strength; engine-match rate vs the ±scoreEquivCp MultiPV equivalence window (never
exact-move); clock forensics — think-time vs position complexity re-derived from the judge's OWN
MultiPV output (port the shipped complexityMultiplier fold semantics; never play-time probes);
strength trajectory. Output: integer micro signals + a per-game Tier1Record (canonical). Forensic
trust terms: propose the renormalized weight set to the lead (STOP for params). Suite with golden
JudgeOutput fixtures (recorded from J1's runner, frozen — no live engine in the default suite run).
**J3 — estElo refit (wave 2, compute job).** Re-run the corpus harness at (t1Nodes, t1MultiPv);
produce judge-config anchors consumed ONLY by the judge path (analysis/play keeps its depth-12
fit). Report MAE vs the shipped fit's 275/325 baseline.
**J4 — Tier-2 + bans (wave 3).** Deterministic escalation trigger (pure fn of chain: trailing-K
Tier-1 aggregate z ≥ zEscalateMicro — every compliant client provably knows when the obligation
fires); Regan-style accumulation over reganK-game windows, conviction at zThresholdMicro;
commit-reveal window salt via T_lease threshold signature (A2 infra) per saltScheme — unpredictable
before, recomputable after; Tier2 verdict records (signed, reproducible, published under the
accused's key via A3 pointers/shards); receipts (re-run exact judge → identical verdict bits);
self-ban: on trigger, compliant client appends 'selfban' BEFORE any further witnessed-lane event —
absence after the deadline = provable suppression (permanent distrust); fold: populate a4-v1
`bans` from selfban events (+ suppression detection), re-freeze goldens; pairingLegal + display
honor active bans (banned ladder ⇒ illegal / 'banned' surface state).
**J6 — calibration + THE PROOF (wave 4).** Seeded cheater bots (full-engine, half-engine,
threshold-ε metered vs the trigger frontier) built ON the judge engine; honest holdout from the
corpus + weak-model games. Prove: cheaters convicted within one K-window; honest holdout zero
flags; the empty-margin obligation (threshold-ε play yields negligible expected rating gain —
quantify); verdict-bit parity desktop-node vs browser (extend the playwright gate with a small
fixed judged-position set). This brick re-pins PARAMS_A5 values from measurement (via the lead).

═══ CONVENTIONS ═══
As A4 (PATH, platform-neutral shared tree, cjson/integers-only, fail-closed verifiers, esbuild
suite pattern, no package.json/workflow/docs edits by builders — report suite names; lead-owned:
params files, types.ts, events.ts). Engine-heavy work must NEVER run inside default CI suites —
gate like test-judge-node. Desktop 100% intact every wave.

═══ REPORT-BACK ═══
Files · suites + counts · gates · design decisions (esp. any [A5-CALIBRATED] value you measured) ·
params rows you need from the lead · deferrals + why.
