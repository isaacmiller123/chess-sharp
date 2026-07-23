# A4 kickoff — ratings, reputation, trust, matchmaking. Status: building (2026-07-20).

Continue the Chess# decentralized accounts build in `~/chess/chess-sharp` (branch `web-port`).
This is **A4** per `docs/building/ACCOUNTS-SPEC.md` v1.1 §14-A4 (spec §6, §6b, §7, plus the
A2→A3 residual witness seams). Parameters: `docs/building/ACCOUNTS-PARAMS.md` +
`src/shared/accounts/ratings/params.ts` (**PARAMS_A4** — already authored, code against it).
Phase log: `docs/current-state/STATUS.md`. The spec wins any disagreement; open doc-vs-doc
conflicts are catalogued in `docs/*/CONTRADICTIONS.md` — noted, NOT to be fixed in this phase.

═══ OWNER DIRECTIVES FOR THIS PHASE (2026-07-20) ═══
- **Model policy**: every accounts agent runs on **Fable (claude-fable-5)** — pinned per agent,
  verified after each wave.
- **BUILD-ONLY**: this phase has NO post-build adversarial-review rounds and NO /code-review pass.
  Testing code AS IT IS BUILT (each brick ships its suite, run green before reporting) is required;
  reviewing after is not permitted.

═══ STATE ═══
A1 identity/keys (033f39f) · A2 witness fabric + PIN (fecb758+42e716a) · A3 overlay/storage/wire-v6
(17b39f4+d2db3c2) — all committed, all suites green. Digests: PARAMS_V1
ZDoblqaVf5z1zL8IvmWK2sdZK29JTNWZpY38XuDBZdk · A2 oDyonXFK6JWN23sLdAqWJwaFiuxkm4eeZq7cxxdy2zc ·
A3 ACxJEbqGQj7VOdWBvaLMiYuhfDHluYo0bZ0gbu_1yNE.

**Wave 0 (lead, done, uncommitted):** event registry extended with witnessed-lane types
`conduct` / `commend` / `pin` (types.ts payload interfaces + events.ts strict zod schemas +
LANE_FOR; `zCertEvent` non-recursive cert-event schema for inline commend certs);
`SegmentPayload.kind?` + `.tc? {baseMs,incMs}` ladder binding (storage/types.ts, events.ts,
segment.ts MakeSegmentOpts passthrough); `ratings/params.ts` PARAMS_A4 + digest. Typecheck
node/web/server + all 12 accounts/mp suites green.

═══ MODULE OWNERSHIP (collision map — do not touch files another brick owns) ═══
- 1a detmath →   NEW `src/shared/accounts/ratings/detmath.ts`, NEW `scripts/test-accounts-detmath.mjs`
- 1b seams →     `src/shared/accounts/witness/**` (edits), `server/operator/**` if needed,
                 NEW `scripts/test-accounts-seams.mjs` (may also EXTEND test-accounts-{witness,pin,lease,fabric}.mjs)
- 1c conduct →   NEW `src/shared/accounts/ratings/conduct.ts`, NEW `ratings/reputation.ts`,
                 NEW `scripts/test-accounts-reputation.mjs`
- 2a ratings →   NEW `ratings/{glicko.ts,ladders.ts,fold.ts,display.ts,index.ts}`,
                 EDITS `checkpoint.ts` (pluggable fold registry) + `segment.ts` (witnessEndBytes tc
                 binding) + `src/shared/mp/witnessCore.ts` + `scripts/test-mp-v6.mjs`,
                 NEW `scripts/test-accounts-ratings.mjs`
- 2b trust/mm →  NEW `src/shared/accounts/mm/{trust.ts,pairing.ts,index.ts}`,
                 NEW `scripts/test-accounts-trust-mm.mjs`
- Wave 3 lead →  package.json, .github/workflows/build.yml, playwright browser gate, STATUS.md.
  **NO builder edits package.json / build.yml / docs — report suite names to the lead instead.**

═══ BRICK BRIEFS ═══

**1a — detmath.** `dexp(x)`, `dln(x)` (natural log), plus what Glicko needs, built ONLY from IEEE-754
basic ops (+ − × ÷ sqrt, fixed evaluation order) — these are correctly-rounded per spec and therefore
bit-identical across JS engines; `Math.exp/log/pow` are implementation-defined and BANNED in fold
code. Standard argument reduction + polynomial (document the scheme); handle the full finite range
Glicko touches (|x| ≤ ~40 for dexp; dln over (0, 1e12]); NaN/±Inf propagate deterministically.
Accuracy target: relative error ≤ 1e-12 vs Math.* over the Glicko-relevant range (assert in suite;
determinism matters more than the last ulp). Golden vectors: ≥64 fixed inputs → exact expected bit
patterns (assert via DataView float64 bits, not toString). Suite also property-tests monotonicity and
dexp(dln(x))≈x.

**1b — seams** (deferred A2→A3 witness-side hooks; seams listed in `docs/building/A3-KICKOFF.md`).
Substrate now exists: replicated chains/certs (A3 shards/overlay), chain-authoritative records.
 1. **Counter anti-spreading** (`witness/pin.ts` effectiveCount / `protocol.ts` tripFuseIfDue):
    members publish SIGNED per-member counter reports (monotonic, gen-tagged) into overlay/pointer
    space under the account key; peers pull + merge before computing effectiveCount, so the t-th-
    largest is over the CONVERGED report set, closing the ~n/(n−t+1)× spread. Byzantine rules:
    a report is only as good as its signature + monotonicity; regressions are misbehavior evidence.
 2. **WitnessDeps.verifyLease** (`protocol.ts` witnessServe): when the witness holds the subject's
    chain facts (A3 replication or overlay fetch), wire the full check — threshold tLease grants
    from the CANONICAL set (witness/eligibility.ts + distance.ts over the directory), grantor
    eligibility, epoch monotonicity vs cached head. Honest degradation unchanged when facts absent.
 3. **PIN handoff anchoring**: use the wave-0 `pin` chain event (payload {record: canonicalHash of
    the current PinRecord, gen}). Root-signed, witnessed. Handoff verifiers resolve the subject's
    chain (viewer/overlay) and require oldRecord digest === newest 'pin' anchor; provision/handoff
    appends the new anchor (gen+1). Keep the A2 pinKey-gated co-signature gate as the live fallback
    when no chain is resolvable (record which path admitted, like C-12's honest surfacing).
 4. **Device-ownership at lease grant** (`protocol.ts` grant path): before signing a lease grant,
    the grantor verifies the requesting device key is a CERTIFIED, UNREVOKED child of the root
    (certs from the replicated chain; revocation wins per §1). No chain ⇒ refuse when the fuse/
    anchor path requires it, else the A2 attribution-only behavior — never a silent blind-sign
    upgrade. Prevention now, attribution kept.
 Suite: force each closed hole in MockFabric multi-node tests (spread counter converges; forged/
 sub-threshold lease refused at attest; handoff against a stale record refused once chain-anchored;
 uncertified device refused a grant).

**1c — conduct + reputation.** Semantics + fold for wave-0's `conduct`/`commend` events
(types.ts ConductPayload/CommendPayload docs are the contract).
 - `ratings/conduct.ts`: `commendBytes({game, from, to})` canonical bytes; build/verify helpers —
   commend sig verifies under `key` with inline `certs` (zCertEvent) proving key∈opp, root-signed,
   fail-closed; conduct event builders. NO fabric code — pure data + verification.
 - `ratings/reputation.ts`: the deterministic reputation fold (§6b) per PARAMS_A4 rep weights —
   inputs: segments (by `reason`: completed / resign / timeout / abandon / disconnect), conduct
   events (abort / noshow / rematch-accept with the in-chain `prior` segment rule), commend events
   (≤1 per (opp, game), only when a segment for that game+opp is in-chain, invalid sig ⇒ ignored).
   Exports for composition into the 2a checkpoint fold (STATE SHAPE CONTRACT below):
   `repInit(): RepState` · `repStep(s: RepState, ev: SignedEvent): RepState` ·
   `repScore(s: RepState): number` (0–100 integer) · `repTier(score): 0|1|2|3`.
   RepState is a CanonicalObject of integer counters ONLY (rates derived in repScore via integer
   arithmetic — no floats in state). Score visible from game 1 (§6b — no hiding).
 Suite: weight math golden cases, rate-limit + farming rejections, byte-determinism of state.

**2a — ratings.** The §6 fold, deterministic to the bit.
 - `ratings/ladders.ts`: `timeCategory({baseMs,incMs})` in EXACT INTEGER math (estMs = baseMs +
   PARAMS_A4.tcIncWeight·incMs; thresholds tcBulletMaxEstMs/…; baseMs===0 ⇒ 'Unlimited') —
   semantics of the renderer's `timeControlCategory` without float division; `ladderId(kind, tc)` =
   `` `${kind}:${category}` ``. Unlimited ⇒ unrated (fold skips).
 - `ratings/glicko.ts`: port `src/main/rating/glicko2.ts` EXACTLY (same constants, same Illinois
   loop, RD_MIN/MAX, tau) onto detmath (`dexp`/`dln`; Math.pow(x,2)→x·x; Math.PI is an exact
   constant, fine) with micro-unit integer boundary: state in/out is {ratingMicro, rdMicro,
   volMicro} integers; internal math on doubles derived from those integers in fixed order.
   One game = one rating period (fold applies per segment).
 - `ratings/fold.ts`: the **a4-v1 ChainFold** (types.ts ChainFold). State (CanonicalObject,
   integers only): `{ f:'a4-v1', params: PARAMS_A4_DIGEST, n, byType, head?, height?, ladders:
   {[ladderId]: {r, rd, vol, n, placed}}, rep: RepState (1c), trust: TrustInputs (2b), bans: {} }`
   — `bans` is the reserved shape A5 fills (anticheat self-bans); fuse/fork bans are standalone
   records checked alongside, never in-chain. Fold inputs PINNED per §6: opponent (rating, RD) read
   ONLY from the segment's embedded `oppCkpt` a4-v1 state for that ladder (young opponent / no ckpt
   / basic-v1 ckpt ⇒ seeds 1200/350). Placement: first placementGames per ladder ride
   max(rd, placementRdFloor) as the fold input for the opponent-facing update AND the stored rd
   floor per PARAMS_A4. Segments without kind/tc, or Unlimited ⇒ skipped (conduct still folds).
 - `checkpoint.ts`: pluggable fold registry keyed by state.`f` (absent ⇒ 'basic-v1'); makeCheckpoint
   accepts a fold choice; incremental/deep verify pick the fold from the EMBEDDED state; basic-v1
   chains + all existing suites stay green.
 - `ratings/display.ts`: display-state derivation used by every surface (§6): `displayState(ladder,
   params)` → `{state:'placement', n, of:10}` | `{state:'provisional', n, of:reveal}` |
   `{state:'ranked', rating}` (reveal per category); plus the §6 surface rules as PURE functions:
   what a provisional viewer may see of an opponent (nothing rating-shaped; 'Unranked opponent
   pool'), what ranked+spectators see (quantized bracket only for provisionals).
 - **tc binding into the witness stream** (closes ladder-lying): extend `segment.ts`
   witnessEndBytes/signWitnessEnd/verifyWitnessEnd + WitnessedResultBody with optional `kind`/`tc`
   — when a segment carries kind/tc, its wstream sig MUST cover the same values (verifySegmentEvent
   enforces match); absent = legacy/unrated. Update `src/shared/mp/witnessCore.ts` to pass the
   game's kind/tc, and `scripts/test-mp-v6.mjs` accordingly. **HARD GATE: `scripts/test-mp.mjs`
   (v5) stays byte-untouched-green; test-mp-v6 updated and green.**
 Suite: golden fold vectors (fixed chains → exact micro-unit states), placement floor, pinned-input
 rule (self-asserted opponent numbers never read), skip rules, display thresholds per category,
 determinism (same chain bytes → same state bytes twice + across esbuild bundle).

**2b — trust + matchmaking.** §7 chain-shape trust + width pairing, all pure/deterministic.
 - `mm/trust.ts`: `TrustInputs` (CanonicalObject, integers) accumulated per event —
   `trustInputsInit()/trustInputsStep(s, ev)` for 2a's fold state; and `trustT(inputs, nowWts):
   micro` ∈ [0,1e6] — weights PARAMS_A4 trustW*: age (first witnessed attestation wts → now;
   diversity-bound caveat documented — needs ≥3 entanglement-distant attesters per §4, carried as
   an input flag), entanglement-weighted opponent diversity (each opponent scaled by own-trust
   proxy × entanglement-distance saturation per ACCOUNTS-PARAMS; at A4 the opponent-trust proxy is
   the oppCkpt's own cleanliness/age signals — document what stands in until A5 forensics),
   fork/checkpoint cleanliness (cadence adherence, cosig diversity, verify-cleanliness), completion
   hygiene (from 1c RepState counters). Deterministic integer math; detmath if any transcendental
   is genuinely needed (prefer none).
 - `mm/pairing.ts`: `width(T)` = widthMin + widthSpan·(1−T)² (integer Elo out); island term per
   PARAMS_A4 (cost when either T < islandGateMicro); pools: placement/provisional pair
   provisional-first, spillover uses fixed 800-wide rails (`bracketOf(rating)`), RD-discount note;
   `pairingLegal(a, b, nowWts): {legal: boolean, reason?: string}` where each side is a
   `PairView {root, ladderId, ladderState, T, displayState}` — BOTH clients recompute and verify
   (§14-A4 proof). Rating distance uses revealed-or-not rules: provisional pairing legality never
   depends on a hidden precise rating (bracket math only).
 Suite: curve/island golden values, pool legality matrix (placement×provisional×ranked), bracket
 rails, both-sides-verify property (legal(a,b) === legal(b,a)), determinism.

═══ CONVENTIONS & GATES (unchanged from A1–A3) ═══
`export PATH=/opt/homebrew/bin:$PATH` first. `src/shared/accounts/**` + `src/shared/mp/**`
platform-neutral: no `node:` imports, no DOM, no Date.now/Math.random (inject clocks/RNG), no
Math.exp/log/pow in fold code (detmath). cjson-v1 canonical bytes; integers only in signed/state
payloads (micro-units). Verifiers pure, fail-closed (typed errors, never throw on untrusted input).
Suites: esbuild-bundle on the fly with alias `{'@shared': '<repo>/src/shared'}` (copy the pattern
from `scripts/test-accounts-chain.mjs` / `scripts/lib/witness-bundle.mjs`), one-line asserts,
`exit(1)` on any fail, final line `ALL GREEN — N assertions`. Before reporting done, EVERY builder
runs: its own suite(s) + `npm run typecheck` (node/web/server) + the accounts/mp suites its files
touch — all green. Desktop 100% intact every wave.

═══ REPORT-BACK (each builder, final message) ═══
Files created/edited · suite name(s) + assertion counts · gates run + results · design decisions
made within the brief · anything deferred (with why) — raw facts, no prose padding.
