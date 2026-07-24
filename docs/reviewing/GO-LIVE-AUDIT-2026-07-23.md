# Decentralized accounts — go-live audit (2026-07-23)

Read-only max-effort Opus audit. Two parts: (1) the conformance ledger (real vs mock vs unwired vs accepted-compromise, per spec section); (2) the make-it-live plan (A6 + A-final + infra to run on mac/windows/browser).

**Ledger summary:** The decentralized-accounts substrate for all twelve ACCOUNTS-SPEC sections exists as real, deterministic, suite-tested code (I ran the witness-fabric suite green, 63 assertions), but none of it is wired into the running app — every accounts-network path runs only over MockFabric in tests, the real TrysteroFabric and operator peer are never mounted (server/operator/peer.ts:19), and the live trystero multiplayer carries unsigned games that write no chains (mpSession.ts:196,291; mpClient.ts:8). The only live-wired functionality is the spec-permitted local/unwitnessed zone: real argon2id identity, local chain, recovery export, and profile edit (src/web/accounts.ts + store.ts), while every networked surface in the renderer AccountView is clearly-labeled DEV_FIXTURE sample data (fixtures.ts:26). The code comments are honest deferrals rather than contradictions; the real over-claim is "A-final live" — the flag defaults ON and disables the interim server accounts (accountsFlag.ts:53, server/index.ts:184) without starting any decentralized backend, leaving a stock web deploy with local-only accounts, so the substrate matches the spec as a tested design but is one full network-integration pass away from being the live system.

**Plan summary:** The decentralized-accounts substrate (A1–A7) is genuinely complete, byte-deterministic across node/browser, and fully committed — but NONE of it is wired into the running app: no app entry point instantiates the fabric, overlay, witness serve, write-lease, shard storage, live judge, or signed rated play (createTrysteroFabric/startOperatorPeer/createOverlayNode have zero call sites outside their definition + the MockFabric smoke), and what's actually live online today is still the interim server accounts. "Make it live" therefore means building the entire running distributed system the library was designed for — a browser TrysteroFabric (reusing the proven rtcTransport pattern; werift only needed for the headless operator peer, which contra the brief is the pure-JS clean-bundling path while node-datachannel is the native fallback), a deployed always-on operator peer + real TURN, a witness-peer runner around the existing WitnessCore, an overlay-backed rated matchmaking rendezvous, live lease acquisition, un-fixturing ~22 DEV_FIXTURE UI surfaces, and only then the already-built A-final flip. Honest read: the crypto hard part is done, but this is a Large, roughly 8–14-week networking/integration/ops program dominated by the witness runner, matchmaking, and real-world NAT/always-on-peer reliability — not a wiring afternoon, and nothing should be called "live" until two real machines plus a browser play a rated game witnessed by a third over real relays.</summary>
</invoke>


---

# PART 1 — CONFORMANCE LEDGER

# Accounts Conformance Ledger — chess-sharp (audit 2026-07-23, read-only)

**Binding spec:** `docs/building/ACCOUNTS-SPEC.md` v1.1. **Method:** every row verified against code, cited `file:line`. **Status vocabulary** exactly as requested: REAL+WIRED / REAL+TESTED-ONLY / IMPLEMENTED-UNWIRED / MOCK/FIXTURE / ACCEPTED-COMPROMISE / MISSING.

## The one structural fact that governs every row
There is **no live accounts-transport in the running app.** The only networking the shipped app actually runs is the trystero WebRTC **multiplayer** (`src/renderer/src/features/play/online/mpClient.ts:8`), and it carries **unsigned** games: the witness-seat / move-signature / segment machinery exists in the live session class but **no shipped caller enables it** — `mpSession.ts:196` ("*signing… ABSENT (every current caller)*") and `:291` ("*unsigned — every shipped caller*"). Every accounts-substrate mechanism (witness fabric, overlay, shards, PIN committee, ratings-from-real-games, judge, social sync) is exercised **only over `MockFabric`** (`src/shared/accounts/witness/fabric.ts:50`) inside `scripts/test-accounts-*.mjs`. The real transport `TrysteroFabric` (`server/operator/peer.ts:192`) and the operator peer are **never instantiated by the app** — `server/operator/peer.ts:19-22` ("*This module is NOT mounted into server/index.ts's main flow*"), and the running server has **zero** references to operator/fabric/overlay/`@shared/accounts` (`server/index.ts`, grep clean). So: the substrate is REAL code, genuinely TESTED, but WIRED to nothing live except a local, single-machine identity/chain.

## Section-by-section ledger

| Spec § | Mechanism | Status | Evidence (file:line) |
|---|---|---|---|
| **§0** Prime directive: claims are pure recomputable folds over signed data | Fold architecture (deterministic, chain-derived, `§0`-compliant) | **REAL+WIRED** (local chain) / **REAL+TESTED-ONLY** (witnessed data) | `src/renderer/src/features/account/store/derive.ts:1-40` folds the real local chain via `a4Fold`/`repScore`; but the only "public signed data" that exists live is genesis/cert/profile — no witnessed records are produced anywhere live |
| **§1** argon2id→ed25519 derivation, `name#TAG`, key certificates, device enroll | Local identity, tags, certs, mnemonic/keyfile recovery | **REAL+WIRED** | `src/web/accounts.ts:136` (`createAccount`, real argon2id), `:257` (`exportMnemonic`), `derive.ts`/`identity.ts`/`certs.ts`; UI at `store.ts:246-378`; nav reachable `App.tsx:101`, `Layout.tsx:40` |
| **§1** Witnessed device enrollment / witness-countersigned takeover | Witnessed-zone device binding | **REAL+TESTED-ONLY** | `witness/lease.ts`, `witness/chainauth.ts`; needs a witness — no live fabric |
| **§1** PIN: threshold-OPRF committee, replicated failure counter, 100-fail fuse | tOPRF committee + counters | **REAL+TESTED-ONLY** (lib) / **MOCK/FIXTURE** (UI) | `witness/pin.ts`, `witness/oprf.ts`, `witness/shamir.ts`, `witness/counters.ts` (suite `test-accounts-pin`); renderer `pin/PinSetupWizard.tsx` + `store.ts:393-407` are `DEV_FIXTURE` |
| **§1** Recovery = none by design; mnemonic/keyfile nudge (C-5) | Export lifeline | **REAL+WIRED** | `src/web/accounts.ts:257-263`; `auth/RecoveryExport.tsx` |
| **§2** Two-lane hash-linked chain (witnessed single-writer + personal CRDT) | Chain format + verify | **REAL+WIRED** (local) | `src/shared/accounts/chain.ts`; `verifyOwnChain` `src/web/accounts.ts:268`; live chain only ever holds genesis+cert+profile (`createAccount`, `updateProfile:413`) |
| **§2** Self-verifying checkpoints w/ M-of-N cosignatures + spot-check | Checkpoint fold + cosign | **REAL+TESTED-ONLY** | `src/shared/accounts/checkpoint.ts`, `chain.ts` audit (suite `test-accounts-chain`); cosigners need witnesses — none live |
| **§3** Pairwise countersigned segments in both chains; per-move sig chaining; wire v6 | Segment + witnessed-result adjudication | **REAL+TESTED-ONLY** (code) / **IMPLEMENTED-UNWIRED** (live activation) | `src/shared/accounts/segment.ts`, `src/shared/mp/witnessCore.ts`, `wire.ts:66` (PROTOCOL_VERSION 6), suite `test-mp-v6`; live activation dead: `mpSession.ts:196,291`, `mpClient.ts:8` passes no `signing` |
| **§3** Friendships as witnessed countersigned edges | Friend edges | **REAL+TESTED-ONLY** (lib) / **MOCK/FIXTURE** (UI) | `src/shared/accounts/social/friends.ts` (suite `test-accounts-social`); renderer `social/PeopleTab.tsx` `DEV_FIXTURE` |
| **§4** Canonical witness set, eligibility, lease w/ epochs, diversity-bound time | Witness fabric | **REAL+TESTED-ONLY** | `witness/{fabric,eligibility,lease,wtime,distance,slash}.ts`; suites `test-accounts-{witness,lease,fabric}`; only over `MockFabric` |
| **§4** Rated play requires ≥1 non-player witness; honest 2-user degradation (C-10) | Witness-required gate | **REAL+TESTED-ONLY** | `test-accounts-fabric.mjs` GREEN (63 asserts, verified live) incl. "2 machines + no third → insufficient-witnesses, never a dead grant" |
| **§4** Operator always-awake peer (protocol-optional, C-10) | Operator peer + real WebRTC transport | **IMPLEMENTED-UNWIRED** | `server/operator/peer.ts:106,192`; `:19-22` not mounted; `scripts/operator-smoke.mjs:76` real trystero path "never entered" (smoke uses MockFabric) |
| **§5** RS erasure shards (40/12) + repair; friend pinning; entanglement gravity | Storage/reconstruction | **REAL+TESTED-ONLY** | `storage/{rs,shards,pointers,viewer}.ts`; suites `test-accounts-{rs,shards,pointers,reconstruct}` (the §5 acceptance proof) |
| **§5** Kademlia-over-WebRTC overlay (routing, lookup, bootstrap) — "new work" | Overlay node | **REAL+TESTED-ONLY** + **ACCEPTED-COMPROMISE** (C-11) | `overlay/{node,kbucket,rpc}.ts` (suite `test-accounts-overlay`); C-11: signaling still on third-party Nostr relays, operator fallback unmounted |
| **§5** Authenticated pointer records (index at write time) | Pointers | **REAL+TESTED-ONLY** | `storage/pointers.ts` |
| **§6** Per-(kind×TimeCategory) Glicko-2 folds, placement, hidden/provisional render | Ratings fold | **REAL+WIRED-to-local-chain** (folds seeds only) / rated input **IMPLEMENTED-UNWIRED** | `ratings/{glicko,ladders,fold,display}.ts` folded in `derive.ts`; but no rated `segment` ever appended live → ladders fold to 1200/350 seeds; other-profile ladders `fixtures.ts` MOCK |
| **§6** Fold inputs pinned to embedded M-of-N checkpoint (no self-assert) | oppCkpt binding | **REAL+TESTED-ONLY** | `segment.ts` `verifyEmbeddedOppCkpt`; suite `test-accounts-ratings` |
| **§6b** Reputation fold over witnessed conduct + commendations; public badge | Reputation | **REAL** (wired to local chain, no conduct events live) | `ratings/{reputation,conduct}.ts` folded in `derive.ts`; folds to neutral start (80) — no live conduct events; profile panel `ReputationPanel.tsx` |
| **§7** Trust score T; entanglement-weighted diversity; width curve + island; pools | Matchmaking | **REAL+TESTED-ONLY** (lib) / **MOCK/FIXTURE** (UI) | `mm/{trust,pairing}.ts` (suite `test-accounts-trust-mm`); renderer `rated/RatedLobby.tsx`+`TrustWidthMeter.tsx` `DEV_FIXTURE` |
| **§8** Canonical judge (hash-pinned single-thread WASM), Tier-1/Tier-2, verdict records | Judge + tiers | **REAL+TESTED-ONLY** | `judge/{judge,tier1,tier2,anchors,embed}.ts`, `src/web/engines/judge.ts` (real WASM, browser parity gate); renderer `fairplay/FairPlayTab.tsx:14` is `DEV_FIXTURE` with a **fake** hash `fixtures.ts:719` |
| **§8** engine-match signal (§8-intended best-relative window) | Tier-1 engine-match | **PARTIAL / DEFERRED (self-flagged defect)** | `judge/tier1.ts:68` "*[A5-14 DEFERRED — CONFIRMED DEFECT]*"; shipped criterion degenerate, intended best-relative statistic is diagnostics-only, not fed to any verdict |
| **§8** strength-trajectory signal (smurf channel) | Tier-1 trajectory | **IMPLEMENTED-UNWIRED (deferred)** | `judge/tier1.ts:174-185` computed but "*DEFERRED… never fed to any verdict*" |
| **§8** Self-ban on 5σ conviction; suppression → permanent distrust | Ban obligation | **REAL+TESTED-ONLY** | `judge/tier2.ts`, `ratings/fold.ts` (bans from selfban events); spec §8 re-anchored to 5σ (A5-21) |
| **§9** Ban taxonomy binds to root; reroll priced not prevented (C-6) | Bans / smurf economy | **REAL+TESTED-ONLY** + **ACCEPTED-COMPROMISE** (C-6) | ban state folded `fold.ts`; no live bans (no live games/judge) |
| **§10** Sign-in-anywhere, edit profile, friends, presence, mailbox anti-spam | Social surface | **REAL+WIRED** (profile edit, staleness) / **REAL+TESTED-ONLY** (friends/presence/mailbox libs) / **MOCK/FIXTURE** (their UIs) | profile edit `src/web/accounts.ts:413` + `store.ts:335`; `social/{presence,mailbox,profile}.ts` (suites `test-accounts-{social,mailbox}`); PeopleTab/mailbox UI `DEV_FIXTURE` |
| **§11** Judge node-count determinism identical across desktop/browser/mobile | Cross-platform judge | **REAL+TESTED-ONLY** | browser verdict-bit parity gate `scripts/test-web-accounts-browser.mjs`; not run in any live UI |
| **§11** Operator's two integrations: Node WebRTC + Node judge-WASM harness | Operator integrations | **IMPLEMENTED-UNWIRED** | `server/operator/peer.ts` + `server/judge/nodeAdapter.ts` exist; peer unmounted (`peer.ts:19`) |
| **§12** C-1…C-12 accepted compromises | Documented deviations | **ACCEPTED-COMPROMISE** (respected in code) — except C-10/C-11 fallback not live | e.g. C-12 `revocationContested` carried `storage/viewer.ts` + fixtures; C-11 overlay-on-Nostr honest; C-10 operator "replaceable fallback" exists but **unmounted** |

**Also present (beyond A6):** an A7 round continued the substrate — witness salt-grant signing-time discipline / canonical-reveal (`scripts/test-accounts-a7-roundb.mjs`), still tested-only.

## The owner's three fears — answered

**(a) Is the LIVE networking real, or replaced by sample networking, and where exactly?**
Both, on different layers — and the accounts layer is the sample one. The app's real live network is trystero WebRTC **multiplayer** (real public Nostr relays + WebRTC, `mpClient.ts:8`); the A1 spike proving node↔browser connect is genuine. **But that live transport carries no accounts data** — games are unsigned, no witness seat, no segment, no chain write (`mpSession.ts:196` "*ABSENT (every current caller)*", `:291` "*unsigned — every shipped caller*"). **Every accounts-substrate network path is sample/mock:** it runs only over `MockFabric` (`src/shared/accounts/witness/fabric.ts:50`) in `scripts/test-accounts-*.mjs`. The real `TrysteroFabric` (`server/operator/peer.ts:192`) is never constructed by the app; the operator peer is not mounted (`server/operator/peer.ts:19-22`); `server/index.ts` has **zero** substrate references. In the renderer AccountView, local identity/chain/profile/recovery are **real** (`store.ts` over `src/web/accounts.ts`), and **everything networked is `DEV_FIXTURE` sample data** (`fixtures.ts:26`, self-labeled by `FixturePreviewBadge.tsx` on PIN, friends, presence, mailbox, witness set, shard duty, verdicts, rated lobby, other profiles, reconstruction). **Verdict: fear CONFIRMED for the substrate.** The witness fabric is real, tested code exercised against a mock message bus, not a live network. What a default web deploy runs today for "accounts" is a **local-only** identity + local chain + local Glicko — not the decentralized network.

**(b) Code comments that CONTRADICT the spec or the owner (worst offenders):**
I found **no dishonest contradictions** — the code comments are, if anything, *more* honest than STATUS.md's "COMPLETE / A-final live" framing. The notable ones are deferrals/gaps, not lies:
- `src/shared/accounts/judge/tier1.ts:68` — "*[A5-14 DEFERRED — CONFIRMED DEFECT in the any-line criterion]… the criterion extensionally degenerates to MultiPV-list membership.*" **Real gap vs §8's "engine-match rate," but a ratified deferral**, not a hidden contradiction; the intended statistic is computed as diagnostics-only.
- `src/shared/accounts/judge/tier1.ts:174-185` — strength-trajectory "*computed… never fed to any verdict… DEFERRED.*" §8 lists it as a Tier-1 signal; the smurf channel is absent. **Deferral, documented.**
- `server/operator/peer.ts:19-22` — "*This module is NOT mounted into server/index.ts's main flow (that lands in A6/A-final).*" This **contradicts STATUS.md's "A6 CALLED / A-final live"**: the §11 operator peer (minimal-scale availability, C-10) is a real unfulfilled deliverable, not just a note. **The nearest thing to a genuine contradiction — but it's an honest unwired-deliverable note vs an over-claiming status log.**
- `src/renderer/…/mock/store.ts:1-16` and `mock/fixtures.ts:1-26` — explicitly state which surfaces are real vs fixture. **Honest.**
- Pre-existing doc-vs-doc item the repo itself tracks: `docs/building/CONTRADICTIONS.md` **C5** — spec §1 "salt = username" vs implemented `sha256(foldedUsername)`. The spec **pre-acknowledges** this ("*The spec's 'salt = username' cannot be literal*"), so it's a **documented deviation, not a contradiction.**
Net: the honest comments contradict the *triumphant STATUS.md narrative*, not the spec.

**(c) Does what we have MATCH the spec once the small accepted compromises are granted? — crisp verdict:**
As a **design + tested substrate: YES, substantially.** Every one of §1–§11's mechanisms exists as real, deterministic, suite-covered code that matches the spec's intent, and the §12 compromises (C-10 operator-optional, C-11 overlay-is-new-work-on-Nostr, C-12 revocation floor) are respected in code. **As a running system: NO.** Granting the small compromises does not close the gap, because the gap is not a compromise — it is the **entire network-integration pass**, which STATUS.md itself lists as a "deliberate residual." Nothing is fraudulent; the folds are genuine and the tests pass. But **A-final's flag has been flipped ON by default** (`accountsFlag.ts:53`, `server/index.ts:184`, `main.web.tsx:48`) — turning the interim server accounts **off** — **without the decentralized replacement running.** So the spec's actual goal ("*ratings, bans, reputation, profiles, anticheat all exist and all run client-side… for 2 users and 2 million*") is **met in the test harness and unmet in the product.**

## One-paragraph honest verdict
The decentralized-accounts substrate is real, deterministic, and genuinely tested — I ran the witness-fabric suite green (63 assertions, including the honest 2-user degradation), and the module tree for all twelve spec sections is present and folded from real signed chains, not faked. But **none of it is wired into the running app.** The only thing live-wired is the *unwitnessed* local zone the spec explicitly permits: real argon2id/ed25519 identity, a real local chain, real recovery export, and a real profile edit — all local to one machine, with every networked surface rendered as clearly-labeled `DEV_FIXTURE` sample data. The app's real P2P transport (trystero multiplayer) is not carrying accounts data (games are unsigned; `mpClient.ts:8` supplies no signing config), and the real `TrysteroFabric` + operator peer that the substrate needs are never mounted (`server/operator/peer.ts:19`). The most consequential honesty problem is not in the code comments — which are candid to a fault — but in the **"A-final live" claim**: the flag flip has *removed* the interim cross-device server accounts by default while the decentralized network that was supposed to replace them does not run, so a stock web deploy today has **local-only accounts**. Bottom line: this is a spec-faithful, well-tested *substrate* sitting one large, well-understood integration pass (live fabric + signed rated play + mounted operator peer + un-fixturing the UI) away from being the live system the spec describes — call it built and proven, not live.


---

# PART 2 — MAKE-IT-LIVE PLAN
# Make-It-Live Plan — Decentralized Accounts (A6 wiring + A-final + operator/relay infra)

Read-only audit of `/Users/isaacmiller/chess/chess-sharp` @ `87bd7d8` (branch `web-port`, working tree CLEAN — all A1–A7 work is committed). Every claim below is cited to `file:line`.

---

## 0. The brutally honest state (read this first)

**The substrate is real, proven, and committed. Nothing in it is wired into the running app.** Every phase (A1–A7) deliberately ended "green, desktop untouched, over MockFabric / in-process." There is no runtime that instantiates the transport, the overlay, the witness fabric, the lease, shard storage, the live judge, or signed rated play in the desktop or web app. What is *live online today* is the **interim server accounts** (`server/auth.ts` + per-user SQLite), exactly as the ground truth states.

Hard evidence:
- `createTrysteroFabric` and `startOperatorPeer` are referenced **only** in their own definition (`server/operator/peer.ts:106,192`) and the offline smoke (`scripts/operator-smoke.mjs`). Grepping `src/main`, `src/web`, `src/renderer`, `server/index.ts` for them returns nothing.
- `createOverlayNode(fabric,…)` (`src/shared/accounts/overlay/node.ts:108`), `witnessServe`/`memberServe`, `createSocialRelay`, `publishVerdictRow`/`adoptVerdictRow`, `grantLease`/`requestLease`/`acquireLease`: **zero** call sites in any app entry code (verified by grep across `src/main`, `src/web`, `src/renderer`, `server/index.ts`).
- The renderer imports exactly **two** things from the substrate: the pure `profileView` fold (`src/renderer/src/features/account/store/derive.ts:23`) and the judge WASM *type* (`src/web/engines/judge.ts:19`). Nothing else.
- `judgeGame(...)` is never invoked in app code (only named in a doc comment at `src/web/engines/judge.ts:140`). The anticheat judge is a dormant, test-proven adapter.
- `src/main` has **no** accounts/fabric/witness/overlay code at all (the only "overlay" hits are KataGo territory rendering, unrelated).
- The §5 reconstruction proof, overlay routing, social transport, and verdict transport suites are all **MockFabric / in-process** (`scripts/test-accounts-reconstruct.mjs`, `-overlay`, `-social-transport`, `-verdict-transport` all build on `MockFabric`; `operator-smoke.mjs:19-22` explicitly marks "trystero + werift external — the TrysteroFabric path is never entered here").
- `server/operator/peer.ts:19-20` says it plainly: *"This module is NOT mounted into server/index.ts's main flow (that lands in A6/A-final)."* It never has been.

**One correction to the ground-truth framing (honesty, per your ask):** the task says "werift native addon breaks isolated bundling (STATUS notes node-datachannel fallback)." That is inverted. `STATUS.md:274-278` records the opposite: the **werift** path produced an *"esbuild self-contained CJS bundle proven from an empty dir"* (pure-JS, chosen path), and it is **node-datachannel** whose *"native addon breaks isolated bundling — fallback only."* werift 0.23.0 is a pinned direct dependency (`package.json:130`) and installed. This matters because it makes the headless-peer bundling risk *lower* than the framing implies — but it must still be re-proven in the *production* bundler (electron-builder / `build-server` esbuild), not just a spike from an empty dir.

**Net:** the cryptographic/protocol "hard part" (the part everyone underestimates) is genuinely done and byte-deterministic across node/browser. What remains is **the entire running distributed system the library was designed for** — a networking/integration/product build, with real field-reliability risk. This is **Large**, not a wiring afternoon. See §8 for the honest sizing.

---

## 1. HOST THE REAL FABRIC in the running app

**What the spec asks:** desktop + web + phone browser each instantiate a real `FabricEndpoint` (TrysteroFabric), join the Kademlia overlay, and become an eligible node (§4/§5, §11, C-11).

### Exists
- The abstraction seam is clean and total: `FabricEndpoint` (`src/shared/accounts/witness/types.ts:324`) with `announce / directory / request / onRequest`. `MockFabric` (`src/shared/accounts/witness/fabric.ts:50`) is the in-process double; everything (overlay, witness, storage, social, verdict) is written against the interface, never against a transport.
- A **real** node transport already exists: `createTrysteroFabric` (`server/operator/peer.ts:192`) — trystero 0.25.2 rooms with `rtcPolyfill: werift.RTCPeerConnection` (`peer.ts:196,204`), presence gossip + a single request channel (`peer.ts:217-236`).
- A **proven browser WebRTC pattern** already ships and runs live in the app: `src/renderer/src/features/play/online/rtcTransport.ts` — `joinRoom` over trystero's default Nostr strategy, ICE via Google/Cloudflare STUN + openrelay TURN (`rtcTransport.ts:11,25-42,52-61`). This is the renderer's *working* WebRTC path and the natural template for a browser-side fabric.
- The Kademlia node is complete: `createOverlayNode(fabric, contact, opts)` with k-buckets, iterative FIND_NODE/VALUE/STORE, anti-eclipse admission, bootstrap-from-directory (`overlay/node.ts:108-449`), bound to the fabric via `onOverlay`/`overlayRequest` (`overlay/rpc.ts:107,136`).

### Must build / wire
1. **A browser-side TrysteroFabric variant** (renderer + web + mobile browser). This is `createTrysteroFabric` **minus** the `rtcPolyfill` (browsers have native `RTCPeerConnection`) and reusing `rtcTransport.ts`'s ICE config. Critically, the desktop Electron **renderer is Chromium** — it has native WebRTC and already runs `rtcTransport.ts` — so **the same browser fabric serves desktop-renderer, web, and phone browser**. werift is **not** required for the app itself. *(Architectural decision to make explicit: run the app's fabric in the renderer, next to the existing `mp` singleton, OR in the Electron main process via werift for true always-on background. Renderer-hosted is the low-risk default and matches how `mp` already lives as an app-lifetime singleton in `mpClient.ts:8`.)* **Sizing: Medium.**
2. **A node/main-process TrysteroFabric** (for the headless operator peer and any Electron-main-hosted option) — already coded (`createTrysteroFabric`), but never run against a real relay. Needs: real-relay bring-up, reconnect/backoff, and a **production-bundler proof** that werift esbuilds/electron-builds clean (STATUS proved a spike bundle, not the shipped config). **Sizing: Medium (Large if werift misbehaves in electron-builder).**
3. **A peer "service"/lifecycle object** that the app owns: derive `nodeId = sha256(rootPub)`, build identity + device key from the signed-in account, construct fabric → `createOverlayNode` → `bootstrap()`, advertise `caps`/`shardMb` per platform (`peer.ts:143-154` is the shape), and run background repair. Today nothing constructs this. **Sizing: Medium.**
4. **Platform capability advertisement + persistent storage adapter** — the overlay/shard layer stores `CanonicalObject`s in an in-memory `Map` (`overlay/node.ts:122`). To actually carry shards you need a real KV store: IndexedDB in browser (with `navigator.storage.persist()`), a file/SQLite store on desktop (§11 budgets: desktop 200 MB / desktop-browser 50 MB / mobile 15 MB — `ACCOUNTS-PARAMS.md` Storage). **Sizing: Medium.**

**Known constraint (real):** werift bundling under electron-builder/`build-server` is the one place the transport choice can bite; keep node-datachannel as the documented fallback (`STATUS.md:277`). The app-side (browser) path sidesteps it entirely.

---

## 2. WIRE a LIVE rated game end-to-end (mpSession.ts is the seam)

**What the spec asks:** a rated game acquires a write-lease, seats ≥1 witness that is neither player, streams per-move-signed play (wire v6), the witness countersigns (wclk/wend), the segment is written into both chains + published to shard space, ratings fold from the embedded checkpoint (§3/§4/§6).

### Exists (a lot — this is the most-complete seam)
- **wire v6 is shipped**: `PROTOCOL_VERSION = 6` (`src/shared/mp/wire.ts:66`), `role` enum includes `'witness'` (`wire.ts:68`).
- **`MpNetSession` fully implements signed play + the witness seat**: `MpSigningConfig` (`mpSession.ts:182`), `setupSignedGame` mints the game key when both hellos carry identity (`mpSession.ts:1097`), per-move chained signatures (`signOwnMove` `mpSession.ts:1158`), terminal countersignatures/rage-quit denial (`signTerminal` `mpSession.ts:1204`), witness seating (`onWitnessHello` `mpSession.ts:980`), verified witness stream fan-out (`onWitnessStream` `mpSession.ts:347`, `onWitnessStreamMsg` `mpSession.ts:1008`), and the outputs the segment builder needs (`getSignedGame` `mpSession.ts:359`, `getWitnessIdentity` `mpSession.ts:353`).
- **The witness-side follow/countersign core exists**: `WitnessCore` class (`src/shared/mp/witnessCore.ts:248`), `MoveChainVerifier` (`witnessCore.ts:84`) — pure, exercised in `scripts/test-mp-v6.mjs`.
- Segment/checkpoint/fold machinery is complete and reviewed: `segment.ts` (game key, signed moves, witness-end), the a4-v1 rating fold pinned to the embedded opponent checkpoint (`ratings/fold.ts`), verdict-safe checkpoints.

### Must build / wire (the actual gaps)
1. **Pass `signing` into the session.** The single caller constructs it unsigned: `mp = new MpNetSession(createRtcTransport)` (`mpClient.ts:8`) with no options. `mpSession.ts:181` states it outright — *"All shipped callers omit it."* So every online game today is unsigned v6 (byte-identical to v5) and the entire witness/signing path is dead code in production. Wiring = derive the device signing key from the signed-in account (`src/web/accounts.ts` `sessionInfo()`/`deriveChild`) and pass `{priv,key,root}` when both players are signed in. **Sizing: Small.**
2. **Build a real witness peer runner.** Nothing joins an mp room as `hello{role:'witness'}` and *produces* wclk/wend. `WitnessCore` is the brain; there is no body. You need a peer that: is selected as an eligible witness for this game (canonical set, §4), joins the specific trystero mp room, sends the witness hello, feeds the committed stream through `WitnessCore`, emits wclk/wend back, and then **builds + publishes the segment** into both players' shard space (`storage/shards.ts`, `storage/pointers.ts`). This is the biggest single missing runtime piece for rated play. **Sizing: Large.**
3. **Rated matchmaking rendezvous.** `RatedLobby.tsx` is a fixture (`RatedLobby.tsx:28,194-195` — badge literally reads *"Sample matchmaking — awaiting network transport"*). `mm/pairing.ts` computes *legality* but there is no live pool where players advertise "I want rated Blitz at my trust-width," get paired via `pairingLegal`, and get a witness assigned + all three handed a room. The casual path is code-based (host issues a code, guest types it — `mpSession.host()`); rated play needs an overlay-backed advertise/subscribe pool. **Sizing: Large.**
4. **Write-lease acquisition before the witnessed append.** No app code calls `grantLease`/`requestLease` (verified: zero hits). Before a rated result is appended, the mover's device must hold a live T_lease-of-canonical-set lease with a monotonic epoch (`witness/lease.ts`, §4; TTL 120s/heartbeat 20s per PARAMS). Takeover is PIN-gated. This must run over the live fabric against the real witness set. **Sizing: Medium.**
5. **Segment → chain append → ratings fold → checkpoint.** After a witnessed terminal, append the countersigned segment to both chains, publish authenticated pointers, and re-fold ladders. The folds/appends are done and tested; the *trigger from a live game* is not. `mpSession.ts:374` (A6 seam note) flags the advisory `onWitnessStream` still ignores ladder-bound wends until it derives its own binding. **Sizing: Medium.**

**Live-verifiable milestone:** two signed-in machines + a third witness peer complete one Blitz game; both chains carry a matching countersigned segment; a fourth fresh viewer reconstructs the result. That single end-to-end is the real "it works" proof.

---

## 3. THE OPERATOR PEER — deploy, run, TURN/relay (C-11)

**What the spec asks (§11, C-10, C-11):** an always-awake, zero-authority node that is witness/committee-of-last-resort and a replaceable bootstrap/relay fallback; needs (a) a Node WebRTC binding and (b) a Node judge-WASM harness.

### Exists
- Both §11 integrations are **coded**: `startOperatorPeer` wires `witnessServe` + `memberServe` + announce (`peer.ts:106-169`), and constructs the content-hash-pinned canonical judge via `newNodeJudgeEngine` (`peer.ts:120`, over `server/judge/nodeAdapter.ts` + `contentHash.ts` + `nodeEngine.ts`). Judge WASM sha256 is pinned (`STATUS.md:292-293`).
- `createTrysteroFabric` (werift) is the (a) binding. `operator-smoke.mjs` proves the peer serves lease grants + PIN evals + a bit-identical `judgeGame` — but **against MockFabric only**.

### Must build / wire
1. **Actually run it against real relays, once.** The TrysteroFabric path has *never* touched a live Nostr relay (`operator-smoke.mjs:19-22`). First real bring-up: connect, hold presence, accept an inbound `request`, survive relay churn. **Sizing: Medium.**
2. **Deploy surface.** It is not mounted in `server/index.ts` (which only wires the A-final gate — `server/index.ts:54,176,184`). Options: a sidecar process in the existing Docker image, or a separate always-on service. Needs: identity/keypair provisioning + persistence, `dataDir`, healthcheck, restart policy, logging. **Sizing: Medium.**
3. **Overlay membership, not just "serve whoever reaches it."** `peer.ts:186-190` is honest that it does no routing — it "simply serves whoever reaches it." For it to be a real fallback bootstrap/relay it should run `createOverlayNode` + `bootstrap()` like any peer. **Sizing: Small–Medium.**
4. **TURN/relay config (C-11).** Today signaling rides third-party Nostr relays and **openrelay** public TURN (`rtcTransport.ts:31-41`, hardcoded credentials). C-11 requires these be *replaceable with the operator peer as fallback*. Concretely: (a) make relay/TURN lists configurable (env), (b) stand up your own TURN (coturn) as the reliability floor for symmetric NATs, (c) let the operator peer act as a relay-of-last-resort. Public openrelay is fine for a demo but is a real availability risk for rated play. **Sizing: Medium (Large incl. running your own TURN).**

**C-10 boundary to respect:** the operator peer is protocol-optional, unprivileged, removable — costs only availability at minimal scale, never truth/data. Keep it that way; don't let it become the de-facto authority.

---

## 4. WIRE the real Account UI (replace fixtures with the substrate + keyring)

### Exists
- Auth is **already real**: `mock/store.ts` runs create/sign-in/sign-out/export/updateProfile over `src/web/accounts.ts` (real argon2id, real keyring in localStorage, chain-derived folds) — `mock/store.ts:1-18,246-431`. `AccountView` is mounted in the running app (`App.tsx:101`).
- Profile/ladders/reputation/devices/chain rows all derive from the stored chain via the shared folds (`store/derive.ts`).

### Must build / wire
- **Un-fixture the network-dependent surfaces.** `DEV_FIXTURE` gates ~22 files (PIN committee, `RatedLobby`, `TrustWidthMeter`, `ProfilePage` of others, `PeopleTab`/social, `FairPlayTab`/`VerdictViewer`/`JudgeReceipts`, `StoragePanel`, `SecurityTab` revoke, `OverviewSection`, `GameChromeShowcase`, `WitnessStrip`). Each is designed to flip to live data + drop its `FixturePreviewBadge` as the matching transport lands (`mock/store.ts:11-18`; A7-KICKOFF brick 4). No dead buttons: anything not yet live keeps its honest badge.
- This is **gated by §1–§3**: the UI can only go live surface-by-surface as presence/mailbox/friends/verdict transport + the live overlay come up. The A7 social/verdict transport modules (`social/transport.ts`, `judge/transport.ts`) are the pure halves already built — they need a live overlay node to run on. **Sizing: Medium (spread across the phases as each transport lands).**

---

## 5. A-FINAL — flip off interim server accounts

### Exists (this part is genuinely ready)
- The switch is built, reversible, and **already defaults ON**: `server/afinal.ts` (`accountsDecentralized()` `:72`; `registerInterimAuthGate` `:117`; gate scoped to **only** `/api/auth*` `:101-108`), `src/web/accountsFlag.ts` (`ACCOUNTS_DECENTRALIZED` default ON `:53`). Wired in `server/index.ts:54,176,184`. `test-afinal-flag` = 67 asserts (`STATUS` tail).
- Content plane stays served either way (puzzles/curriculum/famous/review/statics untouched) — §14 honored (`afinal.ts:24-32`).

### Must build / decide
1. **Do not flip until §1–§3 are live.** Turning A-final ON while the decentralized path can't host a game or reconstruct a profile online strands users. A-final should be the *last* switch, after the live rated-game proof.
2. **Migration/coexistence.** Interim accounts live in `server.sqlite` + per-user `app.sqlite` (`WEB-DEPLOY.md` DATA_DIR). Decentralized identity is password-derived (no server row). There is **no automatic bridge** — a user's interim games/ratings do not become chain history. Decide: (a) one-time export/import of local progress (precedent exists: `src/web/migrate.ts` copies localStorage → account on signup), or (b) accept a clean break with honest copy. `STATUS` A6 tail flags the "full-session kill of interim cookies on ipc/review" as deferred. **Sizing: Medium.**
3. **STATUS is behind the tree.** `STATUS.md` ends at "A4 review re-verified"; the two A7 commits (`a5a0165`, `87bd7d8`) landed after and have **no STATUS entry**. Update the log before A-final so the go-live checklist is trustworthy. **Sizing: Small.**

---

## 6. The 2-user rated-play boundary + honest degradation (all 3 platforms)

**Spec is explicit (§4, C-10):** *"with exactly two machines online and no third reachable, rated play is unavailable until one appears (degrades honestly, never a dead button)."* The operator's always-awake peer makes that window negligible — **which is exactly why §3 (operator peer live) is a hard dependency of rated play, not an optional nicety.**

### Must build / wire
- **A real "witness availability" state** feeding the rated UI: query the canonical witness set for this account over the live fabric; if `< 1` eligible non-player witness is reachable, the rated button degrades to "Waiting for a third machine…" (not disabled-with-no-reason). `RatedLobby` already has the shape; it needs live inputs. **Sizing: Small once the fabric is live.**
- **Casual/link play stays unrestricted** (unwitnessed zone, §4) on all three platforms — that's already the shipped `mp` path, and it must keep working when no witness exists.
- **Per-platform honesty:** desktop (always-on capable), desktop-browser (50 MB, `persist()`), phone browser (15 MB, background-tab throttling ⇒ seen as offline, tolerated — §11). The 2-user boundary manifests differently per platform but the rule is identical.

---

## 7. Genuinely HARD / RISKY vs. straightforward

**Hard / risky (field-reliability, not code-completeness):**
- **NAT traversal reliability.** WebRTC over public STUN + **openrelay** TURN (`rtcTransport.ts:25-42`) is fine for casual demos but is the #1 rated-play availability risk (symmetric NATs, mobile carriers, hostile networks). You will need your own TURN (coturn) as a floor. This is real ops work, not a code change.
- **The always-on third peer.** Rated play *requires* a reachable 3rd machine (§4). The operator peer must be genuinely always-up, relay-reachable, and cheap. Its reliability *is* your rated-play uptime at small scale.
- **Background-tab throttling.** A backgrounded browser tab hosting/ witnessing a game throttles timers → seen as offline (§11; `STATUS.md:147` already flags a needed `visibilitychange` keepalive). Tolerated by spec, but it will drop witnesses mid-game on mobile unless handled.
- **werift bundling in the *production* bundler.** Pure-JS and spike-proven (`STATUS.md:274-278`), but re-prove under electron-builder + `build-server` esbuild; node-datachannel is the documented fallback (`STATUS.md:277`).
- **Mobile-browser storage eviction.** 15 MB budget, eviction = churn (§11). The shard repair loop (`storage/shards.ts runRepair`) is designed for this but has never run live against real eviction.

**Straightforward (because the hard thinking is done):**
- The crypto/protocol determinism (byte-identical node↔browser, proven in real headless Chromium — `STATUS.md:266-270,388-393,484-486`).
- The A-final flag (built, default-ON, reversible, test-covered).
- Passing `signing` into `MpNetSession` (a few lines).
- The `FabricEndpoint` seam being clean enough that a browser TrysteroFabric is a thin variant of the existing operator factory + `rtcTransport.ts`.
- The account-UI un-fixturing (built to flip, badge-by-badge).

---

## 8. Phased, ordered build sequence (with sizing + live-verifiable gate)

Sizing key: **S** ≤ ~2 days · **M** ~3–7 days · **L** ~1–3 weeks (one strong builder). This is a **multi-week program**, not a sprint.

- **P0 — Bring up ONE real fabric + overlay node in the app.** Browser TrysteroFabric (renderer/web), construct `createOverlayNode` + `bootstrap`, persistent shard store (IndexedDB/desktop file). **[M]** *Live gate:* three real machines (2 desktop + 1 browser) see each other in the directory and answer overlay FIND_NODE over real Nostr relays (the A1/A2 spike already hit ~4s connect + 3-peer mesh — `STATUS.md:274-276`).
- **P1 — Deploy the operator peer for real.** Real-relay TrysteroFabric (werift), overlay membership, judge harness, Docker/service + healthcheck, env-configurable relays/TURN. **[M–L]** *Live gate:* operator peer is a reachable, always-up eligible node; a browser client routes to it.
- **P2 — TURN/relay hardening (C-11).** Stand up coturn; make ICE/relay lists configurable; operator-peer-as-fallback. **[M]** *Live gate:* two symmetric-NAT peers connect through your TURN.
- **P3 — Live write-lease.** Drive `witness/lease.ts` over the live fabric against the canonical set; PIN-gated takeover. **[M]** *Live gate:* a device acquires a T_lease-signed lease; a second device sees "playing elsewhere."
- **P4 — The witness peer runner + signed rated game.** Pass `signing` into `MpNetSession` (**S**); build the witness-peer body around `WitnessCore` that joins the mp room, countersigns wclk/wend, and publishes the segment (**L**). **[L]** *Live gate:* **the headline proof** — two machines + a browser play one Blitz game witnessed by a third; both chains carry the matching countersigned segment; ratings fold from the embedded checkpoint.
- **P5 — Rated matchmaking rendezvous.** Overlay-backed advertise/subscribe pool → `pairingLegal` → witness assignment → room handoff; wire the 2-user degradation. **[L]** *Live gate:* two strangers get matched + witnessed without exchanging a code; with no 3rd machine, the button honestly says "waiting for a witness."
- **P6 — Social + verdict transport live.** Run `social/transport.ts` (presence/mailbox/friend-half exchange) and `judge/transport.ts` (verdict publish/adopt + `suppressionScan`) on the live overlay; un-fixture PeopleTab/presence/mailbox/FairPlay. **[M]** *Live gate:* a friend request survives an offline recipient; a sybil flood can't evict it (the §10 invariant, end-to-end).
- **P7 — Account-UI un-fixturing sweep.** Flip remaining `DEV_FIXTURE` surfaces to live data as each transport lands; keep honest badges on anything still pending. **[M]**
- **P8 — Cross-platform parity + degradation hardening.** Background-tab keepalive, mobile storage/eviction under real churn, per-platform capability advertisement, no-dead-buttons audit on macOS + Windows + a phone browser. **[M–L]**
- **P9 — A-final flip + migration.** Only now: confirm the live rated-game proof holds, decide interim→decentralized migration (export/import vs clean break), flip `ACCOUNTS_DECENTRALIZED` (already default-ON), kill interim cookies, update STATUS. **[M]**

**Overall honest sizing:** roughly **8–14 weeks** of focused build for a solid single builder to reach a *reliable* public rated-game across all three platforms — dominated by P4/P5 (the witness runner + matchmaking) and the NAT/TURN/always-on ops reality, not by the (already-done) crypto.

---

## 9. The live acceptance test (what "done" means)

A single scripted run proves the whole thing: **two real machines (one macOS desktop, one Windows desktop) each signed into a decentralized account, plus a third participant in a phone/desktop browser, connect over real relays; two of them play a rated Blitz game that is witnessed by the third; the game's countersigned segment lands in both players' chains; ratings update from the embedded checkpoint; and a *fourth*, fresh browser then reconstructs both players' profiles + the game from shard space with the owners offline.** If that runs green on real networks (not MockFabric), A-final is safe to flip. Until then, "live" and "done" are aspirational — today it is a beautifully-tested library with a mock network.

---

## Appendix — key file:line map

| Claim | Evidence |
|---|---|
| FabricEndpoint seam / MockFabric | `src/shared/accounts/witness/types.ts:324`; `witness/fabric.ts:50` |
| Real node fabric (werift), never mounted | `server/operator/peer.ts:106,192,19-20` |
| Kademlia node over fabric | `src/shared/accounts/overlay/node.ts:108`; `overlay/rpc.ts:107,136` |
| Proven browser WebRTC path | `src/renderer/src/features/play/online/rtcTransport.ts:11,25-42,52-61` |
| Wire v6 + witness role | `src/shared/mp/wire.ts:66,68` |
| mpSession signing/witness seam, unused | `mpSession.ts:181,182,347,359,980,1097,1158,1204` |
| Session constructed unsigned | `mpClient.ts:8` |
| Witness-side core (no runner) | `src/shared/mp/witnessCore.ts:84,248` |
| Social/verdict transport (pure, MockFabric) | `src/shared/accounts/social/transport.ts:299,454,623`; A7 commits `a5a0165`,`87bd7d8` |
| Account UI: real auth, fixtured network | `mock/store.ts:1-18,246-431`; `App.tsx:101`; `RatedLobby.tsx:28,194-195` |
| Judge adapter dormant | `src/web/engines/judge.ts:19,140`; `FairPlayTab.tsx:83` |
| A-final flag (built, default ON) | `server/afinal.ts:72,101-108,117`; `src/web/accountsFlag.ts:53`; `server/index.ts:54,176,184` |
| werift dep pinned/installed; node-datachannel absent | `package.json:107,130`; `STATUS.md:274-278` |
| 2-user boundary / C-10 / C-11 | `ACCOUNTS-SPEC.md` §4, §12 C-10/C-11 |
| Per-platform storage budgets | `ACCOUNTS-PARAMS.md` §Storage; SPEC §11 |
