# A4 review — RESOLVED (ratings · reputation · matchmaking/trust)

## Status: all 29 findings CLOSED (Fable-verified 2026-07-22)

The original 2026-07-19 adversarial review found **29 defects** (8 critical · 12 major · 9 minor).
All 29 are now closed. **3 slices are deliberately deferred** (below) — each Fable-authored, with an
in-code rationale and a named A5/A6 hook; none is a live exploit.

### How it got here (the honest record — kept because it matters)

1. **2026-07-19** — read-only adversarial review (6 dimensions → 2 verifiers/finding → 2
   implication rounds; Fable; 123 agents; no code touched). 29 verified defects.
2. **2026-07-21 fix pass** — recorded itself as *"a 5-brick Fable fixer fleet"* that fixed *"27 of
   29."* Per the account owner **that fix pass was Opus 4.8** — off the Fable-only accounts model
   policy, and its self-assessment was an **unverified off-policy claim.**
3. **2026-07-22 Fable-5 re-verification** — 7 adversarial agents required to reproduce each attack
   against the *current* code and name a test that fails on revert. Result: only **16/29** genuinely
   closed+pinned; **12 partial, 1 open** (the Opus pass had deleted several as "fixed" that were
   not).
4. **2026-07-22 fix completion** under a **divergence-safe Fable protocol** (Fable output is
   trusted-terminal; any run that diverted to Opus was quarantined — 1 Fable verifier, else 2
   independent non-coordinating Opus-max verifiers). The 13 were closed:
   - **A4-03, 05, 14** (sybil/witness-eligibility) + **A4-10** (checkpoint freshness/gate) + **A4-21**
     (deferred, hardened) — Fable core fixer, **pure Fable** ⇒ terminal-closed.
   - **A4-17, 18, 25, 26, 27, 28, 29** (renderer) — Fable renderer fixer, **pure Fable**; the reason
     they were unpinned was that *nothing rendered a `.tsx`* — a real render-test harness
     (`scripts/test-a4-ui.mjs`, 222 asserts) now pins them.
   - **A4-01, A4-09** — 2 independent Opus-max verifiers, both clean ⇒ closed.
   - **A4-02** — both verifiers independently found the M-of-N cosigner check *"cryptographically
     real but security-void"* (cosigners unanchored to any witness roster); routed to a Fable fix,
     landed **pure Fable**. The fold now pins §6 seeds (1200/350) for every opponent so a fabricated
     oppCkpt folds byte-identically to the honest young-opponent path (ratchet dead in embedded,
     deterministic state — no A4-04 regression); `ratingEvidenceOf(chain, eligible?)` grants the
     roster-vouched pin at read time only. Confirmed by reverting and watching 16 assertions fail.

**The eligibility fixes all share one design** (established across A4-02/03/05/14): the deterministic
fold records only body-only *potential*; roster/eligibility is applied at **read time**
(`trustEvidenceOf` / `repEvidenceOf` / `ratingEvidenceOf`), never folded into checkpoint-embedded
state — because eligibility evidence is verifier-specific and folding it in would reintroduce the
A4-04 consensus split that escalates to a slashable fraud verdict against honest accounts.

Gates at closure (verified on the live tree): ratings 340 · reputation 290 · trust-mm 277 · a4-ui
222 + the full accounts/mp wall + typecheck (node/web/server) + desktop/web/server builds — all green.

---

## Deferred (3) — deliberate, in-code rationale + named hook

- **A4-02 pin *fidelity* → A5.** The ratchet (the actual defect) is closed. A roster-vouched read
  pins the opponent's embedded **floor** ladder (itself seed-pinned, un-ratchetable) rather than the
  opponent's true strength — it *under-states* established opponents, it cannot inflate. No
  deterministic A4 rule can do better (any opponent-asserted number reopens the ratchet; folding
  roster judgment in-chain splits honest verifiers). **A5 hook (in `fold.ts` header):** A5's pairing
  record has the roster-aware serving witness attest the opponent's vouched rating at match time
  (witness-signed ⇒ chain-authoritative); `ratingEvidenceOf` then upgrades the vouched pin from the
  floor to that attested number.
- **A4-10 stale a4-v1 checkpoint → A5.** A *stale* (old-numbers) a4-v1 oppCkpt still passes, because
  every value it could be freshness-compared against is subject-asserted, not witness-signed — a
  self-contained rule would be forgeable-by-construction. **A5 hook:** the serving witness attests
  the opponent's current head height; `verifyEmbeddedOppCkpt` bounds `oppCkpt.through` against it.
- **A4-21 commend revocation → A6.** A stolen-then-revoked certified child key of a commender still
  mints valid commends; consulting the commender's chain in-fold would break §5/§6 bounded
  verification or checkpoint determinism (the A4-04 class). **A6 hook:** the viewer discounts
  commends whose signing key is revoked in the commender's chain at read time. Bounded: needs a
  stolen certified child key, yields only 1/20-floor merit unless the pair was established, §6b ratio
  cap still applies.
