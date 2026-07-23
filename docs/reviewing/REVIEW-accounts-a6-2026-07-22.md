# A6 review — single search+verify+fix round (owner-capped) — CLOSED

**Status:** CLOSED 2026-07-22. Owner directive: one round, then A6 is called. All 15 confirmed
findings FIXED same day; final gates green. **Completeness pre-check:** every §10 social-surface
item and §14-A6 deliverable verified present + suite-covered before the round (declared
boundaries: manual walkthrough; overlay transport sync; witness signing-time discipline;
canonical-reveal slot; avatar upload; interim-cookie scope on ipc/review).

**Method.** Fable-pinned Workflow (wf_905a1c4a-629; interrupted once by an app restart and
resumed — the interrupted segment's partial results were discarded, all finders re-ran live):
6 find angles (fresh-eyes completeness critic + 5 adversarial: friends/profile, presence/mailbox,
embed seams, renderer/web wiring, A-final flag) → per finding an INDEPENDENT technical refuter
(default-refuted, must reproduce) + relevance judge. Funnel: **20 candidates → 15 confirmed
(1 critical / 7 major / 7 minor), 5 rejected.** Fix phase: lead (shared/web code) + one Fable
renderer agent (26 files).

**MODEL-POLICY INCIDENT (recorded per the standing directive):** post-hoc audit found 2 of the 6
FINDERS partially served by Opus via API-side fallback (find:mailbox 30/37 assistant msgs,
find:afinal 23/63; a third hit was incidental — a finder reading docs that mention "Opus 4.8").
ALL 40 verify-stage agents (every refuter + judge) and the renderer fix agent ran pure Fable, so
every CONFIRMED finding was Fable-reproduced and Fable-judged, and every fix is pinned by
deterministic green suites. Residual exposure is confined to candidate GENERATION on two angles
(a Fable finder might have surfaced different candidates); accepted under the owner's one-round
cap and recorded here.

## Confirmed → fixed (15)

- **embed-1 [CRITICAL]** suppressionScan's strict opts (expectedWindow/minExpiryWts) condemned
  compliant selfbans over protocol-UNPINNED fields (`window` has no pinned value across the two
  conviction arms; payload `expiryWts` is inert — the A5-22 fold derives the real term) — a
  false-fraud channel. **Fix:** opts REMOVED; any same-ladder schema-valid anticheat selfban
  discharges the obligation. Suite pins both directions (mismatched window / short expiry ⇒
  STILL compliant).
- **embed-2 [major]** adoptVerdictRow's over-cap cliff let one junk record past ADOPT_ROW_MAX
  wholesale-suppress genuine conviction evidence. **Fix:** deterministic first-N prefix examined
  per-record; overflow reported, valid prefix evidence still adopted. Suite: junk padding cannot
  suppress; 5000-junk row stays bounded.
- **embed-4 [minor]** deadlineEvent wording vs tier2.ts — documented as the deliberate
  §0-consistent generalization (first NON-EXEMPT witnessed event; sole exemption = other-ladder
  anticheat selfbans; auditors must apply the same exemption).
- **friends-1 [major]** renderer deriveProfile duplicated the LWW merge WITHOUT the revoked-key
  exclusion → viewer divergence. **Fix:** routes through the canonical shared profileView
  (fail-closed).
- **friends-2 [major]** `certs: []` minted a permanently-fold-ignored device-key friend add.
  **Fix:** builder refuses empty certs; schema `.min(1)`. Suite-pinned.
- **mailbox-1 [minor]** sender-window eviction comment claimed "stale" — corrected to the honest
  tradeoff (active-window reset at sendersCap; bounded memory; flood can't exploit).
- **wiring-1 [major]** keyring().listAccounts() outside the fail-closed boundary — one corrupt
  record broke boot for every account. **Fix:** wrapped in resumeSession + listKeyringAccounts;
  suite: corrupt record ⇒ signed-out boot, never a throw.
- **wiring-2 [major]** resumeSession adopted displayName/foldedName from the mutable stored
  record. **Fix:** names cross-checked against the SIGNED genesis (+ normalizeUsername fold);
  mismatch ⇒ no session. Suite: tampered names ⇒ no session.
- **wiring-3 [major]** sign-out-forgets-seed privacy contract untested. **Fix:** signOutSequence
  (forget FIRST) + headless store suite section incl. forget-even-when-teardown-throws.
- **complete-1 [major]** own-profile asserted fabricated "moments ago" staleness. **Fix:** real
  §10 lastWitnessedActivityWts plumbed store→UI; null renders honest awaiting-transport copy.
- **complete-2 [major]** DEV_FIXTURE gated nothing (false greppability contract). **Fix:** live
  boolean gate + FixturePreviewBadge on every fixture surface (~20 mounts), pill enumeration
  completed, comments rewritten; zero fixture-importing files without the flag.
- **complete-3 [minor]** real chain timestamps formatted against frozen MOCK_NOW + "witnessed
  time" overclaim. **Fix:** required nowMs param; real surfaces pass Date.now(); honest
  self-recorded labeling.
- **complete-4 [minor]** three surfaces still taught the 3σ escalation-anchored ban. **Fix:**
  A5-21 conviction-only copy on SecurityTab / SelfBanDialog / FairPlayTab.
- **complete-6 [minor]** device Revoke was a fake-signing setTimeout mock. **Fix:** honest
  disabled control ("requires witness connectivity"), fake flow removed.
- **wiring-5 [minor]** remembered-seed default contradicted the opt-in docs. **Fix:** checkbox +
  store default to NOT remembered.

**Rejected (5):** gate-1/consumers-1 (duplicates of the ratified A5-21 validation-domain
change), consumers-3/congruency-4 (comment-block duplicates, self-corrected in context),
wiring-4 (duplicate of complete-3). Details in the round output.

## Final gates (post-fix)

test-accounts-social 97 · mailbox 81 · embed 148 · web-accounts-wiring 100 · afinal-flag 67 ·
chain 164 · tier2 394 · reputation 290 · web-accounts/auth/client/server/bridge green ·
typecheck node+web+server exit 0 · build:web + build:server exit 0. Two OUT-OF-LANE failures
observed during the wall (ratings + web-accounts a4-v1 fold-state goldens) are the CONCURRENT
A4 fix agent's in-flight golden re-freeze (their reputation.ts/trust.ts edits, minutes old at
run time) — not A6 defects; owned by the A4 lane.

**A6 is CALLED per the owner directive.** Remaining phase-boundary work (documented, not A6
defects): overlay transport sync for social records; witness signing-time discipline;
canonical-reveal publication slot; avatar upload wiring; manual cross-platform walkthrough.
