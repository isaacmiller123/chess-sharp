import { useEffect, useState, type CSSProperties, type JSX } from 'react'
import {
  Check,
  ChevronRight,
  Copy,
  Flame,
  Handshake,
  KeyRound,
  Link2,
  LogOut,
  Rabbit,
  ShieldAlert,
  ShieldCheck,
  Turtle,
  Zap
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { AccountTab } from '../AccountView'
import type { LadderKey, UiLadder, UiReputation, UiStanding } from '../mock/types'
import { shortB64u } from '../mock/fixtures'
import { accountsUiStore, useAccountsUi } from '../mock/store'
import { NetStatusPill } from './NetStatusPill'
import './hub.css'

/**
 * Overview — the landing tab of the accounts hub (ACCOUNTS-SPEC §1, §6, §6b,
 * §9). Everything shown is a claim the protocol can actually make: identity is
 * self-derived (§1), ladder states follow the §6 rendering rule (never a
 * number while hidden), reputation is a public fold (§6b), and standing is
 * derived from the chain, not asserted (§0/§9). A6 M4: renders the REAL derived
 * account (this tab only mounts signed-in), and the identity card carries the
 * LIVE overlay-presence pill (net/accountNetStatus) — no fixture, no dead
 * button; the theoretical null-account case degrades honestly.
 */

const DAY = 86_400_000

/** Whole days between ts and the caller's clock (Date.now() at the renderer
 * glue layer, where wall-clock time is allowed). */
function daysAgo(ts: number, nowMs: number): number {
  return Math.max(0, Math.round((nowMs - ts) / DAY))
}

const LADDER_ICONS: Record<LadderKey, LucideIcon> = {
  Bullet: Zap,
  Blitz: Flame,
  Rapid: Rabbit,
  Classical: Turtle
}

/** Reputation tiers map onto the semantic palette. */
function tierClass(tier: UiReputation['tier']): string {
  if (tier === 'Exemplary' || tier === 'Solid') return 'is-success'
  if (tier === 'Mixed') return 'is-warn'
  return 'is-danger'
}

/** Tiny inline rating trend, ranked ladders only (history is oldest→newest). */
function Sparkline({ points }: { points: number[] }): JSX.Element {
  const min = Math.min(...points)
  const max = Math.max(...points)
  const span = Math.max(max - min, 1)
  const w = 96
  const h = 24
  const pad = 2
  const step = (w - pad * 2) / Math.max(points.length - 1, 1)
  const d = points
    .map((p, i) => {
      const x = (pad + i * step).toFixed(1)
      const y = (h - pad - ((p - min) / span) * (h - pad * 2)).toFixed(1)
      return `${i === 0 ? 'M' : 'L'}${x},${y}`
    })
    .join(' ')
  const up = points[points.length - 1] >= points[0]
  return (
    <svg
      className={`ahub-spark ${up ? 'is-up' : 'is-down'}`}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      aria-hidden
      focusable="false"
    >
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * §6 display states, honored exactly: ranked shows the number + ±band;
 * provisional and placement NEVER show a number — the hiding is a protocol
 * rendering rule every compliant client applies identically (C-4). `display`
 * is the SHARED displayState() output carried by the fixture (A4-28), so the
 * reveal counts here (`of`) are PARAMS_A4's revealThreshold values by
 * construction — the tile only consumes the derived state.
 */
function LadderTile({ ladder }: { ladder: UiLadder }): JSX.Element {
  const Icon = LADDER_ICONS[ladder.key]
  const d = ladder.display
  const rd = Math.round(ladder.state.rd / 1_000_000)
  const stateLabel =
    d.state === 'ranked'
      ? `${d.rating} ±${rd} over ${ladder.games} games`
      : d.state === 'banned'
        ? `banned until ${new Date(d.until).toLocaleDateString()} (§9)`
        : d.state === 'provisional'
          ? `provisional, ${d.n} of ${d.of} games until reveal`
          : `placement, ${d.n} of ${d.of} games played`
  return (
    <div className="ahub-ladder" role="group" aria-label={`${ladder.key} — ${stateLabel}`}>
      <span className="ahub-ladder-head">
        <Icon size={14} aria-hidden /> {ladder.key}
      </span>

      {d.state === 'ranked' && (
        <>
          <span className="ahub-ladder-rating">
            <b className="num">{d.rating}</b>
            <span className="ahub-ladder-band num">±{rd}</span>
          </span>
          {ladder.history && ladder.history.length > 1 && <Sparkline points={ladder.history} />}
          <span className="ahub-ladder-sub muted small num">{ladder.games} games</span>
        </>
      )}

      {d.state === 'provisional' && (
        <>
          <span className="ahub-ladder-state">
            <span
              className="ahub-pill is-neutral"
              title="Hidden by protocol rendering rule — every compliant client shows the same state, on every surface, for everyone"
            >
              Provisional
            </span>
            <span className="muted small num">
              {d.n} / {d.of}
            </span>
          </span>
          <span className="ahub-meter" aria-hidden>
            <span
              className="ahub-meter-fill"
              style={{ width: `${Math.min(100, (d.n / d.of) * 100)}%` }}
            />
          </span>
          <span className="ahub-ladder-sub muted small">
            Rating reveals at game {d.of}
          </span>
        </>
      )}

      {d.state === 'placement' && (
        <>
          <span className="ahub-ladder-state">
            <span
              className="ahub-pill is-neutral"
              title="Placement games seed the rating under a held-high RD floor — no number exists to show yet"
            >
              Placement
            </span>
            <span className="muted small num">
              {d.n} / {d.of}
            </span>
          </span>
          <span className="ahub-pips" aria-hidden>
            {Array.from({ length: d.of }, (_, i) => (
              <span key={i} className={`ahub-pip${i < d.n ? ' on' : ''}`} />
            ))}
          </span>
          <span className="ahub-ladder-sub muted small">
            {d.of - d.n} placement game{d.of - d.n === 1 ? '' : 's'} to go
          </span>
        </>
      )}
    </div>
  )
}

/** §9: standing is derived from public signed records — never asserted. */
function StandingStrip({ standing }: { standing: UiStanding }): JSX.Element {
  if (standing.state === 'good') {
    return (
      <div className="ahub-standing is-good">
        <ShieldCheck size={16} aria-hidden />
        <span>
          <b>In good standing</b> — derived from your public chain, not asserted.
        </span>
      </div>
    )
  }
  const label =
    standing.state === 'pin-fuse'
      ? 'PIN fuse tripped — witnessed zone closed'
      : standing.state === 'self-ban'
        ? 'Anticheat self-ban in effect'
        : 'Permanently distrusted — same-epoch fork proven'
  return (
    <div className="ahub-standing is-bad">
      <ShieldAlert size={16} aria-hidden />
      <span>
        <b>{label}</b>
        {standing.state !== 'fork-permanent' && (
          <> · expires {new Date(standing.expiresWts).toLocaleDateString()}</>
        )}{' '}
        · record <code>{shortB64u(standing.record)}</code>
      </span>
    </div>
  )
}

export function OverviewSection({
  onOpenTab
}: {
  onOpenTab: (tab: AccountTab) => void
}): JSX.Element {
  const ui = useAccountsUi()
  const [copied, setCopied] = useState(false)

  // Copy feedback reverts on its own.
  useEffect(() => {
    if (!copied) return
    const t = window.setTimeout(() => setCopied(false), 1800)
    return () => window.clearTimeout(t)
  }, [copied])

  // REAL keyring rows (this device's stored accounts) — empty until loaded.
  const keyringRows = ui.keyringAccounts ?? []
  // The shell only mounts this tab signed-in, so ui.account is set here. Guard
  // the theoretical null honestly (never a fixture) after the hooks above.
  const account = ui.account
  if (!account) {
    return (
      <div className="ahub-overview">
        <p className="muted small">Deriving your account from your signed chain…</p>
      </div>
    )
  }
  const created = daysAgo(account.createdWts, Date.now())
  const rep = account.reputation

  const copyHandle = (): void => {
    void navigator.clipboard?.writeText(account.handle).catch(() => undefined)
    setCopied(true)
  }

  return (
    <div className="ahub-overview">
      {/* ---- Identity (§1): self-derived, verified — never registered ---- */}
      <section className="card ahub-identity" aria-labelledby="ahub-id-title">
        <div className="ahub-identity-main">
          <span className="ahub-avatar" aria-hidden>
            {account.profile.flair}
          </span>
          <div className="ahub-identity-names">
            <h2 id="ahub-id-title">{account.displayName}</h2>
            <div className="ahub-handle-row">
              <code
                className="ahub-handle"
                title="The tag is self-derived from your root-key fingerprint — no registry, no squatting; collisions disambiguate by tag"
              >
                {account.handle}
              </code>
              <button
                type="button"
                className={`icon-btn ahub-copy${copied ? ' is-copied' : ''}`}
                onClick={copyHandle}
                aria-label={copied ? 'Handle copied' : 'Copy handle'}
              >
                {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
              </button>
              {copied && (
                <span className="visually-hidden" role="status">
                  Handle copied to clipboard
                </span>
              )}
              {/* LIVE overlay presence (§4): is this client actually on the
                  fabric right now, and can it reach a third machine. Honest
                  offline/connecting/online — never a fabricated status. */}
              <NetStatusPill style={{ marginLeft: 'var(--space-2)' }} />
            </div>
            <p className="ahub-identity-sub">
              Root key <code>{shortB64u(account.rootPub)}</code>
              <span aria-hidden>·</span>
              <span title="Creation time is your genesis record's own timestamp. Witness-attested (diversity-bound) time lands with network transport — until then this is an author-claimed time, and the UI says so rather than overclaiming.">
                created {created} days ago · self-recorded, not yet witness-attested
              </span>
            </p>
          </div>
          <dl className="ahub-chainstats">
            <div>
              <dt>Chain height</dt>
              <dd className="num">{account.chainHeight.toLocaleString()}</dd>
            </div>
            <div>
              <dt>Signed events</dt>
              <dd className="num">{account.chainEvents.toLocaleString()}</dd>
            </div>
          </dl>
        </div>
      </section>

      {/* ---- Ladders (§6): display states, derived identically everywhere ---- */}
      <section className="ahub-ladders" aria-label="Rating ladders">
        {account.ladders.map((l) => (
          <LadderTile key={l.key} ladder={l} />
        ))}
      </section>

      <div className="ahub-cols">
        <div className="ahub-col">
          {/* ---- Standing (§9): a derivation, not a status flag ---- */}
          <StandingStrip standing={account.standing} />

          {/* ---- Reputation (§6b): public conduct fold, visible from game 1 ---- */}
          <section className="card ahub-rep" aria-labelledby="ahub-rep-title">
            <div className="ahub-rep-main">
              <span
                className={`ahub-rep-dial ${tierClass(rep.tier)}`}
                style={{ '--ahub-score': rep.score } as CSSProperties}
                role="img"
                aria-label={`Conduct score ${rep.score} of 100`}
              >
                <span className="ahub-rep-dial-num num">{rep.score}</span>
              </span>
              <div className="ahub-rep-body">
                <span className="ahub-rep-title" id="ahub-rep-title">
                  Reputation
                  <span className={`ahub-pill ${tierClass(rep.tier)}`}>{rep.tier}</span>
                </span>
                <span className="muted small">
                  Public conduct standing — a fold over witnessed conduct events, recomputable by
                  anyone. Distinct from rating, and it never gates matchmaking.
                </span>
                <span className="ahub-rep-commend muted small">
                  <Handshake size={13} aria-hidden /> {rep.commendations} commendations —
                  countersigned, one per opponent per game
                </span>
              </div>
            </div>
            <button type="button" className="ahub-quicklink" onClick={() => onOpenTab('profile')}>
              See the full breakdown on your profile
              <ChevronRight size={14} aria-hidden className="ahub-quicklink-chev" />
            </button>
          </section>
        </div>

        {/* ---- This device's keyring (§1): several roots, one machine ---- */}
        <section className="panel ahub-keyring" aria-labelledby="ahub-keyring-title">
          <div className="panel-head">
            <span className="ahub-head-icon" aria-hidden>
              <KeyRound size={15} />
            </span>
            <span className="panel-title" id="ahub-keyring-title">
              This device&rsquo;s keyring
            </span>
            <span className="muted small num">
              {keyringRows.length} account{keyringRows.length === 1 ? '' : 's'}
            </span>
          </div>
          <p className="ahub-keyring-intro muted small">
            One computer can hold several accounts — the same name under a different password
            derives a different <code>#TAG</code>. Switching is local: keys never leave this
            device.
          </p>
          <ul className="ahub-keyring-list">
            {keyringRows.map((a) => (
              <li key={a.handle} className={`ahub-keyring-row${a.current ? ' is-current' : ''}`}>
                <span className="ahub-keyring-avatar" aria-hidden>
                  {a.displayName.slice(0, 1)}
                </span>
                <span className="ahub-keyring-id">
                  <span className="ahub-keyring-name">{a.displayName}</span>
                  <code className="ahub-keyring-handle">{a.handle}</code>
                </span>
                {a.current ? (
                  <span className="ahub-pill is-success">
                    <Check size={11} aria-hidden /> Signed in
                  </span>
                ) : (
                  // Honest switch: another account's keys need ITS password
                  // (§1 — signing in is re-derivation), so switching goes
                  // through sign-out to the sign-in form. Never a one-click
                  // impersonation of a different root.
                  <button
                    type="button"
                    className="btn ghost small ahub-ibtn"
                    onClick={() => accountsUiStore.signOut()}
                  >
                    Sign out to switch
                  </button>
                )}
              </li>
            ))}
          </ul>
          <div className="ahub-keyring-links">
            <button type="button" className="ahub-quicklink" onClick={() => onOpenTab('security')}>
              <ShieldCheck size={14} aria-hidden /> Manage devices &amp; PIN
              <ChevronRight size={14} aria-hidden className="ahub-quicklink-chev" />
            </button>
            <button type="button" className="ahub-quicklink" onClick={() => onOpenTab('data')}>
              <Link2 size={14} aria-hidden /> View your chain
              <ChevronRight size={14} aria-hidden className="ahub-quicklink-chev" />
            </button>
          </div>
          <div className="ahub-keyring-foot">
            <span className="muted small">
              Signing out clears this session — your chain and keyring stay on this device.
            </span>
            <button
              type="button"
              className="btn ghost small ahub-ibtn"
              onClick={() => accountsUiStore.signOut()}
            >
              <LogOut size={13} aria-hidden /> Sign out
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
