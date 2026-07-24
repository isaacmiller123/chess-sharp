# A6 kickoff — go live: the running network + social polish. Status: building (2026-07-23).

Chess# decentralized accounts phase **A6** per `docs/building/ACCOUNTS-SPEC.md` §3/§4/§5/§10/§11
and §14-A6, with the **A-final** flip at the end. This is the binding build contract for making
the substrate ACTUALLY WORK LIVE over the internet so anyone can create an account and play
exactly as the spec intends — on macOS desktop, Windows desktop, AND a phone/desktop browser.
Grounding audit: `docs/reviewing/GO-LIVE-AUDIT-2026-07-23.md` (the real-vs-mock-vs-unwired ledger).
Repo `~/chess/chess-sharp`, branch `web-port`. `export PATH=/opt/homebrew/bin:$PATH` first.

═══ OWNER DIRECTIVES ═══
- **The goal is non-negotiable and it is LIVENESS, not more library.** A1–A7 built and proved the
  entire cryptographic/protocol substrate (byte-deterministic node↔browser, 40+ suites green).
  **None of it is wired into the running app.** A6 is the networking/integration/ops program that
  turns the tested library into the live system; A-final then flips off the interim server accounts.
- Every accounts agent runs on **Fable (claude-fable-5)**, pinned per agent, session effort MAX
  (the standing accounts model policy — audit per-agent transcripts, record any Opus fallback).
- Build + test-as-you-build; the lead runs adversarial review after each milestone converges.
- **Desktop stays 100% intact at every milestone** (`npm run build` + the full
  `scripts/test-*.mjs` wall + `npm run typecheck` node/web/server all green).

═══ §0  THE HONEST STARTING STATE (read first) ═══
The one structural fact governing everything: **there is no live accounts transport in the running
app.** The only live P2P is the trystero WebRTC **multiplayer** (`mpClient.ts:8`), and it carries
**unsigned** games — `MpNetSession`'s entire signing/witness path is dead code because no caller
passes `signing` (`mpSession.ts:198` opts, `:291` "unsigned — every shipped caller"). Every
accounts mechanism (witness fabric, overlay, shards, PIN, ratings-from-real-games, judge, social)
is exercised **only over `MockFabric`** (`witness/fabric.ts:50`) in suites. The real
`TrysteroFabric` + operator peer are **never mounted** (`server/operator/peer.ts:19-22`). What a
stock web deploy runs today for "accounts" is the spec-permitted **local/unwitnessed zone**: real
argon2id identity, local chain, recovery export, profile edit (`src/web/accounts.ts`) — every
networked surface in the renderer is a clearly-labeled `DEV_FIXTURE`. **A-final's flag already
defaults ON** (`server/afinal.ts:72`, injected by `scripts/build-server.mjs`), which has *removed
the interim cross-device accounts* while nothing decentralized runs — so today's honest status is
"local-only accounts." A6 closes that gap; A-final is the LAST switch, never flipped before the
live acceptance test passes.

One correction to older framing, load-bearing for hosting: **werift is the clean-bundling path,
node-datachannel is the fallback.** `STATUS.md:274-278` records werift produced an esbuild
self-contained CJS bundle from an empty dir (pure-JS, chosen), while node-datachannel's native
addon breaks isolated bundling. werift 0.23.0 is pinned; node-datachannel is **absent** from
`package.json`. The app itself sidesteps both (browser-native WebRTC); werift is only the
operator/Node path, and its bundling must be re-proven in the *production* bundler, not the spike.

---

## §1  THE END-STATE + THE SINGLE ACCEPTANCE TEST

**End-state:** anyone, anywhere, on any of the three platforms, creates an account by password
derivation (no server row, no email), signs in on any device, and plays real rated chess whose
results write themselves into both players' self-carried chains, witnessed by a third machine —
with ratings, reputation, trust, bans, profiles, friends, presence and mailbox all derived
client-side under identical rules, viewable later even when the owner is offline forever. No dead
buttons: where a third witness or a second player is unavailable, the UI degrades honestly.

**THE acceptance test (the definition of "done" — nothing ships as "live" until this runs green on
real networks, not MockFabric):**

> Two real machines (one macOS desktop, one Windows desktop), each signed into a decentralized
> account, **plus** a third participant in a phone/desktop browser, connect over real public relays.
> Two of them play ONE **rated Blitz** game that is **witnessed by the third** (a peer app instance
> or the operator peer, never a player). The game's **countersigned segment lands in BOTH players'
> chains** (per-move signature chain + witness `wend`, spec §3); **ratings/reputation update from
> the embedded checkpoint**; a Tier-1 judge pass runs on both clients + the witness. Then a
> **fourth, fresh browser** reconstructs both players' profiles + that game from shard space **with
> the original owners offline**, verifying the math itself. Flip A-final only after this holds.

**Honest 2-user degradation (spec §4 / C-10, mandatory, no dead buttons):** with exactly two
machines online and no third reachable, **rated** play is unavailable — the button reads
"Waiting for a witness (a third machine)…", not disabled-with-no-reason — while **casual/link
play stays fully available** (the unwitnessed zone). The operator's always-awake peer makes the
witness-wait window negligible, which is exactly why the operator peer (M2/ops) is a hard
dependency of reliable rated play, not a nicety.

---

## §2  ARCHITECTURE OF LIVE HOSTING

The substrate is written entirely against the platform-neutral **`FabricEndpoint`** seam
(`witness/types.ts:325` — `nodeId · announce · directory · request · onRequest · close`).
`MockFabric` (`fabric.ts:50`) is the in-process double. Going live = giving that seam a **real
transport** on each platform and standing up the **per-client node stack** on top of it. **All
platform-specific hosting lives OUTSIDE `src/shared/accounts` (which stays pure).**

### 2.1  Real transport per platform

- **(a) Browser — the app's transport on ALL THREE platforms.** The Electron desktop renderer is
  Chromium with native `RTCPeerConnection`; the web and phone-browser builds boot the *same*
  renderer (`main.web.tsx:49` → `@/main`). So **one browser fabric module serves desktop-renderer,
  web, and phone browser** — werift is not needed in the app at all. `createBrowserFabric` is
  `createTrysteroFabric` (`peer.ts:192-261`) **minus** the `rtcPolyfill: werift.RTCPeerConnection`
  line (`peer.ts:204`) and reusing `rtcTransport.ts`'s proven ICE config (`rtcTransport.ts:25-42`,
  the *working* live WebRTC path). Same presence-gossip action + single request action + nodeId↔peerId
  map (`peer.ts:217-260`). NEW module, renderer-hosted next to the `mp` singleton (matches how `mp`
  already lives as an app-lifetime object, `mpClient.ts:8`).
- **(b) Electron main (Node/werift) — the operator peer, and an OPTIONAL always-on desktop host.**
  `createTrysteroFabric` already exists (werift, `peer.ts:192`); it has never touched a live relay.
  Its real home is the **operator peer** (`startOperatorPeer`, `peer.ts:106`), deployed as an
  always-awake service (M2/ops). A desktop app MAY additionally host the fabric in its main process
  (werift) for true background witnessing while its window is closed — but the **renderer-hosted
  default is the low-risk path for M1–M6** and is what the acceptance test uses. Bundling
  constraint, concretely: **re-prove werift esbuilds/electron-builds clean under the PRODUCTION
  bundler** (`scripts/build-server.mjs` / electron-builder), not just the empty-dir spike; keep
  node-datachannel as the documented fallback if it misbehaves.

### 2.2  Per-client node stack (every signed-in client runs this, on top of the fabric)

`nodeId = sha256(rootPub)` (`witness/distance.ts nodeIdOf`) → build `{root, key}` device identity
from the session → **`createOverlayNode(fabric, {root,key}, opts)`** (`overlay/node.ts:108`) →
**`bootstrap()`** (`node.ts:431`, seeds from `fabric.directory()`) → register
**`witnessServe`** + **`memberServe`** (`protocol.ts:217,453`) so the client is itself an eligible
witness / committee member → **announce presence** (`SignedPresence`, caps `witness/committee/shardMb`
per platform, §11 budgets) → persistent **KV store** (IndexedDB) behind the overlay/shard layer.
When it plays rated, it threads a `signing` config into `mp`; when it is selected as a witness for
someone else's game, its **witness runner** joins that game's room.

### 2.3  NEW modules and their homes (nothing new inside `src/shared/accounts`)

| Module (NEW) | Home | Role | Milestone |
|---|---|---|---|
| `browserFabric.ts` | `src/renderer/src/features/account/net/` | `FabricEndpoint` over trystero + native WebRTC (all 3 platforms) | M1 |
| `iceConfig.ts` | `src/renderer/…/account/net/` | env-configurable STUN/TURN + operator fallback (C-11); `rtcTransport.ts` reads it too | M1 (ext. M2) |
| `peerService.ts` | `src/renderer/…/account/net/` | `AccountPeer` lifecycle: fabric→overlay→bootstrap, witnessServe+memberServe, presence, per-platform caps | M1 |
| `kvStore.ts` | `src/renderer/…/account/net/` | IndexedDB `CanonicalObject` store (`navigator.storage.persist()`); overlay/shard persistence | M1 (ext. M3) |
| `witnessRunner.ts` | `src/renderer/…/account/net/` | the witness BODY around `WitnessCore`: join room as `hello{role:'witness'}`, emit wclk/wend, publish result | M1 |
| `segmentWriter.ts` | `src/renderer/…/account/net/` | `getSignedGame`+wend+opp-snapshot → `makeSegmentPayload` → lease → `clientAppendWitnessed` → re-fold | M1 |
| `preGame.ts` | `src/renderer/…/account/net/` | signed pre-game head/profile/checkpoint snapshot exchange (M2 promotes to the §3/§8 pairing record) | M1 |
| `matchmaking.ts` | `src/renderer/…/account/net/` | overlay-backed advertise/subscribe pool → `pairingLegal` → witness assignment → room handoff | M2 |
| `leaseRunner.ts` | `src/renderer/…/account/net/` | live `clientRequestLease` lifecycle: epochs, heartbeat renew, PIN-gated takeover, "playing elsewhere" | M2 |
| `shardDuty.ts` | `src/renderer/…/account/net/` | duty assignment + publish-on-write + `runRepair` loop over the live overlay | M3 |
| `viewerClient.ts` | `src/renderer/…/account/net/` | live `resolveProfile` / history pager over the overlay (un-fixtures ProfilePage/Reconstruction) | M3 |
| `socialClient.ts` | `src/renderer/…/account/net/` | presence/mailbox/friend transport over `social/transport.ts` on the live overlay | M4 |
| `pinClient.ts` | `src/renderer/…/account/net/` | live tOPRF provision/verify/fuse over `memberServe` committee | M4 |
| `judgeRunner.ts` | `src/renderer/…/account/net/` | Tier-1 per rated game + Tier-2 escalation + selfban + verdict publish/adopt | M5 |
| operator deploy | `server/operator/` (+ Docker/CI) | mount `startOperatorPeer` live on real relays; TURN/relay ops | M2/ops |

Lead-owned shared groundwork (platform-neutral, the only `src/shared` touches — same discipline as
A4/A5 schema waves): at most one additive `FabricRequestKind` member + zod schema for the pre-game
snapshot (M1), and any additive event-type/param rows a milestone proves it needs (STOP and ask the
lead; builders never edit `types.ts`/`events.ts`/`params.ts`).

---

## §3  MILESTONES M1–M6

Sizing key: **S** ≤ ~2 days · **M** ~3–7 days · **L** ~1–3 weeks (one strong builder). Each
milestone: **file-disjoint lanes** (agents run in parallel without collision), ordered steps,
exists-vs-build (`file:line`), and a **verification** that ends green with desktop intact.

### M1 — Vertical slice: live fabric + witness runner + ONE signed, witnessed, rated game  **[L]**

The headline proof at the smallest scale: 3 app instances (2 players signed in + 1 witness) over
**real relays** play one rated Blitz game; both chains carry the matching countersigned segment;
ratings fold from it. This is the disjoint-lane fleet the lead launches first — see §3-M1 lanes
below and the structured `m1Lanes` return, which govern the M1 build.

**Exists:** `FabricEndpoint`/`MockFabric` (`types.ts:325`, `fabric.ts:50`); `createTrysteroFabric`
(`peer.ts:192`); proven browser WebRTC (`rtcTransport.ts:25-61`); `createOverlayNode`+`bootstrap`
(`node.ts:108,431`); `witnessServe`/`memberServe` (`protocol.ts:217,453`); the **entire** signed-play
+ witness seat in `MpNetSession` (`mpSession.ts:182,347,353,359,980,1008,1097,1158,1204`); the pure
`WitnessCore` brain (`witnessCore.ts:248` — `init/feed/tick/wstream/buildWitnessedResult`);
`makeSegmentPayload`/`verifySegmentEvent` (`segment.ts:342,534`); `clientRequestLease`/
`clientAppendWitnessed` (`protocol.ts:862,931`); the A4 fold already runs in the renderer
(`account/store/derive.ts` `foldChainA4`). The test-mp-v6 harness already drives
`new MpNetSession(f,{signing})` + a `WitnessCore` end-to-end (`scripts/test-mp-v6.mjs:271,344`).

**Must build:** the browser fabric, the peer service, the **witness runner body** (the single
biggest missing runtime piece — `WitnessCore` is the brain, nothing joins a room and *produces*
wclk/wend), the signing wiring into `mp`, the pre-game snapshot exchange, and the segment writer.

**M1 verification (its slice of the acceptance test):**
- Headless multi-client harness (test-mp-v6 style, MockFabric transport): host+guest (both
  `signing`) + a `witnessRunner` + a MockFabric witness endpoint → both chains carry a matching
  rated `segment`, `verifySegmentEvent === null` on both, `verifyChain` green on both, the A4 fold
  moves both ladders off 1200 seeds. **Registers a new `scripts/test-accounts-live-slice.mjs`.**
- **Real-trystero smoke** (playwright, 3 headless Chromium contexts over real Nostr relays): two
  players + one witness complete a signed Blitz game; assert both chains persisted with the
  segment. This is the first time the browser fabric touches a live relay.
- Desktop-intact gate + typecheck ×3 green.

### M2 — Overlay-backed matchmaking + live write-lease + rated ladders from real games  **[L]**

**Exists:** `pairingLegal`/width curve/pools (`mm/pairing.ts`); `clientRequestLease` honest
degradation (`protocol.ts:862`, returns `insufficient-witnesses`, never a dead grant); lease
epochs/takeover/PIN-session shapes (`witness/types.ts:75-127,254`, `witness/lease.ts`);
`makePairingPayload` (`ratings/conduct.ts:263`, the §3/§8 both-chains anchor); the witness's
pairing gate (`witnessCore.ts:489`). `RatedLobby.tsx`/`TrustWidthMeter.tsx` are DEV_FIXTURE.

**Must build (lanes):** **(L-mm)** `matchmaking.ts` — overlay advertise/subscribe rated pool keyed
by ladder, `pairingLegal` both-client legality check, witness assignment from the canonical set,
hand all three a room code; wire the 2-user degradation into `RatedLobby`. **(L-lease)**
`leaseRunner.ts` — acquire a live `T_lease`-of-canonical-set lease with a monotonic epoch before the
witnessed append, heartbeat-renew (PARAMS_A2 `leaseTtlMs`/heartbeat), PIN-gated takeover, second
device sees "playing elsewhere"; promote M1's `preGame.ts` into the real `'pairing'` witnessed event
anchored in both chains (`witnessCore.ts:391` gate goes live). **(L-ladders)** un-fixture
`RatedLobby`/`TrustWidthMeter`/`RatingLadders` to the real fold outputs from M1 games.

**Verification:** headless harness — a rated pool pairs two strangers by legality, assigns a
witness, both hold a `T_lease` lease at one epoch, a second device is refused with "playing
elsewhere"; a forced same-epoch double-append is slashed (`witness/slash.ts`). Real-trystero smoke:
two strangers matched + witnessed **without exchanging a code**; with no third machine the rated
button honestly waits. Desktop-intact gate.

### M3 — Live storage: shard duty/publish/repair, authenticated pointers, reconstruction viewing  **[L]**

**Exists (the §5 proof is fully built + tested):** RS 40/12 codec (`storage/rs.ts`); shard duty +
publish + `finalSync` + `runRepair` (`storage/shards.ts:373,461,490,908`); authenticated pointers
(`storage/pointers.ts:406,706,758,853`); the reconstruction viewer `resolveProfile`/
`readChainFromShards`/`openHistory` (`storage/viewer.ts:730,386,1129`) — all proven bit-faithful in
`scripts/test-accounts-reconstruct.mjs` (1,000 games, owner gone, fresh viewer reconstructs).

**Must build (lanes):** **(L-duty)** `shardDuty.ts` — on each witnessed write, publish the segment
pointer + shards to the distance-assigned carriers over the live overlay; run the background repair
loop (eviction = churn = healed). **(L-store)** promote `kvStore.ts` to the real persistent shard
budget per platform (desktop 200 MB / desktop-browser 50 MB + `persist()` / mobile 15 MB, §11) and
wire `makeShardStoreValidator`/`makePointerStoreValidator` as the overlay store gates. **(L-view)**
`viewerClient.ts` — un-fixture `ProfilePage.tsx`/`ReconstructionCard.tsx`/`ChainViewer`/`StoragePanel`
to live `resolveProfile` + lazy history over the overlay.

**Verification:** the §5 acceptance scenario **live** — after an M1/M2 game, kill the owner's node;
a **fourth fresh browser** reconstructs profile + newest checkpoint + head + game from shard space,
verifying the math. Degraded `<K_rec` → honest temporary unavailability → `runRepair` heals.
Playwright reconstruction smoke + desktop-intact gate.

### M4 — Live social + PIN committee + presence + mailbox; un-fixture the account UI (~22 surfaces)  **[M–L]**

**Exists:** `social/transport.ts` (presence/mailbox/friend-half — `createSocialRelay:454`,
`publishSocialPresence:299`, `sendSocialMail:543`, `drainSocialMailbox:623`, `makeFriendHalf:744`,
`adoptFriendConsent:869`); `social/{friends,presence,mailbox,profile}.ts` folds; the tOPRF committee
(`witness/{pin,oprf,shamir,counters}.ts`, `pinVerifyFlow:1034`, `tripFuseIfDue:1179`). The ~22
`DEV_FIXTURE` surfaces are built to flip badge-by-badge (`account/mock/store.ts` doc).

**Must build (lanes, disjoint by surface):** **(L-presence-mail)** `socialClient.ts` — run
presence/mailbox over the live overlay + `createSocialRelay`; anti-spam quotas enforced end-to-end;
un-fixture `PeopleTab`/presence/mailbox. **(L-friends)** live friend request→consent countersigned
edges (`makeFriendHalf`/`adoptFriendConsent`) via mailbox; un-fixture the friends UI. **(L-pin)**
`pinClient.ts` — live committee provision/verify/fuse; un-fixture `PinSetupWizard`/`PinEntryDialog`/
`FuseBanCard`. **(L-ui)** sweep the remaining fixtures (`OverviewSection`/`SecurityTab`/
`GameChromeShowcase`/`WitnessStrip`/`ProfileTab`) to live data; keep an honest badge on anything a
transport hasn't reached yet — **no dead buttons**.

**Verification:** a friend request survives an offline recipient and a sybil flood can't evict it
(the §10 invariant, live); a PIN sets up + a wrong-PIN streak trips the fuse over the live
committee; every un-fixtured surface drops its `FixturePreviewBadge`. Extend
`test-web-accounts-wiring`. Desktop-intact gate.

### M5 — Live anticheat: Tier-1 per rated game, Tier-2 escalation, self-ban, verdict records  **[M–L]**

**Exists:** the canonical judge (hash-pinned single-thread WASM, `src/web/engines/judge.ts` +
`judge/{judge,tier1,tier2,anchors,embed}.ts`); the A5→A6 embedder seams already built
(`judge/embed.ts` — `banDeadline:164`, `consensusSaltOpts:250`, `suppressionScan:362`,
`publishVerdictRow:444`, `adoptVerdictRowJudge:581`). `FairPlayTab`/`VerdictViewer`/`JudgeReceipts`
are DEV_FIXTURE with a **fake** hash.

**Must build (lanes):** **(L-t1)** `judgeRunner.ts` Tier-1 — after each rated game, both clients +
the witness run the pinned judge in a worker, feed the Tier-1 signals into trust; salt grants via
`clientRequestSaltGrant` (`protocol.ts:851`, the A5-17 signing-time discipline). **(L-t2)** the
deterministic escalation → Tier-2 deep analysis → 5σ conviction self-ban appended before any further
witnessed event → publish verdict rows to shard space (`publishVerdictRow`/`adoptVerdictRowJudge`) +
`suppressionScan` on the live overlay. **(L-ui)** un-fixture `FairPlayTab`/`VerdictViewer`/
`JudgeReceipts`/`SelfBanDialog` to the real judge + the **real** pinned hash.

**Verification:** the A5 proof, live — a seeded cheater is convicted within the K-window and
self-bans; an honest holdout is never flagged; verdict bits are identical desktop/browser (the
existing playwright judge-parity gate) — over the live overlay this time. Desktop-intact gate.

### M6 / A-final — Cross-platform walkthrough + flip off interim server accounts  **[M]**

**Must do:** run the **full acceptance test** (§1) on macOS + Windows + a phone browser; a
no-dead-buttons audit on all three; background-tab keepalive + mobile eviction under real churn
(§11, the `visibilitychange` item `STATUS.md:147`). Then, and only then, **A-final**: confirm the
live rated-game + reconstruction proofs hold; decide interim→decentralized migration (below); keep
`ACCOUNTS_DECENTRALIZED` ON (already default), kill interim cookies, update `STATUS.md`.

**Verification:** the single scripted acceptance run green on real networks; `test-afinal-flag`
green; desktop + web + server builds green. This is the "it works" gate for the whole program.

---

## §3-M1  MILESTONE 1 — FILE-DISJOINT LANES (the fleet the lead launches now)

Five lanes, zero file overlap. Shared interfaces are declared here so lanes compile independently
against typed stubs and integrate at the lead step. Lead groundwork (before launch): add the single
additive `FabricRequestKind` member + zod schema for the pre-game snapshot (the only `src/shared`
touch); everything else is renderer-hosted.

**Lane A — Browser fabric transport + ICE config.**
- Owns: `src/renderer/src/features/account/net/browserFabric.ts` (NEW),
  `src/renderer/src/features/account/net/iceConfig.ts` (NEW),
  `src/renderer/src/features/play/online/rtcTransport.ts` (edit: read ICE from `iceConfig.ts`).
- Steps: (1) extract `ICE_SERVERS` (`rtcTransport.ts:25-42`) into `iceConfig.ts` with an env/config
  hook (C-11 replaceability) + operator-fallback slot; `rtcTransport.ts` imports it (behavior
  byte-identical). (2) `createBrowserFabric(opts): FabricEndpoint` — port `createTrysteroFabric`
  (`peer.ts:192-261`) verbatim MINUS `rtcPolyfill` (`:204`); native `RTCPeerConnection`; presence
  action + single request action `{kind,payload}`; nodeId↔peerId map from verified presence
  (`peer.ts:279-291`). (3) inject the trystero room as a constructor param so the frame/dispatch
  logic is unit-testable headless.
- Verify: node unit test with an injected fake room — announce populates `directory()`, `request`
  round-trips a framed `CanonicalObject`, unknown-kind returns `{error}`, `close` leaves. Real relay
  reachability is proven in the lead playwright smoke.

**Lane B — Account peer service + overlay bootstrap + persistent KV.**
- Owns: `src/renderer/src/features/account/net/peerService.ts` (NEW),
  `src/renderer/src/features/account/net/kvStore.ts` (NEW).
- Steps: (1) `kvStore.ts` — IndexedDB `CanonicalObject` KV (`navigator.storage.persist()`), the
  overlay/shard store adapter. (2) `peerService.ts` — `AccountPeer` lifecycle: from a signed-in
  identity derive `nodeId = nodeIdOf(rootPub)`, build `{root, key}`, construct fabric (injected;
  Lane A in prod) → `createOverlayNode(fabric,{root,key},opts)` (`node.ts:108`) → `bootstrap()`
  (`node.ts:431`) → register `witnessServe` + `memberServe` (`protocol.ts:217,453`) → announce
  presence with per-platform caps (`witness:true, committee:true, shardMb` per §11). App-lifetime
  singleton, started on sign-in, stopped on sign-out.
- Verify: `MockFabric` multi-endpoint unit test (peerService is fabric-agnostic) — 3 peers announce,
  bootstrap, answer `overlay-find-node`, and are mutually reachable; nodeId derivation matches
  `nodeIdOf`. Integrates with Lane A's real fabric in the lead smoke.

**Lane C — Signing wiring into mp (players).**
- Owns: `src/web/accounts.ts` (edit: additive export),
  `src/renderer/src/features/play/online/mpSession.ts` (edit: additive method),
  `src/renderer/src/features/play/online/mpClient.ts` (edit),
  `src/renderer/src/features/play/online/onlineStore.ts` (edit: rated-game wiring + segment call site).
- Steps: (1) `src/web/accounts.ts` — add `deviceSigningKey(): { priv: Uint8Array; key: string;
  root: string } | null` (additive), deriving the device child privkey exactly as `updateProfile`
  does (`deriveChild(identity.seed, KEY_PURPOSE.device, account.device.index)`, `accounts.ts:422`);
  returns `{priv: device.priv, key: account.device.pub, root: account.rootPub}`. (2) `mpSession.ts`
  — add `configureSigning(cfg: MpSigningConfig | null): void` guarded to pre-`host()`/`join()` (sets
  the currently-`readonly` `signing`; the field lifecycle already resets per game). (3) `mpClient.ts`
  / `onlineStore.ts` — when both players are signed in and the game is rated, call
  `mp.configureSigning(deviceSigningKey())` before `mp.host()`/`mp.join()` (`onlineStore.ts:768,778`),
  and pin `oppRoot` when known. (4) at game-over (`onlineStore.ts:699` + resign/flag paths), invoke
  Lane E's `buildAndPublishSegment(...)` with `mp.getSignedGame()` (`:359`) + `mp.getWitnessIdentity()`
  (`:353`) + the witness `wend` collected via `mp.onWitnessStream()` (`:347`).
- Verify: extend `scripts/test-mp-v6.mjs` — a signed host+guest over the mock pair reach a terminal
  and expose a complete `getSignedGame()` + verified `wend`; unsigned casual play stays byte-identical.

**Lane D — Witness runner body.**
- Owns: `src/renderer/src/features/account/net/witnessRunner.ts` (NEW).
- Steps: (1) `witnessRunner(roomCode, gameInit, witnessIdentity)` — join the mp game room (via
  `createRtcTransport`/a witness transport), send `hello{v:6, role:'witness', root, key}`
  (`mpSession.ts:887,980` seats it). (2) drive a `WitnessCore` (`witnessCore.ts:248`):
  `init(WitnessGameInit)` from the mirrored `start` (gameKey/players/firstMover/kind/tc/pairing),
  `feed(msg, wts)` each committed message, `tick(wts)` for observed flags, broadcast every emitted
  wclk/wend back to both players. (3) on terminal, `buildWitnessedResult()` (`:336`) + serve the
  segment `attest` for both players via the peer's `witnessServe` (Lane B). In M1 the room code is
  handed to the witness manually (dev flow); M2 matchmaking assigns it.
- Verify: 3-session harness (test-mp-v6 style) — host+guest signed + a `witnessRunner`; assert the
  witness emits a valid `wend` both players verify, and `buildWitnessedResult()` is well-formed.

**Lane E — Segment writer + pre-game snapshot + chain append.**
- Owns: `src/renderer/src/features/account/net/segmentWriter.ts` (NEW),
  `src/renderer/src/features/account/net/preGame.ts` (NEW). (Consumes the lead's one shared
  `FabricRequestKind` member.)
- Steps: (1) `preGame.ts` — before move 1, each player exchanges a **signed** snapshot
  `{ head, height, profileSnapshot, latestCheckpoint? }` with the opponent over the fabric request
  channel (keyed by opp nodeId); this supplies the segment's `heads`/`oppProfile`/`oppCkpt`
  (`segment.ts:342` `MakeSegmentOpts`). This is the M2 `'pairing'` record's precursor. (2)
  `segmentWriter.ts` — `buildAndPublishSegment(...)`: from `getSignedGame()` + the witness `wstream`
  + the opp snapshot, call `makeSegmentPayload({game,opp,color,result,reason,moves,heads,wstream,
  oppCkpt?,oppProfile,kind,tc})`; acquire a minimal lease via `clientRequestLease` (`protocol.ts:862`
  — at 1-witness scale `effectiveThreshold` floors to 1); append via `clientAppendWitnessed`
  (`protocol.ts:931`, gathers the witness's non-player attestation); `keyring.saveChain`; re-derive
  the fold (`derive.ts foldChainA4`) so ladders update. Both players run this independently for their
  own chain, embedding the SAME witness `wstream`. First game between two fresh accounts omits
  `oppCkpt` (young opponents → §6 seeds 1200/350) — correct and honest.
- Verify: NEW `scripts/test-accounts-live-slice.mjs` — two chains + a `WitnessCore` wstream over a
  MockFabric witness → both chains carry matching rated `segment`s, `verifySegmentEvent === null`,
  `verifyChain` green on both, the fold moves both ladders. This suite is the M1 slice proof.

**Lead integration (after A–E converge):** wire `peerService` (B) + `browserFabric` (A) into the
renderer boot next to `mp`; connect Lane C's game-over call site to Lane E's writer and Lane D's
runner; stand up the **playwright 3-context real-trystero smoke** (2 players + 1 witness over real
relays → both chains persisted with the segment). Register both new suites in `package.json` +
`.github/workflows/build.yml` (the mock-transport slice runs in CI; the real-relay + engine smokes
gate local-only like `operator-smoke`/`test-judge-node`). Full wall + typecheck ×3 + desktop build
green.

---

## §4  OPERATOR PEER / RELAY / TURN — THE OPS REALITY

**What an always-on peer takes (spec §11 two integrations, both coded):** `startOperatorPeer`
(`peer.ts:106`) already wires `witnessServe` + `memberServe` + the content-hash-pinned canonical
judge (`newNodeJudgeEngine`, `peer.ts:120`) over `createTrysteroFabric` (werift). To run it for
real: (1) bring it up against **real Nostr relays once** — it has never left MockFabric
(`operator-smoke.mjs` marks the trystero path "never entered"); handle reconnect/backoff + relay
churn. (2) it should join the overlay as a real member (`createOverlayNode`+`bootstrap`) rather than
"serve whoever reaches it" (`peer.ts:186-190`). (3) deploy surface: a sidecar process in the
existing Docker image or a separate always-on service — identity/keypair provisioning + `dataDir`
persistence, healthcheck, restart policy, logging. It stays **protocol-optional, unprivileged,
removable** (C-10): its only privilege is being awake.

**TURN config (C-11):** today signaling rides third-party Nostr relays + **openrelay** public TURN
(hardcoded, `rtcTransport.ts:31-41`). C-11 requires these be replaceable with the operator peer as
fallback. Concretely: make relay/TURN lists env-configurable (Lane A's `iceConfig.ts`); stand up
your own **coturn** as the symmetric-NAT reliability floor for rated play; let the operator peer act
as relay-of-last-resort. Public openrelay is fine for a demo but is a real availability risk for
rated games.

**Running the LIVE acceptance test in THIS dev environment (achievable NOW):** multi-process
localhost + real public Nostr relays already works (the A1/A2 spike hit ~4s connect + a 3-peer mesh,
`STATUS.md:274-276`). Concretely: run three app instances (e.g. two `npm run dev:web` browser tabs +
one more, or desktop `npm run dev` + a browser), each signed into a distinct account; two host/join a
rated Blitz game, the third runs the witness runner for that room; assert both chains persist the
segment and a fourth fresh tab reconstructs. **A cloud deploy is only a packaging step** on top of
this — the protocol does not care whether the third peer is localhost or a datacenter.

**Honest limits (state everywhere):** WebRTC over public STUN/TURN is the #1 rated-play availability
risk (symmetric NATs, mobile carriers, hostile networks) — your own coturn is the floor, and that is
ops work, not a code change. Rated play genuinely **requires a reachable third machine** (§4); the
operator peer's uptime *is* your small-scale rated uptime. Backgrounded browser tabs throttle → seen
as offline (§11, tolerated) — needs the `visibilitychange` keepalive or a witness will drop mid-game
on mobile.

---

## §5  A-FINAL: SAFE-DEFAULT + MIGRATION

**Never ship account-less.** The flag is built, reversible, and **defaults ON**
(`server/afinal.ts:72`; `resolveAccountsFlag:60`; `registerInterimAuthGate:117` gates ONLY
`/api/auth*`; content plane + existing interim cookies untouched, `afinal.ts:24-32,101-108`).
**Rule:** A-final flips ON only AFTER the §1 acceptance test passes live — turning it ON while the
decentralized path can't host a game or reconstruct a profile online strands users (exactly today's
gap). Until M6, keep the emergency OFF lever documented (`ACCOUNTS_DECENTRALIZED=0` → interim system
fully intact). The build default stays ON so no bundle ever ships account-less-by-omission, but the
go-live checklist treats the live proof as the real gate, not the flag.

**Migration / coexistence:** interim accounts live in `server.sqlite` + per-user `app.sqlite`;
decentralized identity is password-derived (no server row) — there is **no automatic bridge**, and a
user's interim games/ratings do not become chain history. Decide (M6): (a) a one-time export/import
of local progress into the fresh account (precedent: `src/web/migrate.ts` already copies localStorage
→ account on signup), or (b) an honest clean break with clear copy. Either way, kill interim cookies
at the flip and update `STATUS.md` (it trails the tree — the A7 commits have no STATUS entry) so the
go-live checklist is trustworthy.

---

## §6  CONVENTIONS + QUALITY GATES (every milestone)

- **Desktop 100% intact, every milestone:** `npm run build` (electron-vite) + the full
  `scripts/test-*.mjs` wall + `npm run typecheck` (node/web/server) all green. Web + server builds
  (`build:web`, `build:server`) green.
- **`src/shared/accounts/**` and `src/shared/mp/**` stay platform-neutral** — no `node:` imports, no
  DOM globals, no ambient `Date.now()`/`Math.random()`; they typecheck under BOTH node and web
  tsconfigs. **All new hosting code is platform-specific** and lives in `src/renderer/**`,
  `src/main/**`, `src/web/**`, or `server/**`. The only permitted `src/shared` touches are additive,
  lead-owned schema rows (`types.ts`/`events.ts`/`params.ts`) — builders STOP and ask.
- **File-disjoint lanes**; agents run on **Fable at MAX effort**, pinned per agent; build+test as you
  build (suite green before reporting); the lead runs adversarial review after convergence.
- **No dead buttons** — honest degradation when witnesses/peers are scarce (the 2-user rated
  boundary; every not-yet-live surface keeps its `FixturePreviewBadge`).
- **Determinism preserved** — every fold/verdict/score stays byte-identical node↔browser (the
  playwright parity gates); engine-heavy suites gate local-only like `test-judge-node`/`operator-smoke`,
  never in the default CI wall.
- Each milestone ends **green**, with its slice of the §1 acceptance test demonstrated.

---

## §7  Appendix — key file:line map

| Seam | Evidence |
|---|---|
| `FabricEndpoint` / `MockFabric` | `src/shared/accounts/witness/types.ts:325`; `witness/fabric.ts:50` |
| Real node fabric (werift), unmounted | `server/operator/peer.ts:106,192,204,19-22` |
| Browser WebRTC (proven) + ICE | `src/renderer/src/features/play/online/rtcTransport.ts:25-42,52-61` |
| Overlay node + bootstrap | `src/shared/accounts/overlay/node.ts:108,431` |
| Witness/member serve; lease + append clients | `src/shared/accounts/witness/protocol.ts:217,453,862,931` |
| mp signing/witness seam, unused | `mpSession.ts:182,198,291,347,353,359,980,1008,1097,1158,1204` |
| Session constructed unsigned | `src/renderer/src/features/play/online/mpClient.ts:8` |
| WitnessCore (brain, no body) | `src/shared/mp/witnessCore.ts:84,248,336,352,445` |
| Segment build/verify | `src/shared/accounts/segment.ts:342,467,534`; wire v6 `src/shared/mp/wire.ts:66` |
| Storage: shards/pointers/viewer | `storage/shards.ts:373,461,490,908`; `pointers.ts:406,706,758,853`; `viewer.ts:386,730,1129` |
| Social + judge transport (pure) | `social/transport.ts:299,454,543,623,744,869`; `judge/embed.ts:164,362,444,581` |
| Web accounts glue (signing source) | `src/web/accounts.ts:385,392,413,422` |
| Renderer store + fixtures | `account/mock/store.ts`; `account/store/derive.ts`; ~22 `DEV_FIXTURE` surfaces |
| A-final flag (built, default ON) | `server/afinal.ts:60,72,101-108,117`; `src/web/accountsFlag.ts`; `main.web.tsx:48` |
| werift clean-bundle; node-datachannel absent | `package.json` (werift 0.23.0 pinned); `STATUS.md:274-278` |
| The §5 reconstruction proof (built) | `scripts/test-accounts-reconstruct.mjs` |
