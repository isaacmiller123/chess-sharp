// §5 viewing flow + §10 profile page: view anyone, including the years-gone.
// If the owner is offline the ReconstructionCard runs first (gather the pieces,
// check the math), then the profile reveals. Ban state (§9) renders as public
// signed data — profiles never disappear. The verification strip surfaces the
// §2 checkpoint claim exactly as the fast path verified it — including the
// degradations it must never hide (C-12 revocationContested, the floor path,
// a below-threshold checkpoint). Opponent ladders render ONLY through the
// shared §6 projection (mm/pairing visibleOpponentInfo): a placement or
// provisional viewer gets nothing rating-shaped about anyone.

import { useEffect, useState, type JSX } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  Check,
  Clock,
  Copy,
  Globe,
  History,
  Layers,
  Loader2,
  Lock,
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
import { useAccountsUi, type ViewerDisplayByLadder } from '../mock/store'
import { ReconstructionCard } from './ReconstructionCard'
import { LADDER_ICON, RatingLadders, type LadderProjection } from './RatingLadders'
import { ReputationPanel } from './ReputationPanel'
import { DAY, accountAge, daysRemaining, gameDate, regionName, relativeWts } from './profileFormat'

/**
 * The §6 provisional-information projection for every ladder of a viewed
 * profile (A4-17), computed with the SHARED pure helpers over PairViews built
 * from fixture protocol state. Signed-out viewers are spectators
 * (spectatorOpponentInfo); signed-in viewers project through the store's
 * per-ladder viewer display state (itself the shared displayState() output)
 * via visibleOpponentInfo — a placement/provisional viewer gets
 * 'unranked-pool' for that ladder, never a number or bracket.
 * Exported for the UI suite (scripts/test-a4-ui.mjs) — the pins run against
 * the exact projection this page renders, not a reconstruction.
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

export function ProfilePage({
  handle,
  onBack,
  initialRevealed
}: {
  handle: string
  onBack: () => void
  /** Skip-or-force the §5 reconstruction stage. Showcase/suite knob
   * (scripts/test-a4-ui.mjs pins the revealed degraded view, A4-29);
   * product callers omit it and get the owner-online default. */
  initialRevealed?: boolean
}): JSX.Element {
  const profile: UiProfile | undefined = PROFILES[handle]
  const ui = useAccountsUi()
  // Owner online → render straight from their live chain. Owner gone →
  // reconstruct from pointers/holders/shards first (§5), then reveal.
  const [revealed, setRevealed] = useState<boolean>(
    () => initialRevealed ?? (!profile || profile.reconstruction.ownerOnline)
  )
  const [copied, setCopied] = useState(false)
  const [paging, setPaging] = useState<'idle' | 'busy' | 'settled'>('idle')

  // Reset the flow when the viewed handle changes.
  useEffect(() => {
    const p = PROFILES[handle]
    setRevealed(initialRevealed ?? (!p || p.reconstruction.ownerOnline))
    setCopied(false)
    setPaging('idle')
  }, [handle, initialRevealed])

  useEffect(() => {
    if (!copied) return
    const t = window.setTimeout(() => setCopied(false), 1600)
    return () => window.clearTimeout(t)
  }, [copied])

  // Lazy-page mock: ask the holders, come back with the honest §5 failure mode
  // (temporary unavailability that heals) — never a dead button.
  useEffect(() => {
    if (paging !== 'busy') return
    const t = window.setTimeout(() => setPaging('settled'), 950)
    return () => window.clearTimeout(t)
  }, [paging])

  if (!profile) {
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

  const stale = MOCK_NOW - profile.lastWitnessedWts > 30 * DAY
  const totalGames = profile.ladders.reduce((n, l) => n + l.games, 0)
  const ck = profile.checkpoint
  const recon = profile.reconstruction

  // §6 (A4-17): own profile renders own numbers; anyone else renders through
  // the shared viewer projection. Signed-out ⇒ spectator projection.
  const own = ui.account
  const isOwn = own !== null && own.handle === profile.handle
  const projection = isOwn
    ? undefined
    : projectionFor(profile, own?.rootPub ?? null, own?.ladders ?? null, ui.viewerDisplay)
  const viewerHiddenSomewhere =
    projection !== undefined &&
    Object.values(projection).some((p) => p?.kind === 'unranked-pool')

  const copyHandle = (): void => {
    void navigator.clipboard?.writeText(profile.handle).catch(() => undefined)
    setCopied(true)
  }

  return (
    <div className="aprof-page">
      <div className="aprof-page-top">
        <button type="button" className="icon-btn" aria-label="Back" onClick={onBack}>
          <ArrowLeft size={16} aria-hidden />
        </button>
        <span className="aprof-page-title">Profile</span>
        <span className="account-handle-mono muted small">{profile.handle}</span>
        {DEV_FIXTURE && (
          <FixturePreviewBadge label="Sample profile — other players' chains arrive with network transport" />
        )}
      </div>

      {!revealed ? (
        <ReconstructionCard profile={profile} onDone={() => setRevealed(true)} />
      ) : (
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
                  {profile.handle}
                  <button
                    type="button"
                    className="aprof-copy"
                    aria-label={copied ? 'Copied' : 'Copy handle'}
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
                <span className="aprof-meta-pill">
                  <History size={12} aria-hidden /> {accountAge(profile.createdWts, MOCK_NOW)} on the network
                </span>
                <span className="aprof-meta-pill num">
                  <Users size={12} aria-hidden /> {profile.friendsCount} friends
                </span>
                <span className="aprof-meta-pill num">
                  <Swords size={12} aria-hidden /> {totalGames.toLocaleString()} witnessed games
                </span>
              </div>
            </div>
            <div className={`aprof-staleness${stale ? ' is-stale' : ''}`}>
              <Clock size={13} aria-hidden /> Last witnessed activity{' '}
              {relativeWts(profile.lastWitnessedWts, MOCK_NOW)}
            </div>
          </section>

          <StandingStrip standing={profile.standing} />

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
                  A device-signed revocation was honored on device-attested evidence only (C-12:
                  no chain linkage to vet the signer). Degraded, self-healing — any
                  reconstructing chain adjudicates and heals it. Never silent.
                </span>
              </div>
            </div>
          )}

          <div className="aprof-verify">
            <ShieldCheck size={15} aria-hidden />
            <span className="aprof-verify-main num">
              Checkpoint #{ck.height.toLocaleString()} · {ck.cosigners}-of-{ck.of} cosigned ·
              verified {ck.verified}
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
            {profile.games.length > 0 ? (
              <ul className="aprof-games">
                {profile.games.map((g) => (
                  <GameRow key={g.id} game={g} />
                ))}
              </ul>
            ) : (
              <p className="aprof-games-empty muted small">No witnessed games in this slice.</p>
            )}
            <div className="aprof-games-foot">
              <button
                type="button"
                className="btn ghost aprof-btn-sm"
                disabled={paging === 'busy'}
                onClick={() => setPaging('busy')}
              >
                {paging === 'busy' ? (
                  <>
                    <Loader2 size={13} className="aprof-spin" aria-hidden /> Paging from holders…
                  </>
                ) : (
                  <>
                    Load more <span className="aprof-btn-note num">~2 KB/game</span>
                  </>
                )}
              </button>
              {paging === 'settled' && (
                <p className="aprof-games-note muted small" role="status">
                  No holder awake with older segments right now — they heal back in as carriers
                  return.
                </p>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  )
}

/** §9 standing — every ban cites a public signed record, never a blocklist. */
function StandingStrip({ standing }: { standing: UiStanding }): JSX.Element | null {
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
              {daysRemaining(standing.expiresWts, MOCK_NOW)} days remaining
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
              {daysRemaining(standing.expiresWts, MOCK_NOW)} days remaining
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
function GameRow({ game }: { game: UiGameRow }): JSX.Element {
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
      <span className="aprof-game-when muted small num">{gameDate(game.ts, MOCK_NOW)}</span>
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
