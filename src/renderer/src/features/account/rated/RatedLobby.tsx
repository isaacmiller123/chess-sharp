import { useEffect, useState, type JSX } from 'react'
import {
  CircleCheck,
  EyeOff,
  Flame,
  FlaskConical,
  Handshake,
  Infinity as InfinityIcon,
  Loader2,
  Network,
  Rabbit,
  ShieldCheck,
  Swords,
  Turtle,
  UserRound,
  Users,
  Zap
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  pairingLegal,
  spectatorOpponentInfo,
  type OpponentInfo,
  type PairView
} from '@shared/accounts/mm/pairing'
import { pairViewOf } from '@shared/accounts/ratings/display'
import { trustT } from '@shared/accounts/mm/trust'
import type { LadderKey, RatingDisplay, UiLadder, UiOwnAccount } from '../mock/types'
import { DEV_FIXTURE, OVERLAY_STATUS, OWN_ACCOUNT, PROFILES, WITNESS_SET } from '../mock/fixtures'
import { FixturePreviewBadge } from '../mock/FixturePreviewBadge'
import { useAccountsUi } from '../mock/store'
import { foldChainA4 } from '../store/derive'
import { MM_DEFAULT_TC, ladderIdOf, matchmakingStore, useMatchmaking } from '../net/matchmaking'
import { loadOwnChain } from '../../../../../web/accounts'
import { TrustWidthMeter } from './TrustWidthMeter'
import './rated.css'

/**
 * Rated lobby (A-UI preview) — the §7 matchmaking surface, rendered honestly:
 * ladder display states straight from the SHARED §6 authority (fixtures derive
 * them via displayState()), the §4 no-witness boundary as an explained
 * degradation instead of a dead button, and §9's fresh-root pricing named
 * where a hidden ladder is selected. Mock state machine only — the search is
 * setInterval theater over fixtures, and says nothing a compliant client
 * couldn't truthfully render: no trust number, no exact ±window (§7
 * "invisible" — see TrustWidthMeter), no opponent brackets to a provisional
 * viewer (§6), and every showcased pairing passes the shared pairingLegal on
 * its own fixture values (asserted below).
 */

/** Preview trust for the signed-in account, micro-units (§7: recomputable by
 * anyone). Feeds the meter's geometry only — never rendered as a number. */
const PREVIEW_TRUST_MICRO = 820_000
/** Demo opponent trust (above the island gate; spillover legality ignores T). */
const DEMO_OPP_TRUST_MICRO = 700_000

/** The demo pairing opponent for the found card. */
const DEMO_OPP = PROFILES['newbie#F2PLC']

const ALL_LADDERS: LadderKey[] = ['Bullet', 'Blitz', 'Rapid', 'Classical']

/** Ticks of the mock search before a pairing lands (~4 s). */
const SEARCH_TICKS = 5
const SEARCH_TICK_MS = 850

const LADDER_ICON: Record<LadderKey, LucideIcon> = {
  Bullet: Zap,
  Blitz: Flame,
  Rapid: Rabbit,
  Classical: Turtle
}

/** §6 display states, rendered identically by every compliant client. */
function displayLabel(d: RatingDisplay): string {
  if (d.state === 'ranked') return String(d.rating)
  // §9: an active ban is a public fact — rendered honestly to everyone.
  if (d.state === 'banned') return 'Banned'
  if (d.state === 'provisional') return `Provisional ${d.n}/${d.of}`
  return `Placement ${d.n}/${d.of}`
}

/**
 * Both sides of the showcased pairing for one ladder, as the shared PairView
 * projections both clients would build from public data. Exported so the UI
 * suite (scripts/test-a4-ui.mjs, A4-26) can assert the EXACT views this
 * surface renders satisfy mm/pairing.ts pairingLegal — not a reconstruction.
 */
export function demoPairViews(key: LadderKey): { own: PairView; opp: PairView } | null {
  const ownL = OWN_ACCOUNT.ladders.find((l) => l.key === key)
  const oppL = DEMO_OPP?.ladders.find((l) => l.key === key)
  if (!ownL || !oppL || !DEMO_OPP) return null
  return {
    own: pairViewOf(OWN_ACCOUNT.rootPub, `chess:${key}`, ownL.state, PREVIEW_TRUST_MICRO, key),
    opp: pairViewOf(DEMO_OPP.rootPub, `chess:${key}`, oppL.state, DEMO_OPP_TRUST_MICRO, key)
  }
}

// A4-26 invariant: every pairing this showcase can render must satisfy the
// shared pairingLegal on its own fixture values — the demo can never regress
// into demonstrating a pairing the protocol rejects (e.g. a spillover across
// bracket rails). Runs once at module load in dev builds, and the UI suite
// (scripts/test-a4-ui.mjs) re-asserts it per ladder on every run with DEV
// armed, so a regression fails CI in any build mode.
// A4-16 note: pairingLegal REQUIRES atWts — the pairing record's witnessed
// timestamp both clients share; PairView.tMicro must be trustT evaluated at
// that same instant. DEMO_PAIRING_WTS is this showcase pairing's pinned wts
// (exported for the suite): the demo trust values are fixture constants, not
// time-evaluated trustT, so the constant instant is exact for the demo.
export const DEMO_PAIRING_WTS = 1_700_000_000_000
if (import.meta.env.DEV) {
  for (const key of ALL_LADDERS) {
    const pv = demoPairViews(key)
    if (!pv) throw new Error(`RatedLobby demo: missing fixture ladder ${key}`)
    const verdict = pairingLegal(pv.own, pv.opp, DEMO_PAIRING_WTS)
    if (!verdict.legal) {
      throw new Error(
        `RatedLobby demo pairing on ${key} is ILLEGAL under mm/pairing.pairingLegal: ${verdict.reason}`
      )
    }
  }
}

type SearchPhase = 'idle' | 'searching' | 'found'
type FoundView = 'ranked' | 'provisional'

/** Initial mock-machine state, for showcase embeds and the UI suite
 * (scripts/test-a4-ui.mjs pins the found-card §6/§7 rules per ladder, A4-26/
 * A4-27). Absent members keep the product defaults; the app renders
 * `<RatedLobby />` untouched. */
export interface RatedLobbyInitial {
  ladder?: LadderKey
  phase?: SearchPhase
  view?: FoundView
}

/**
 * The DEV_FIXTURE showcase — the §6/§7 matchmaking SURFACE demonstrated over
 * sample data (a mock search machine, a demo spillover opponent). Reached ONLY
 * when a caller passes `initial` (the A4-UI conformance suite + showcase embeds
 * that pin the found-card rules per ladder). The app's live `<RatedLobby />`
 * (no `initial`) renders `RatedLobbyLive` instead. This body is unchanged from
 * the preview build so its shared-projection invariants stay asserted.
 */
function RatedLobbyShowcase({ initial }: { initial: RatedLobbyInitial }): JSX.Element {
  const [ladderKey, setLadderKey] = useState<LadderKey>(initial?.ladder ?? 'Blitz')
  const [phase, setPhase] = useState<SearchPhase>(initial?.phase ?? 'idle')
  const [view, setView] = useState<FoundView>(initial?.view ?? 'ranked')
  const [noWitness, setNoWitness] = useState(false)

  // Mock matchmaking: tick a few times, then land a pairing. The widening
  // itself is deliberately not narrated in numbers (§7: invisible).
  useEffect(() => {
    if (phase !== 'searching') return undefined
    let ticks = 0
    const id = window.setInterval(() => {
      ticks += 1
      if (ticks >= SEARCH_TICKS) setPhase('found')
    }, SEARCH_TICK_MS)
    return () => window.clearInterval(id)
  }, [phase])

  const ladder = OWN_ACCOUNT.ladders.find((l) => l.key === ladderKey)
  /** §6: provisional/placement — this account's surfaces show no numbers here. */
  const hiddenLadder = ladder ? ladder.display.state !== 'ranked' : false
  const witness = WITNESS_SET.find((w) => w.role === 'witness' && w.online)
  const witnessesUp = noWitness ? 0 : OVERLAY_STATUS.witnessesReachable

  // §6 (A4-27): the ranked/spectator preview of the pairing is only reachable
  // when the signed-in account is RANKED on the selected ladder. A placement/
  // provisional viewer's client never renders an opponent bracket.
  const effectiveView: FoundView = hiddenLadder ? 'provisional' : view

  // What the ranked-view card may show about the opponent — the SHARED §6
  // spectator projection (bracket for a hidden opponent, rating once ranked).
  const pv = demoPairViews(ladderKey)
  const oppInfo: OpponentInfo | null = pv ? spectatorOpponentInfo(pv.opp) : null

  function pickLadder(key: LadderKey): void {
    setLadderKey(key)
    setPhase('idle')
  }

  function startSearch(): void {
    if (noWitness) return
    // Default the found-card preview to the side the user is actually on.
    setView(hiddenLadder ? 'provisional' : 'ranked')
    setPhase('searching')
  }

  function cancelSearch(): void {
    setPhase('idle')
  }

  function toggleNoWitness(): void {
    const next = !noWitness
    setNoWitness(next)
    if (next) cancelSearch()
  }

  return (
    <section className="panel arate-lobby" aria-label="Rated lobby">
      <header className="panel-head arate-head">
        <span className="arate-head-icon" aria-hidden>
          <Swords size={15} />
        </span>
        <h3 className="panel-title">Rated lobby</h3>
        {DEV_FIXTURE && (
          <FixturePreviewBadge label="Sample matchmaking — awaiting network transport" />
        )}
        <span className={`arate-net num${witnessesUp > 0 ? ' is-ok' : ' is-out'}`}>
          <Network size={12} aria-hidden />
          {witnessesUp > 0 ? `${witnessesUp} witnesses reachable` : 'no witness reachable'}
        </span>
        <button
          type="button"
          className={`arate-sim${noWitness ? ' on' : ''}`}
          aria-pressed={noWitness}
          onClick={toggleNoWitness}
        >
          <FlaskConical size={12} aria-hidden /> Preview: no witness reachable
        </button>
      </header>

      <div className="arate-body">
        <div className="arate-col">
          <span className="arate-label" id="arate-ladder-label">
            Ladder
          </span>
          <div className="arate-ladders" role="group" aria-labelledby="arate-ladder-label">
            {OWN_ACCOUNT.ladders.map((l) => {
              const Icon = LADDER_ICON[l.key]
              const on = l.key === ladderKey
              const ranked = l.display.state === 'ranked'
              return (
                <button
                  key={l.key}
                  type="button"
                  className={`arate-ladder${on ? ' on' : ''}`}
                  aria-pressed={on}
                  onClick={() => pickLadder(l.key)}
                >
                  <span className="arate-ladder-name">
                    <Icon size={14} aria-hidden /> {l.key}
                  </span>
                  <span className={`arate-ladder-state num${ranked ? ' is-ranked' : ''}`}>
                    {displayLabel(l.display)}
                  </span>
                </button>
              )
            })}
          </div>

          {hiddenLadder && (
            <p className="arate-hidden-note">
              <EyeOff size={13} aria-hidden />
              <span>
                Until your {ladderKey} rating reveals, you&rsquo;ll see an{' '}
                <b>Unranked opponent pool</b> — no opponent ratings or brackets anywhere:
                matchmaking, in-game, or post-game. Every fresh root re-pays this judged, hidden
                stretch — that&rsquo;s what prices rerolling.
              </span>
            </p>
          )}

          <p className="arate-unlimited">
            <InfinityIcon size={13} aria-hidden />
            No Unlimited ladder — without a clock stream there are no timing forensics, so
            unlimited games are unrated by design.
          </p>
        </div>

        <div className="arate-col">
          <TrustWidthMeter tMicro={PREVIEW_TRUST_MICRO} sample />
        </div>

        <div className="arate-flow">
          {phase === 'idle' && (
            <div className="arate-idle">
              <button
                type="button"
                className="btn arate-play"
                onClick={startSearch}
                disabled={noWitness}
              >
                <Swords size={16} aria-hidden /> Play rated
              </button>
              {!noWitness && (
                <span className="arate-idle-sub">
                  {hiddenLadder
                    ? `${ladderKey} · unranked pool — provisionals pair with provisionals first`
                    : `${ladderKey} · the window opens tight around your rating — trust earns precision`}
                </span>
              )}
            </div>
          )}

          {phase === 'idle' && noWitness && (
            <div className="arate-unavail" role="status">
              <span className="arate-unavail-icon" aria-hidden>
                <Network size={16} />
              </span>
              <span>
                <b>Rated play is unavailable until a third machine appears.</b> Every rated game
                needs a witness that is neither player — with exactly two machines online and no
                third reachable, rated play waits for one. The operator&rsquo;s always-awake peer
                makes this window negligible. Casual and offline play are unaffected.
              </span>
            </div>
          )}

          {phase === 'searching' && (
            <div className="arate-search" role="status" aria-busy="true">
              <span className="arate-spin" aria-hidden>
                <Loader2 size={18} />
              </span>
              <span className="arate-search-main">
                {hiddenLadder ? (
                  <>
                    <span className="arate-search-big">Searching the unranked opponent pool…</span>
                    <span className="arate-search-sub">
                      zero rating signal on either side — your surfaces show no numbers until
                      reveal
                    </span>
                  </>
                ) : (
                  <>
                    <span className="arate-search-big">Searching your pairing band…</span>
                    <span className="arate-search-sub">
                      widening until a legal pairing appears — the exact window is never shown
                      (§7)
                    </span>
                  </>
                )}
                <span className="arate-search-witness">
                  <ShieldCheck size={13} aria-hidden /> witness will be drawn from your canonical
                  set
                </span>
              </span>
              <button type="button" className="btn ghost small arate-cancel" onClick={cancelSearch}>
                Cancel
              </button>
            </div>
          )}

          {phase === 'found' && (
            <div className="arate-found">
              <div className="arate-found-head">
                <span className="arate-found-title" role="status">
                  <CircleCheck size={15} aria-hidden /> Pairing found
                </span>
                <div className="segmented" role="group" aria-label="Preview the pairing as">
                  <button
                    type="button"
                    className={`seg${effectiveView === 'ranked' ? ' on' : ''}`}
                    aria-pressed={effectiveView === 'ranked'}
                    disabled={hiddenLadder}
                    title={
                      hiddenLadder
                        ? `Unavailable: you are ${ladder?.display.state ?? 'unranked'} in ${ladderKey}. §6 — the spectator preview (opponent brackets) exists only for ladders where YOU are ranked; a provisional player's client never renders it.`
                        : undefined
                    }
                    onClick={() => setView('ranked')}
                  >
                    Ranked view
                  </button>
                  <button
                    type="button"
                    className={`seg${effectiveView === 'provisional' ? ' on' : ''}`}
                    aria-pressed={effectiveView === 'provisional'}
                    onClick={() => setView('provisional')}
                  >
                    Provisional view
                  </button>
                </div>
              </div>

              {hiddenLadder ? (
                <p className="arate-found-caption">
                  Ranked view disabled: you are not ranked in {ladderKey}, so §6 hides every
                  rating-shaped quantity — including the spillover bracket — from your client.
                  Ranked players and spectators would see the bracket; you see the pool.
                </p>
              ) : (
                <p className="arate-found-caption">
                  One spillover pairing, rendered under each side&rsquo;s display rules — every
                  compliant client renders these identically.
                </p>
              )}

              {effectiveView === 'ranked' && !hiddenLadder && oppInfo ? (
                <div className="arate-opp">
                  <span className="arate-opp-avatar" aria-hidden>
                    <UserRound size={18} />
                  </span>
                  <span className="arate-opp-id">
                    <span className="arate-opp-name">{DEMO_OPP?.displayName ?? 'opponent'}</span>
                    <span className="arate-opp-handle account-handle-mono">
                      {DEMO_OPP?.handle ?? ''}
                    </span>
                  </span>
                  {oppInfo.kind === 'bracket' && (
                    <span
                      className="arate-bracket num"
                      title="wide bracket · RD-discounted — estimates nothing precise"
                    >
                      {oppInfo.lo}–{oppInfo.hi}
                    </span>
                  )}
                  {oppInfo.kind === 'rating' && (
                    <span className="arate-bracket num" title="revealed rating — opponent is ranked">
                      {oppInfo.rating}
                    </span>
                  )}
                </div>
              ) : (
                <div className="arate-opp is-pool">
                  <span className="arate-opp-avatar" aria-hidden>
                    <Users size={18} />
                  </span>
                  <span className="arate-opp-id">
                    <span className="arate-opp-name">Unranked opponent pool</span>
                    <span className="arate-opp-sub">
                      no ratings, no brackets, no numbers — on any surface, until reveal
                    </span>
                  </span>
                </div>
              )}

              <p className="arate-found-sub">
                {effectiveView === 'ranked' && !hiddenLadder
                  ? 'A provisional opponent via spillover: the wide bracket estimates nothing precise, and Glicko’s RD discount means this game barely moves your rating.'
                  : 'What the provisional side sees. Their client could compute the numbers — but no compliant client renders them, so a self-computed rating has no audience.'}
              </p>

              <div className="arate-found-meta">
                {witness && (
                  <span>
                    <ShieldCheck size={13} aria-hidden /> Witness: {witness.handle} — neither
                    player, entanglement-distant
                  </span>
                )}
                <span>
                  <Handshake size={13} aria-hidden /> Pairing legality verified by both clients
                  (shared pairingLegal over these same public values)
                </span>
              </div>

              <div className="arate-found-actions">
                <button type="button" className="btn ghost" onClick={cancelSearch}>
                  Back to lobby
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

// ===========================================================================
// LIVE lobby (A6 M2 un-fixture) — real fold ladders + live matchmaking status
// + the honest 2-user degradation (C-10). This is what the app renders; it uses
// NO fixtures: ladders come from the signed-in account's chain fold, trust from
// trustT over that fold, the third-machine count + search phase from the live
// matchmaking engine over the account peer's overlay (net/matchmaking.ts).
// ===========================================================================

/**
 * THIS account's §7 trust (trustT over the live fold) in micro-units — the
 * meter's geometry input AND the seek PairView's tMicro (both share the one
 * recomputable value, §7). Null while loading / signed out, so the meter waits
 * rather than rendering a wrong band. Recomputes when the chain advances (a
 * landed rated segment moves trust).
 */
function useOwnTrustMicro(account: UiOwnAccount | null): number | null {
  const [tMicro, setTMicro] = useState<number | null>(null)
  const key = account ? `${account.rootPub}:${account.chainHeight}` : ''
  useEffect(() => {
    let alive = true
    if (!account) {
      setTMicro(null)
      return undefined
    }
    void (async () => {
      try {
        const chain = await loadOwnChain()
        const { fold } = foldChainA4(chain)
        const t = trustT(fold.trust, fold.rep, Date.now())
        if (alive) setTMicro(t)
      } catch {
        if (alive) setTMicro(null)
      }
    })()
    return () => {
      alive = false
    }
  }, [key])
  return tMicro
}

function RatedLobbyLive(): JSX.Element {
  const { account } = useAccountsUi()
  const mm = useMatchmaking()
  const [ladderKey, setLadderKey] = useState<LadderKey>('Blitz')
  const tMicro = useOwnTrustMicro(account)

  // Live third-machine status for the header + the honest C-10 boundary. Refresh
  // on mount + while idle; cancel any running search on unmount (tab leave).
  useEffect(() => {
    matchmakingStore.refreshWitnessStatus()
    const id = window.setInterval(() => {
      if (matchmakingStore.getState().phase === 'idle') matchmakingStore.refreshWitnessStatus()
    }, 4000)
    return () => {
      window.clearInterval(id)
      matchmakingStore.cancelRatedSearch()
    }
  }, [])

  const ladders = account?.ladders ?? []
  const ladder = ladders.find((l) => l.key === ladderKey) ?? null
  const hiddenLadder = ladder ? ladder.display.state !== 'ranked' : false
  const witnessesUp = mm.witnessesReachable
  const canSeek = !!account && ladder !== null && tMicro !== null && mm.peerLive

  function viewFor(l: UiLadder, t: number): PairView {
    return pairViewOf(account!.rootPub, ladderIdOf(l.key), l.state, t, l.key)
  }
  function pickLadder(key: LadderKey): void {
    if (mm.phase !== 'idle') matchmakingStore.cancelRatedSearch()
    setLadderKey(key)
  }
  function startSearch(): void {
    if (!canSeek || !ladder || tMicro === null) return
    void matchmakingStore.startRatedSearch({
      ladderKey,
      tc: MM_DEFAULT_TC[ladderKey],
      view: viewFor(ladder, tMicro)
    })
  }
  function cancel(): void {
    matchmakingStore.cancelRatedSearch()
  }

  if (!account) {
    return (
      <section className="panel arate-lobby" aria-label="Rated lobby">
        <header className="panel-head arate-head">
          <span className="arate-head-icon" aria-hidden>
            <Swords size={15} />
          </span>
          <h3 className="panel-title">Rated lobby</h3>
        </header>
        <div className="arate-body">
          <div className="arate-unavail" role="status">
            <span className="arate-unavail-icon" aria-hidden>
              <UserRound size={16} />
            </span>
            <span>Sign in to a decentralized account to play rated, witnessed games.</span>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="panel arate-lobby" aria-label="Rated lobby">
      <header className="panel-head arate-head">
        <span className="arate-head-icon" aria-hidden>
          <Swords size={15} />
        </span>
        <h3 className="panel-title">Rated lobby</h3>
        <span className={`arate-net num${witnessesUp > 0 ? ' is-ok' : ' is-out'}`}>
          <Network size={12} aria-hidden />
          {!mm.peerLive
            ? 'connecting to the network…'
            : witnessesUp > 0
              ? `${witnessesUp} witness${witnessesUp === 1 ? '' : 'es'} reachable`
              : 'no witness reachable'}
        </span>
      </header>

      <div className="arate-body">
        <div className="arate-col">
          <span className="arate-label" id="arate-ladder-label">
            Ladder
          </span>
          <div className="arate-ladders" role="group" aria-labelledby="arate-ladder-label">
            {ladders.map((l) => {
              const Icon = LADDER_ICON[l.key]
              const on = l.key === ladderKey
              const ranked = l.display.state === 'ranked'
              return (
                <button
                  key={l.key}
                  type="button"
                  className={`arate-ladder${on ? ' on' : ''}`}
                  aria-pressed={on}
                  onClick={() => pickLadder(l.key)}
                >
                  <span className="arate-ladder-name">
                    <Icon size={14} aria-hidden /> {l.key}
                  </span>
                  <span className={`arate-ladder-state num${ranked ? ' is-ranked' : ''}`}>
                    {displayLabel(l.display)}
                  </span>
                </button>
              )
            })}
          </div>

          {hiddenLadder && (
            <p className="arate-hidden-note">
              <EyeOff size={13} aria-hidden />
              <span>
                Until your {ladderKey} rating reveals, you&rsquo;ll see an{' '}
                <b>Unranked opponent pool</b> — no opponent ratings or brackets anywhere:
                matchmaking, in-game, or post-game. Every fresh root re-pays this judged, hidden
                stretch — that&rsquo;s what prices rerolling.
              </span>
            </p>
          )}

          <p className="arate-unlimited">
            <InfinityIcon size={13} aria-hidden />
            No Unlimited ladder — without a clock stream there are no timing forensics, so
            unlimited games are unrated by design.
          </p>
        </div>

        <div className="arate-col">
          {tMicro !== null ? (
            <TrustWidthMeter tMicro={tMicro} />
          ) : (
            <div className="arate-meter" role="status">
              <div className="arate-meter-head">
                <span className="arate-meter-title">
                  <ShieldCheck size={14} aria-hidden /> Trust-earned precision
                </span>
              </div>
              <p className="arate-meter-curve">Reading your trust from the chain…</p>
            </div>
          )}
        </div>

        <div className="arate-flow">
          {mm.phase === 'idle' && (
            <div className="arate-idle">
              <button
                type="button"
                className="btn arate-play"
                onClick={startSearch}
                disabled={!canSeek}
              >
                <Swords size={16} aria-hidden /> Play rated
              </button>
              <span className="arate-idle-sub">
                {!mm.peerLive
                  ? 'Connecting to the accounts network…'
                  : witnessesUp === 0
                    ? `${ladderKey} · rated play waits for a third machine (a witness)`
                    : hiddenLadder
                      ? `${ladderKey} · unranked pool — provisionals pair with provisionals first`
                      : `${ladderKey} · the window opens tight around your rating — trust earns precision`}
              </span>
            </div>
          )}

          {mm.phase === 'idle' && mm.peerLive && witnessesUp === 0 && (
            <div className="arate-unavail" role="status">
              <span className="arate-unavail-icon" aria-hidden>
                <Network size={16} />
              </span>
              <span>
                <b>Rated play is unavailable until a third machine appears.</b> Every rated game
                needs a witness that is neither player — with no third machine reachable, rated play
                honestly waits for one. The operator&rsquo;s always-awake peer makes this window
                negligible. Casual and offline play are unaffected.
              </span>
            </div>
          )}

          {mm.phase === 'searching' && (
            <div className="arate-search" role="status" aria-busy="true">
              <span className="arate-spin" aria-hidden>
                <Loader2 size={18} />
              </span>
              <span className="arate-search-main">
                {hiddenLadder ? (
                  <>
                    <span className="arate-search-big">Searching the unranked opponent pool…</span>
                    <span className="arate-search-sub">
                      zero rating signal on either side — your surfaces show no numbers until reveal
                    </span>
                  </>
                ) : (
                  <>
                    <span className="arate-search-big">Searching your pairing band…</span>
                    <span className="arate-search-sub">
                      widening until a legal pairing appears — the exact window is never shown (§7)
                    </span>
                  </>
                )}
                <span className="arate-search-witness">
                  <ShieldCheck size={13} aria-hidden /> a witness will be drawn from your canonical
                  set ({witnessesUp} reachable)
                </span>
              </span>
              <button type="button" className="btn ghost small arate-cancel" onClick={cancel}>
                Cancel
              </button>
            </div>
          )}

          {mm.phase === 'waiting-witness' && (
            <div className="arate-unavail" role="status" aria-live="polite">
              <span className="arate-unavail-icon" aria-hidden>
                <ShieldCheck size={16} />
              </span>
              <span>
                <b>Opponent found — waiting for a witness (a third machine).</b> A legal pairing is
                ready, but every rated game needs a witness who is neither player, and none is
                reachable right now. We&rsquo;ll pair you the instant one appears — never a game
                without a witness (§4). Casual play is unaffected.
              </span>
              <button type="button" className="btn ghost small arate-cancel" onClick={cancel}>
                Cancel
              </button>
            </div>
          )}

          {mm.phase === 'paired' && (
            <div className="arate-found">
              <div className="arate-found-head">
                <span className="arate-found-title" role="status">
                  <CircleCheck size={15} aria-hidden /> Pairing found
                </span>
              </div>
              <p className="arate-found-caption">
                A legal opponent from the {ladderKey} pool — pairing legality verified by both
                clients (shared pairingLegal over the same public values), witness drawn from your
                canonical set. Connecting you to the board…
              </p>
              <div className="arate-found-meta">
                <span>
                  <ShieldCheck size={13} aria-hidden /> Witness: a third machine, neither player,
                  entanglement-distant
                </span>
                <span>
                  <Users size={13} aria-hidden /> No room code exchanged — the pool paired you
                  directly
                </span>
              </div>
              <div className="arate-found-actions">
                <button type="button" className="btn ghost" onClick={cancel}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {mm.phase === 'signed-out' && (
            <div className="arate-unavail" role="status">
              <span className="arate-unavail-icon" aria-hidden>
                <Network size={16} />
              </span>
              <span>Connecting to the accounts network — your peer is starting up.</span>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

/**
 * The rated lobby (§7 matchmaking surface). LIVE by default (the app's
 * `<RatedLobby />`): real fold ladders, real trust, live matchmaking status, and
 * the honest 2-user degradation (C-10). A caller that passes `initial` gets the
 * DEV_FIXTURE showcase instead (the A4-UI conformance suite + showcase embeds).
 */
export function RatedLobby({ initial }: { initial?: RatedLobbyInitial } = {}): JSX.Element {
  if (initial) return <RatedLobbyShowcase initial={initial} />
  return <RatedLobbyLive />
}
