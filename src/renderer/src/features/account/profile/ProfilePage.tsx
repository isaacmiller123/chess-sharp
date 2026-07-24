// §5 viewing flow + §10 profile page: view anyone, including the years-gone.
// WIRED (A6 M3): when a target account ROOT is opened and the live AccountPeer
// overlay is up, the page reconstructs the profile over the network via
// viewerClient (storage/viewer.ts resolveProfile + openHistory) — newest profile
// snapshot + newest M-of-N checkpoint (verified incrementally, spot-checked per
// §2) + head + lazy game history — with the owner offline. When there is no
// target root (a fixture display handle) or no live peer, it falls back to the
// clearly-labelled DEV_FIXTURE sample profiles (offline preview). Ban state (§9)
// renders as public signed data — profiles never disappear. The verification
// strip surfaces the §2 checkpoint claim exactly as verified — including the
// degradations it must never hide (C-12 revocationContested, the floor path, a
// below-threshold checkpoint). A target with fewer than K_rec reachable shard
// rows surfaces honest temporary unavailability that heals via repair — never a
// crash, never a fabricated profile. Opponent ladders render ONLY through the
// shared §6 projection (mm/pairing visibleOpponentInfo).

import { useEffect, useState, type JSX } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  Check,
  Clock,
  CloudOff,
  Copy,
  Globe,
  History,
  Layers,
  Loader2,
  Lock,
  RefreshCw,
  ScanSearch,
  Search,
  ShieldAlert,
  ShieldCheck,
  Swords,
  Users
} from 'lucide-react'
import { visibleOpponentInfo, spectatorOpponentInfo } from '@shared/accounts/mm/pairing'
import { pairViewOf } from '@shared/accounts/ratings/display'
import { DEV_FIXTURE, MOCK_NOW, PROFILES, shortB64u } from '../mock/fixtures'
import { FixturePreviewBadge } from '../mock/FixturePreviewBadge'
import type { UiGameRow, UiLadder, UiProfile, UiStanding } from '../mock/types'
import { useAccountsUi, type AccountsUiState, type ViewerDisplayByLadder } from '../mock/store'
import { getAccountPeer } from '../net/peerService'
import {
  gameRowsFromEvents,
  isAccountRoot,
  viewAccountForPeer,
  type ViewerAvailability,
  type ViewerResult
} from '../net/viewerClient'
import { ReconstructionCard } from './ReconstructionCard'
import { LADDER_ICON, RatingLadders, type LadderProjection } from './RatingLadders'
import { ReputationPanel } from './ReputationPanel'
import { DAY, accountAge, daysRemaining, gameDate, regionName, relativeWts } from './profileFormat'

/**
 * The §6 provisional-information projection for every ladder of a viewed
 * profile (A4-17), computed with the SHARED pure helpers over PairViews built
 * from protocol state. Signed-out viewers are spectators (spectatorOpponentInfo);
 * signed-in viewers project through the store's per-ladder viewer display state
 * via visibleOpponentInfo — a placement/provisional viewer gets 'unranked-pool'
 * for that ladder, never a number or bracket.
 * Exported for the UI suite (scripts/test-a4-ui.mjs) — the pins run against the
 * exact projection this page renders.
 */
export function projectionFor(
  subject: UiProfile,
  viewerRoot: string | null,
  viewerLadders: UiLadder[] | null,
  viewerDisplay: ViewerDisplayByLadder | null
): LadderProjection {
  const out: LadderProjection = {}
  for (const l of subject.ladders) {
    const opp = pairViewOf(subject.rootPub, `chess:${l.key}`, l.state, 0, l.key)
    const vl = viewerLadders?.find((v) => v.key === l.key)
    const vd = viewerDisplay?.[l.key]
    out[l.key] =
      viewerRoot && vl && vd
        ? visibleOpponentInfo(
            {
              root: viewerRoot,
              ladderId: `chess:${l.key}`,
              ratingMicro: vl.state.r,
              rdMicro: vl.state.rd,
              tMicro: 0,
              display: vd
            },
            opp
          )
        : spectatorOpponentInfo(opp)
  }
  return out
}

type LiveState =
  | { phase: 'resolving' }
  | { phase: 'ready'; result: ViewerResult }
  | { phase: 'unavailable'; availability: ViewerAvailability | null; reason: string }

export function ProfilePage({
  handle,
  root,
  onBack,
  initialRevealed
}: {
  handle: string
  /** Explicit target account root (b64u). When omitted, a 43-char b64u `handle`
   *  is itself treated as the target root (view anyone by pasting their key). */
  root?: string
  onBack: () => void
  /** Skip-or-force the §5 reconstruction stage. Showcase/suite knob
   *  (scripts/test-a4-ui.mjs pins the revealed degraded view, A4-29); product
   *  callers omit it and get the owner-online default. */
  initialRevealed?: boolean
}): JSX.Element {
  // A target ROOT (explicit, or a root-shaped handle) drives LIVE reconstruction
  // over the overlay; anything else is a fixture display handle (offline preview).
  const targetRoot = root ?? (isAccountRoot(handle) ? handle : undefined)
  const isLive = targetRoot !== undefined
  const fixtureProfile: UiProfile | undefined = PROFILES[handle]
  const ui = useAccountsUi()

  // Owner online → render straight from their live chain. Owner gone →
  // reconstruct from pointers/holders/shards first (§5), then reveal.
  const [revealed, setRevealed] = useState<boolean>(
    () => initialRevealed ?? (!isLive && (!fixtureProfile || fixtureProfile.reconstruction.ownerOnline))
  )
  const [paging, setPaging] = useState<'idle' | 'busy' | 'settled'>('idle')
  const [live, setLive] = useState<LiveState>({ phase: 'resolving' })
  const [retryKey, setRetryKey] = useState(0)

  // Reset the flow when the viewed target changes.
  useEffect(() => {
    const p = PROFILES[handle]
    const liveTarget = root ?? (isAccountRoot(handle) ? handle : undefined)
    setRevealed(initialRevealed ?? (liveTarget === undefined && (!p || p.reconstruction.ownerOnline)))
    setPaging('idle')
    setLive({ phase: 'resolving' })
  }, [handle, root, initialRevealed])

  // Fixture-only lazy-page mock: ask the holders, come back with the honest §5
  // failure mode (temporary unavailability that heals) — never a dead button.
  useEffect(() => {
    if (isLive || paging !== 'busy') return
    const t = window.setTimeout(() => setPaging('settled'), 950)
    return () => window.clearTimeout(t)
  }, [paging, isLive])

  // LIVE resolve: one authenticated-pointer lookup + the shard layer over the
  // peer overlay, via viewerClient. Never throws; a below-K_rec / no-pointer
  // target lands in an honest 'unavailable' phase (heals via repair on retry).
  useEffect(() => {
    if (!isLive || targetRoot === undefined) return
    let cancelled = false
    setLive({ phase: 'resolving' })
    setRevealed(initialRevealed ?? false)
    const peer = getAccountPeer()
    if (!peer) {
      setLive({ phase: 'unavailable', availability: null, reason: 'no-peer' })
      return
    }
    void viewAccountForPeer(peer, targetRoot)
      .then((result) => {
        if (cancelled) return
        if (result.availability.available) setLive({ phase: 'ready', result })
        else
          setLive({
            phase: 'unavailable',
            availability: result.availability,
            reason: result.availability.reason ?? 'below-k'
          })
      })
      .catch(() => {
        if (!cancelled) setLive({ phase: 'unavailable', availability: null, reason: 'error' })
      })
    return () => {
      cancelled = true
    }
  }, [isLive, targetRoot, retryKey, initialRevealed])

  // ---- LIVE reconstruction path ------------------------------------------
  if (isLive && targetRoot !== undefined) {
    const shortHandle = shortB64u(targetRoot)
    return (
      <div className="aprof-page">
        <div className="aprof-page-top">
          <button type="button" className="icon-btn" aria-label="Back" onClick={onBack}>
            <ArrowLeft size={16} aria-hidden />
          </button>
          <span className="aprof-page-title">Profile</span>
          <span className="account-handle-mono muted small">{shortHandle}</span>
        </div>

        {live.phase === 'resolving' && (
          <ReconstructionCard handle={shortHandle} recon={null} checkpoint={null} onDone={() => {}} />
        )}

        {live.phase === 'unavailable' && (
          <UnavailableCard
            handle={shortHandle}
            reason={live.reason}
            availability={live.availability}
            onRetry={() => setRetryKey((k) => k + 1)}
            onBack={onBack}
          />
        )}

        {live.phase === 'ready' &&
          (!revealed ? (
            <ReconstructionCard
              handle={shortHandle}
              recon={live.result.profile.reconstruction}
              checkpoint={live.result.profile.checkpoint}
              onDone={() => setRevealed(true)}
            />
          ) : (
            <RevealedProfile profile={live.result.profile} ui={ui} nowMs={Date.now()} pager={live.result.pager} />
          ))}
      </div>
    )
  }

  // ---- FIXTURE preview path (offline / display-handle) -------------------
  if (!fixtureProfile) {
    return (
      <div className="aprof-page">
        <div className="aprof-page-top">
          <button type="button" className="icon-btn" aria-label="Back" onClick={onBack}>
            <ArrowLeft size={16} aria-hidden />
          </button>
          <span className="aprof-page-title">Profile</span>
          <span className="account-handle-mono muted small">{handle}</span>
        </div>
        <section className="card aprof-card aprof-missing">
          <span className="aprof-missing-icon" aria-hidden>
            <Search size={22} />
          </span>
          <h3 className="aprof-missing-title">No pointers found</h3>
          <p className="muted">
            No pointers found under that key — the account may never have entered the witnessed
            zone.
          </p>
          <button type="button" className="btn ghost" onClick={onBack}>
            <ArrowLeft size={14} aria-hidden /> Back
          </button>
        </section>
      </div>
    )
  }

  return (
    <div className="aprof-page">
      <div className="aprof-page-top">
        <button type="button" className="icon-btn" aria-label="Back" onClick={onBack}>
          <ArrowLeft size={16} aria-hidden />
        </button>
        <span className="aprof-page-title">Profile</span>
        <span className="account-handle-mono muted small">{fixtureProfile.handle}</span>
        {DEV_FIXTURE && (
          <FixturePreviewBadge label="Sample profile — open a real account root to reconstruct over the live overlay" />
        )}
      </div>

      {!revealed ? (
        <ReconstructionCard
          handle={fixtureProfile.handle}
          recon={fixtureProfile.reconstruction}
          checkpoint={fixtureProfile.checkpoint}
          onDone={() => setRevealed(true)}
        />
      ) : (
        <RevealedProfile
          profile={fixtureProfile}
          ui={ui}
          nowMs={MOCK_NOW}
          pager={null}
          paging={paging}
          onLoadMore={() => setPaging('busy')}
        />
      )}
    </div>
  )
}

/** Honest §5/C-8 temporary-unavailability surface: the target resolved to fewer
 *  than the K_rec shard rows needed (or no authenticated pointers, or no live
 *  peer). Never a fabricated profile — it degrades, self-heals via repair, and
 *  offers a retry. */
function UnavailableCard({
  handle,
  reason,
  availability,
  onRetry,
  onBack
}: {
  handle: string
  reason: string
  availability: ViewerAvailability | null
  onRetry: () => void
  onBack: () => void
}): JSX.Element {
  const copy: Record<string, string> = {
    'no-peer':
      'Not connected to the account network yet — sign in and give the overlay a moment to come up, then retry.',
    'no-pointers':
      'No authenticated pointers found under this key — this account may never have entered the witnessed zone, or no carrier is online right now.',
    'below-k':
      'Temporarily unavailable — fewer than the K_rec shard rows needed are reachable right now. This is churn, not loss: background repair heals it as carriers return.',
    'no-rows':
      'No shard rows reachable yet — the network is the storage, and no carrier of this account is online at the moment. Background repair heals it as carriers return.',
    'reconstruct-failed':
      'The reachable shard rows did not reconstruct a verified chain this pass — temporary, self-healing as more carriers return.',
    'bad-chain':
      'The reachable rows did not verify against the countersigned head this pass — temporary; the guaranteed floor and repair heal it.',
    error: 'Reconstruction hit a transport error — this is transient; retry in a moment.'
  }
  return (
    <section className="card aprof-card aprof-rail aprof-recon">
      <header className="aprof-card-head">
        <span className="aprof-eyebrow">
          <CloudOff size={14} aria-hidden /> Reconstructing{' '}
          <span className="account-handle-mono">{handle}</span>
        </span>
        <p className="aprof-card-sub muted small">{copy[reason] ?? copy['below-k']}</p>
      </header>
      {availability && (
        <p className="aprof-stage-detail muted small num" role="status">
          {availability.liveRows} of {availability.totalRows} shard rows reachable · {availability.needK} needed to
          reconstruct · {availability.segments} game{availability.segments === 1 ? '' : 's'} on the guaranteed floor
        </p>
      )}
      <footer className="aprof-card-foot muted small">
        <AlertTriangle size={13} aria-hidden /> Temporary unavailability that heals (§5/C-8) — never
        silent loss, never a fabricated profile.
      </footer>
      <div className="aprof-games-foot">
        <button type="button" className="btn ghost aprof-btn-sm" onClick={onRetry}>
          <RefreshCw size={13} aria-hidden /> Retry
        </button>
        <button type="button" className="btn ghost aprof-btn-sm" onClick={onBack}>
          <ArrowLeft size={13} aria-hidden /> Back
        </button>
      </div>
    </section>
  )
}

/** The revealed profile body — identical rendering for the live reconstruction
 *  and the fixture preview; the caller supplies the UiProfile + its evaluation
 *  clock (Date.now for live data, MOCK_NOW for the frozen fixture) + the lazy
 *  history pager (live) or the fixture mock paging state. */
function RevealedProfile({
  profile,
  ui,
  nowMs,
  pager,
  paging: fixturePaging,
  onLoadMore: fixtureLoadMore
}: {
  profile: UiProfile
  ui: AccountsUiState
  nowMs: number
  pager: ViewerResult['pager']
  paging?: 'idle' | 'busy' | 'settled'
  onLoadMore?: () => void
}): JSX.Element {
  const isLive = pager !== null || fixturePaging === undefined
  const stale = nowMs - profile.lastWitnessedWts > 30 * DAY
  const totalGames = profile.ladders.reduce((n, l) => n + l.games, 0)
  const ck = profile.checkpoint
  const recon = profile.reconstruction
  const [copied, setCopied] = useState(false)

  // Live game history — lazy-paged through the §5 pager (openHistory). Fixture
  // preview renders profile.games with the mock "load more" note.
  const [liveGames, setLiveGames] = useState<UiGameRow[] | null>(null)
  const [nextPage, setNextPage] = useState(0)
  const [livePaging, setLivePaging] = useState<'idle' | 'busy' | 'settled' | 'end'>('idle')

  useEffect(() => {
    if (!copied) return
    const t = window.setTimeout(() => setCopied(false), 1600)
    return () => window.clearTimeout(t)
  }, [copied])

  // Load the newest history page (page 0) once, for the live path.
  useEffect(() => {
    if (!pager) return
    let cancelled = false
    setLivePaging('busy')
    void pager.page(0).then((p) => {
      if (cancelled) return
      if (p.ok) {
        setLiveGames(gameRowsFromEvents(p.events))
        setNextPage(1)
        setLivePaging(1 >= pager.pageCount ? 'end' : 'idle')
      } else {
        setLiveGames([])
        setLivePaging('settled')
      }
    })
    return () => {
      cancelled = true
    }
  }, [pager])

  const loadMoreLive = (): void => {
    if (!pager || nextPage >= pager.pageCount) {
      setLivePaging('end')
      return
    }
    setLivePaging('busy')
    const page = nextPage
    void pager.page(page).then((p) => {
      if (p.ok) {
        setLiveGames((g) => [...(g ?? []), ...gameRowsFromEvents(p.events)])
        setNextPage(page + 1)
        setLivePaging(page + 1 >= pager.pageCount ? 'end' : 'idle')
      } else {
        setLivePaging('settled')
      }
    })
  }

  // §6 (A4-17): own profile renders own numbers; anyone else renders through the
  // shared viewer projection. Signed-out ⇒ spectator projection.
  const own = ui.account
  const isOwn = own !== null && own.handle === profile.handle
  const projection = isOwn
    ? undefined
    : projectionFor(profile, own?.rootPub ?? null, own?.ladders ?? null, ui.viewerDisplay)
  const viewerHiddenSomewhere =
    projection !== undefined && Object.values(projection).some((p) => p?.kind === 'unranked-pool')

  const copyHandle = (): void => {
    void navigator.clipboard?.writeText(profile.rootPub).catch(() => undefined)
    setCopied(true)
  }

  // The games to show + the paging control state (live pager vs fixture mock).
  const games = pager ? (liveGames ?? []) : profile.games
  const pagingBusy = pager ? livePaging === 'busy' : fixturePaging === 'busy'
  const pagingSettled = pager ? livePaging === 'settled' : fixturePaging === 'settled'
  // Live with no pager (rare: a segment floor with no pinned head) has nothing to
  // page — treat as ended so no dead "Load more" button renders.
  const pagingEnded = pager ? livePaging === 'end' : isLive
  const onLoadMore = pager ? loadMoreLive : (fixtureLoadMore ?? (() => {}))

  return (
    <>
      <section className="card aprof-card aprof-rail aprof-head-card">
        <div className="aprof-identity">
          <span className="aprof-avatar" aria-hidden>
            <span className="aprof-avatar-glyph">{profile.flair}</span>
          </span>
          <div className="aprof-identity-main">
            <h3 className="aprof-name">
              {profile.displayName}
              <span className="aprof-tag">#{profile.tag}</span>
            </h3>
            <span className="aprof-handle account-handle-mono">
              {isLive ? shortB64u(profile.rootPub) : profile.handle}
              <button
                type="button"
                className="aprof-copy"
                aria-label={copied ? 'Copied' : 'Copy account key'}
                onClick={copyHandle}
              >
                {copied ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
              </button>
            </span>
            {profile.bio.trim() !== '' && <p className="aprof-bio">{profile.bio}</p>}
          </div>
          <div className="aprof-meta">
            <span className="aprof-meta-pill">
              <Globe size={12} aria-hidden /> {regionName(profile.country)}
            </span>
            {profile.createdWts > 0 && (
              <span className="aprof-meta-pill">
                <History size={12} aria-hidden /> {accountAge(profile.createdWts, nowMs)} on the network
              </span>
            )}
            <span className="aprof-meta-pill num">
              <Users size={12} aria-hidden /> {profile.friendsCount} friends
            </span>
            <span className="aprof-meta-pill num">
              <Swords size={12} aria-hidden /> {totalGames.toLocaleString()} witnessed games
            </span>
          </div>
        </div>
        {profile.lastWitnessedWts > 0 && (
          <div className={`aprof-staleness${stale ? ' is-stale' : ''}`}>
            <Clock size={13} aria-hidden /> Last witnessed activity{' '}
            {relativeWts(profile.lastWitnessedWts, nowMs)}
          </div>
        )}
      </section>

      <StandingStrip standing={profile.standing} nowMs={nowMs} />

      {/* C-12 (A4-29): a device-signed revocation honored on device-attested
          evidence only — the spec requires this surfaced, never silent. */}
      {recon.revocationContested && (
        <div className="aprof-contested" role="status">
          <span className="aprof-contested-icon" aria-hidden>
            <AlertTriangle size={15} />
          </span>
          <div className="aprof-contested-body">
            <strong className="aprof-contested-title">
              Revocation contested — this view may hide one device&rsquo;s recent content
            </strong>
            <span className="aprof-contested-sub">
              A device-signed revocation was honored on device-attested evidence only (C-12: no
              chain linkage to vet the signer). Degraded, self-healing — any reconstructing chain
              adjudicates and heals it. Never silent.
            </span>
          </div>
        </div>
      )}

      <div className="aprof-verify">
        <ShieldCheck size={15} aria-hidden />
        <span className="aprof-verify-main num">
          Checkpoint #{ck.height.toLocaleString()} · {ck.cosigners}-of-{ck.of} cosigned · verified{' '}
          {ck.verified}
        </span>
        {recon.path === 'floor' && (
          <span
            className="aprof-degraded-badge"
            title="Fewer than K_rec shard rows and no verified chain — the reconstruction floor (§5/§12): guaranteed is the union of what survivors hold; background repair heals the rest"
          >
            <Layers size={13} aria-hidden /> floor path — degraded view
          </span>
        )}
        {!ck.mOfN && (
          <span
            className="aprof-mofn-chip"
            title="The freshest surfaced checkpoint has not reached the M-of-N witness cosignature threshold (§2) — shown honestly as unattested, never as a cosigned checkpoint"
          >
            <AlertTriangle size={13} aria-hidden /> checkpoint below cosigner threshold
          </span>
        )}
        {recon.spotChecked && (
          <span className="aprof-verify-spot">
            <ScanSearch size={13} aria-hidden /> spot-checked — deeper range re-derived
          </span>
        )}
      </div>

      <div className="aprof-columns">
        <section className="card aprof-card aprof-panel">
          <header className="aprof-card-head">
            <span className="aprof-eyebrow">Ratings</span>
            <p className="aprof-card-sub muted small">
              {projection === undefined
                ? 'Display states derived identically by every client from public data.'
                : viewerHiddenSomewhere
                  ? 'Projected through §6: where your own rating is still hidden, you see nothing rating-shaped about anyone.'
                  : 'Projected through §6: hidden ladders show their quantized bracket only.'}
            </p>
          </header>
          <div className="aprof-card-body">
            <RatingLadders ladders={profile.ladders} projection={projection} />
          </div>
        </section>

        <section className="card aprof-card aprof-panel">
          <header className="aprof-card-head">
            <span className="aprof-eyebrow">Reputation</span>
            <p className="aprof-card-sub muted small">
              Conduct standing — a separate fold from rating and from trust.
            </p>
          </header>
          <div className="aprof-card-body">
            <ReputationPanel reputation={profile.reputation} />
          </div>
        </section>
      </div>

      <section className="card aprof-card aprof-panel">
        <header className="aprof-card-head aprof-card-head-row">
          <span className="aprof-eyebrow">Game history</span>
          <span className="muted small">
            newest slice first · countersigned into both players&rsquo; chains
          </span>
        </header>
        {games.length > 0 ? (
          <ul className="aprof-games">
            {games.map((g) => (
              <GameRow key={g.id} game={g} nowMs={nowMs} />
            ))}
          </ul>
        ) : (
          <p className="aprof-games-empty muted small">No witnessed games in this slice.</p>
        )}
        <div className="aprof-games-foot">
          {!pagingEnded && (
            <button
              type="button"
              className="btn ghost aprof-btn-sm"
              disabled={pagingBusy}
              onClick={onLoadMore}
            >
              {pagingBusy ? (
                <>
                  <Loader2 size={13} className="aprof-spin" aria-hidden /> Paging from holders…
                </>
              ) : (
                <>
                  Load more <span className="aprof-btn-note num">~2 KB/game</span>
                </>
              )}
            </button>
          )}
          {pagingEnded && (
            <p className="aprof-games-note muted small" role="status">
              That&rsquo;s the full verified history — every page checked against the pinned head.
            </p>
          )}
          {pagingSettled && (
            <p className="aprof-games-note muted small" role="status">
              No holder awake with older segments right now — they heal back in as carriers return.
            </p>
          )}
        </div>
      </section>
    </>
  )
}

/** §9 standing — every ban cites a public signed record, never a blocklist. */
function StandingStrip({ standing, nowMs }: { standing: UiStanding; nowMs: number }): JSX.Element | null {
  if (standing.state === 'good') return null

  if (standing.state === 'self-ban') {
    return (
      <div className="aprof-standing" role="status">
        <span className="aprof-standing-icon" aria-hidden>
          <Ban size={15} />
        </span>
        <div className="aprof-standing-body">
          <span className="aprof-standing-titlerow">
            <strong className="aprof-standing-title">Fair-play self-ban</strong>
            <span className="aprof-standing-days num">
              {daysRemaining(standing.expiresWts, nowMs)} days remaining
            </span>
          </span>
          <span className="aprof-standing-sub">
            Appended by the account&rsquo;s own client when the deterministic trigger fired —
            serving the lenient path. Cites signed record{' '}
            <span className="account-handle-mono">{shortB64u(standing.record)}</span>; the profile
            stays public.
          </span>
        </div>
      </div>
    )
  }

  if (standing.state === 'pin-fuse') {
    return (
      <div className="aprof-standing" role="status">
        <span className="aprof-standing-icon" aria-hidden>
          <Lock size={15} />
        </span>
        <div className="aprof-standing-body">
          <span className="aprof-standing-titlerow">
            <strong className="aprof-standing-title">Witnessed-zone ban — PIN fuse tripped</strong>
            <span className="aprof-standing-days num">
              {daysRemaining(standing.expiresWts, nowMs)} days remaining
            </span>
          </span>
          <span className="aprof-standing-sub">
            100 lifetime PIN failures tripped the committee&rsquo;s fuse — a threshold-signed
            public record. Cites{' '}
            <span className="account-handle-mono">{shortB64u(standing.record)}</span>.
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="aprof-standing" role="status">
      <span className="aprof-standing-icon" aria-hidden>
        <ShieldAlert size={15} />
      </span>
      <div className="aprof-standing-body">
        <span className="aprof-standing-titlerow">
          <strong className="aprof-standing-title">Same-epoch fork</strong>
          <span className="aprof-standing-days num">permanent</span>
        </span>
        <span className="aprof-standing-sub">
          Two signed successors of one head under one lease epoch — self-authenticating fraud.
          Cites <span className="account-handle-mono">{shortB64u(standing.record)}</span>.
        </span>
      </div>
    </div>
  )
}

/** One witnessed game row, from the profile owner's perspective. */
function GameRow({ game, nowMs }: { game: UiGameRow; nowMs: number }): JSX.Element {
  const Icon = LADDER_ICON[game.ladder]
  const kind =
    game.result === '1/2-1/2'
      ? 'draw'
      : (game.result === '1-0') === (game.userColor === 'w')
        ? 'win'
        : 'loss'
  const label = kind === 'win' ? 'Win' : kind === 'loss' ? 'Loss' : 'Draw'
  return (
    <li className="aprof-game">
      <span className={`aprof-result is-${kind}`}>{label}</span>
      <span className="aprof-game-ladder">
        <Icon size={13} aria-hidden /> {game.ladder}
      </span>
      <span className="aprof-game-opp">
        vs <span className="account-handle-mono">{game.opponent}</span>
      </span>
      <span className="aprof-game-color muted small">
        as {game.userColor === 'w' ? 'White' : 'Black'}
      </span>
      <span className="aprof-game-when muted small num">{gameDate(game.ts, nowMs)}</span>
      {game.witnessed && (
        <span
          className="aprof-game-witnessed"
          role="img"
          aria-label="Witnessed — countersigned into both chains"
          title="Witnessed — countersigned into both chains"
        >
          <ShieldCheck size={14} aria-hidden />
        </span>
      )}
    </li>
  )
}
