Continue building the Chess# decentralized accounts + social layer in ~/chess/chess-sharp
(git repo, branch web-port; note ~/chess itself is NOT the repo, ~/chess/chess-sharp is).
This is A3 — Overlay + storage + wire v6.

═══ READING SURFACE ═══
The spec is split into 30 per-topic files under docs/accounts-spec/ — start at
docs/accounts-spec/README.md (linked index), then open only the files a task needs. Slices are
byte-for-byte from the canonical file; docs/ACCOUNTS-SPEC.md (v1.1) remains the single authoritative
source and wins any disagreement. The folder is UNTRACKED (not committed) — leave it that way.
  · A3 core → files 12 (three retention layers), 13 (Kademlia overlay + publish-on-write), 14
    (authenticated pointers + the owner-gone viewing flow), 08 (entanglement → wire v6 details),
    29 (build phases / A3 proof), 25 (platform parity: storage budgets, operator fallback relay).
  · What storage MUST preserve for A4 → 07 (M-of-N checkpoints), 15 (ratings fold inputs pinned to
    checkpoints), 16 (reputation fold), 17 (trust). The reconstruction viewer must surface the
    newest M-of-N checkpoint + head + profile snapshot so A4's folds have their pinned inputs.
Other binding docs: docs/ACCOUNTS-PARAMS.md (params; §Storage N_shards=40/K_rec=12) · docs/STATUS.md
(phase log) · MEMORY.md "accounts-build-state" (model policy + A1/A2 conventions + PRESERVED PREWORK
findings incl. the Reed-Solomon recipe + the A2→A3 residual seams). Every mechanism is deliberate —
don't re-litigate the design.

═══ MODEL POLICY (standing project directive) ═══
Security-critical cryptographic + networked code. Standing directive: accounts subagents — builders
AND reviewers — run on Fable (claude-fable-5), not Opus.
- /model claude-fable-5 before starting. Pin model:'fable' on every agent you spawn.
- After any fleet completes, verify it actually ran on Fable: grep the workflow journal/transcript
  for "model":"claude-opus-4-8" (Workflow telemetry has a per-agent model field).
- If anything bounced off Fable: stop, flag it, re-set the model, re-run. Don't silently accept
  off-policy output.

═══ STATE ═══
A1 (Identity & keys) — DONE, committed 033f39f. src/shared/accounts/*.ts + web/accounts.ts.
  PARAMS_V1_DIGEST = ZDoblqaVf5z1zL8IvmWK2sdZK29JTNWZpY38XuDBZdk.
A2 (Witness fabric + PIN) — DONE, committed fecb758 + review-pass 42e716a. src/shared/accounts/
  witness/*.ts + server/judge/* + server/operator/peer.ts + scripts/test-accounts-{witness,pin,lease,
  fabric}.mjs + operator-smoke.mjs + test-judge-node.mjs. Converged clean after 5 Opus review rounds
  (defects 13→10→13→1→0) + a /code-review pass. PARAMS_A2_DIGEST = oDyonXFK6JWN23sLdAqWJwaFiuxkm4eeZq7cxxdy2zc.
  Judge WASM sha256 = a8fbc05ec6920b56d7485826dcb02c5ffd2826bcbf751cf973046f237a9096f1 (stockfish-18-lite-single).
  Fabric abstraction to build on: FabricEndpoint (src/shared/accounts/witness/types.ts) with
  MockFabric (fabric.ts) for suites + TrysteroFabric (server/operator/peer.ts, trystero 0.25.2 +
  werift). nodeId = sha256(rootPub); XOR distance + closestEligible + prefixBucket in witness/distance.ts.

A2→A3 RESIDUAL SEAMS — A3 MUST CLOSE THESE (they were deliberately deferred to A3's authoritative
identity/chain layer; seams already in the A2 code):
  (1) Committee failure-counter ANTI-SPREADING: effectiveCount is the t-th-largest of per-member
      monotonic counters, ~n/(n-t+1)× spreadable. The spec's "honest members gossip counts" needs
      A3's reliable Byzantine dissemination. Seam: pin.ts effectiveCount / protocol.ts tripFuseIfDue.
  (2) FULL canonical-set lease verification at attest — a witness admitting an event only enforces a
      context-free ≥1-grant floor without the subject's chain facts. Seam: WitnessDeps.verifyLease
      hook (protocol.ts witnessServe) — wire it once A3 replicates the subject's chain/certs.
  (3) AUTHORITATIVE pin-record-chain anchoring for handoff — the pin-provision member verifies handoff
      structure but can't confirm oldRecord/pinPub/committee are the account's REAL current record
      without the chain. Old-committee pinKey-gated co-signatures are the live A2 gate; A3 storage +
      readers make it chain-authoritative.
  (4) AUTHENTICATED lease-grant / device ownership — the witness blind-signs any leaseBody after the
      fuse check; sound double-grant PREVENTION (not just attribution) needs a witness to verify a
      device belongs to an account (chain/certs = A3). adjudicate's keyOf attribution is the sound A2
      part already in place.

═══ IMMEDIATE TASK — A3 (dependency-ordered bricks; build → Fable review → fix loop until clean →
commit each brick or the phase; desktop 100% intact every step) ═══
1. REED-SOLOMON codec (src/shared/accounts/storage/rs.ts, platform-neutral, pure, byte-deterministic
   node+browser). REBUILD from the PRESERVED prework finding (MEMORY): Reed-Solomon over GF(2^8),
   irreducible poly 0x11d, primitive element 0x02 (NOT 0x03 — 0x03 has order 85 mod 0x11d, doesn't
   generate the field). Use a CAUCHY coding matrix [I_k; C], C[r][j] = 1/((k+r) XOR j) in GF(2^8) with
   disjoint x/y index sets → every k-subset invertible (guaranteed MDS, ANY K_rec=12 of N_shards=40
   reconstruct), sidesteps the Vandermonde-systematic singular-submatrix pitfall. Integrity = sha256
   of the original carried in each shard's framing, re-checked after reconstruct. Headless suite:
   encode a chain blob → drop arbitrary 28 shards → reconstruct bit-identical; corrupt a shard →
   integrity rejects; golden vectors anchor byte-determinism across node + browser bundle.
2. KADEMLIA OVERLAY (src/shared/accounts/overlay/*): k-buckets + routing table keyed by nodeId XOR
   distance (reuse witness/distance.ts), iterative FIND_NODE / FIND_VALUE / STORE, bootstrap. Built
   OVER FabricEndpoint (trystero/Nostr = transport + bootstrap ONLY, not routing; C-11). Operator peer
   = fallback relay/bootstrap. Multi-node MockFabric suite: iterative lookup resolves a key in ~log N
   hops; routing tables converge; churn tolerated.
3. SHARD DUTY + REPAIR: key-distance assignment (which of the N=40 shards each node carries by
   distance to the chain's key), publish-on-write (witnessed events replicate at creation; personal
   lane at next sync; final sync leaves the full chain in shard space), background REPAIR (detect
   under-replication, re-encode/redistribute). Advertised capacity per platform (§11/25: desktop
   100s MB, browser ~50MB w/ navigator.storage.persist(), mobile 10-25MB); eviction = churn = healed.
4. AUTHENTICATED POINTERS (src/shared/accounts/storage/pointers.ts): a signed pointer ("I hold a
   segment of X, hash H") is valid ONLY if it embeds the countersigned segment header it references
   (X's head signature + witness countersignature) OR a verifiable shard-assignment proof — so only
   real entanglement partners + assigned shard-carriers can mint pointers a viewer enumerates. Closes
   index poisoning. Viewers rank by embedded proof, ignore the rest; contact sheet capped at real
   entanglements + assigned shards. Index built at write time; viewing never searches.
5. RECONSTRUCTION VIEWER: resolve key → overlay lookup (~log N hops) → authenticated pointer list →
   profile page from the 3-5 freshest holders (newest profile snapshot + newest M-of-N checkpoint,
   verified incrementally + spot-checked per §2, + head) → game history lazy-pages (~2KB/game).
   Guaranteed floor = union of survivors' holdings; expected = everything via shard layer + final sync.
   THE A3 PROOF (§5 acceptance scenario, in a multi-client harness): 1,000 games, owner gone forever,
   300 opponents active → the profile + history reconstruct; failure mode is temporary unavailability
   that heals.
6. WIRE v6 (src/shared/mp/wire.ts is at PROTOCOL_VERSION = 5; mpSession at src/renderer/src/features/
   play/online/mpSession.ts): bump PROTOCOL_VERSION to 6, add a `witness` hello role, rework the
   two-peer session to admit EXACTLY ONE witness peer. Per-move signature chaining — each move message
   signed by its mover over (gameId, ply, move, clockMs, prevMoveSig), countersigned by the receiver's
   next message, with the witness signing the interleaved stream (countersigned clock stream). The
   shipped mp wire carries no signatures + host-authoritative clocks today. CRITICAL desktop-intact
   gate: existing scripts/test-mp.mjs stays GREEN behind a version gate (v5 path unchanged); wire v6
   signatures verify in a new suite. This brick touches the shipped games layer — highest regression
   risk; gate it hard.

Consider whether to also wire residual seam (2) (WitnessDeps.verifyLease) once brick 3 replicates the
subject's chain/certs, and whether the overlay's gossip can host residual seam (1)'s counter
dissemination — but treat those as opportunistic, not blockers; flag design decisions rather than
re-litigating A2.

═══ GATES / CONVENTIONS ═══
export PATH=/opt/homebrew/bin:$PATH. src/shared/accounts/** and src/shared/mp/** platform-neutral (no
node:/DOM, typecheck node+web+server). Verifiers pure, byte-deterministic node+browser, no
Date.now/Math.random in shared (inject clocks/RNG). Desktop 100% intact: `npm run build` + full
scripts/test-*.mjs wall + `npm run typecheck` (node/web/server) green EVERY phase; existing test-mp
green behind the v6 version gate. Suites = esbuild-bundle on the fly with alias {'@shared':'<repo>/
src/shared'} (copy scripts/test-accounts-chain.mjs / scripts/lib/witness-bundle.mjs), one-line asserts,
exit(1) on any fail; add each to package.json + .github/workflows/build.yml. Browser worst-case
exercised in CI (playwright-core) for at least chain verification + the judge; add RS reconstruct +
overlay-lookup byte-parity to the browser gate. Deps already installed: @noble/ed25519 3.1.0,
@noble/hashes 2.2.0, @noble/curves 2.2.0, @scure/* 2.2.0, hash-wasm 4.12.0, werift 0.23.0,
trystero 0.25.2, playwright-core 1.61.1.

WORKFLOW: build each brick on Fable → run a Fable multi-agent adversarial review (5 independent
angles; attack the RS finite-field math, the overlay routing/eclipse resistance, pointer
index-poisoning, and the wire-v6 signature chain hardest) → fix every Fable-confirmed defect → all
gates green → commit. Then a /code-review pass. Repeat until no more fixes, exactly as A2 was driven.
Continue after A3: A4 (ratings[detmath] + reputation + trust + matchmaking) → A5 (anticheat judge)
→ A6 (social + A-final).
