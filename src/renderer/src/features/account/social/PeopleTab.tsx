import { useCallback, useEffect, useState, type FormEvent, type JSX } from 'react'
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Handshake,
  Loader2,
  Mail,
  Search,
  Signature,
  Swords,
  UserPlus,
  Users,
  X
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { UiFriend, UiMailItem, UiProfile } from '../mock/types'
import { DEV_FIXTURE, FRIENDS, MAILBOX, MOCK_NOW, PROFILES } from '../mock/fixtures'
import { FixturePreviewBadge } from '../mock/FixturePreviewBadge'
import { ProfilePage } from '../profile/ProfilePage'
import './social.css'

/**
 * People tab — the A-UI social surface (docs/ACCOUNTS-SPEC.md §3, §10, §12 C-3).
 *
 * Three sections: find a player (anyone is viewable, §5 reconstruction is local
 * math), friends (witnessed countersigned edges — one verifiable list, §3), and
 * the mailbox (relayer anti-spam priorities, §10; the mailbox itself is
 * ephemeral coordination state, C-3). Friends and mailbox are local state so
 * accept/decline/remove behave. DEV_FIXTURE surface (labeled per panel):
 * friends, mailbox and searchable profiles are sample data gated on the flag —
 * friends transport, presence and the mailbox need the network.
 */

const MIN = 60_000
const HOUR = 3_600_000
const DAY = 86_400_000

/** Short relative time against MOCK_NOW; old timestamps fall back to a date. */
function ago(ts: number): string {
  const d = MOCK_NOW - ts
  if (d < HOUR) return `${Math.max(1, Math.round(d / MIN))} min ago`
  if (d < DAY) return `${Math.round(d / HOUR)} h ago`
  if (d < 30 * DAY) return `${Math.round(d / DAY)} d ago`
  return new Date(ts).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

/** "Friends since/for …" phrasing relative to MOCK_NOW. */
function friendLabel(since: number): string {
  const days = Math.round((MOCK_NOW - since) / DAY)
  if (days < 1) return 'Friends since today'
  if (days === 1) return 'Friends for a day'
  if (days < 60) return `Friends for ${days} days`
  if (days < 540) return `Friends for ${Math.round(days / 30)} months`
  return `Friends for ${Math.round(days / 365)} years`
}

const PRESENCE_LABEL: Record<UiFriend['presence'], string> = {
  online: 'Online now',
  away: 'Away',
  offline: 'Offline'
}

const KIND_META: Record<UiMailItem['kind'], { label: string; Icon: LucideIcon }> = {
  'friend-request': { label: 'Friend request', Icon: UserPlus },
  commendation: { label: 'Commendation', Icon: Handshake },
  'rematch-invite': { label: 'Rematch invite', Icon: Swords }
}

/** §10 relayer priorities — why this item survived the queue. */
const PRIORITY_META: Record<
  UiMailItem['priority'],
  { label: string; title: string; className: string }
> = {
  entangled: {
    label: 'Entangled',
    title: 'Prioritized — an existing countersigned edge with this sender',
    className: 'is-entangled'
  },
  reputable: {
    label: 'Reputable',
    title: 'Prioritized — established conduct record, no edge with you yet',
    className: 'is-reputable'
  },
  new: {
    label: 'New sender',
    title: 'No prior edge — rate-limited to a fair share of your mailbox',
    className: 'is-new'
  }
}

function PriorityChip({ priority }: { priority: UiMailItem['priority'] }): JSX.Element {
  const meta = PRIORITY_META[priority]
  return (
    <span className={`asoc-prio ${meta.className}`} title={meta.title}>
      {meta.label}
    </span>
  )
}

/**
 * One friend row with the inline two-step remove (arm → confirm → mock the
 * sign-and-witness round, then the row disappears). §3: removal is unilateral.
 */
function FriendRow({
  friend,
  onView,
  onRemove
}: {
  friend: UiFriend
  onView: (handle: string) => void
  onRemove: (handle: string) => void
}): JSX.Element {
  const [phase, setPhase] = useState<'idle' | 'armed' | 'removing'>('idle')

  // Mock the signing round before the edge leaves the local list.
  useEffect(() => {
    if (phase !== 'removing') return
    const t = window.setTimeout(() => onRemove(friend.handle), 800)
    return () => window.clearTimeout(t)
  }, [phase, onRemove, friend.handle])

  const removing = phase === 'removing'

  return (
    <li className={`asoc-friend${phase !== 'idle' ? ' is-armed' : ''}`}>
      <div className="asoc-friend-row">
        <span
          className={`asoc-presence is-${friend.presence}`}
          role="img"
          aria-label={PRESENCE_LABEL[friend.presence]}
          title={PRESENCE_LABEL[friend.presence]}
        />
        <div className="asoc-friend-id">
          <span className="asoc-friend-name">{friend.displayName}</span>
          <span className="account-handle-mono muted">{friend.handle}</span>
        </div>
        <div className="asoc-friend-meta">
          {friend.countersigned && (
            <span
              className="asoc-edge"
              title="Witnessed countersigned edge — one verifiable list, the same for every viewer"
            >
              <Signature size={13} aria-hidden /> Countersigned ×2
            </span>
          )}
          <span className="asoc-friend-since num">{friendLabel(friend.since)}</span>
        </div>
        <div className="asoc-friend-actions">
          <button type="button" className="btn ghost small" onClick={() => onView(friend.handle)}>
            View
          </button>
          <button
            type="button"
            className="btn danger small"
            disabled={phase !== 'idle'}
            onClick={() => setPhase('armed')}
          >
            Remove
          </button>
        </div>
      </div>

      {phase !== 'idle' && (
        <div className="asoc-remove-confirm">
          <p className="asoc-remove-note">
            <AlertTriangle size={14} aria-hidden />
            Removal is a unilateral signed witnessed event — it writes to your chain.{' '}
            {friend.displayName} is not asked and cannot block it.
          </p>
          <div className="asoc-remove-actions">
            <button
              type="button"
              className="btn ghost small"
              disabled={removing}
              onClick={() => setPhase('idle')}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn danger solid small"
              disabled={removing}
              onClick={() => setPhase('removing')}
            >
              {removing ? 'Signing removal…' : 'Remove friend'}
            </button>
          </div>
        </div>
      )}
    </li>
  )
}

/** One mailbox item. Only friend requests carry actions; commendations are warm and read-only. */
function MailRow({
  item,
  accepting,
  acceptBusy,
  onAccept,
  onDismiss
}: {
  item: UiMailItem
  /** This item is mid-countersign. */
  accepting: boolean
  /** Some accept is in flight — hold other accepts meanwhile. */
  acceptBusy: boolean
  onAccept: (id: string) => void
  onDismiss: (id: string) => void
}): JSX.Element {
  const { label, Icon } = KIND_META[item.kind]

  return (
    <li className={`asoc-mail is-${item.kind}`} aria-busy={accepting}>
      <span className="asoc-mail-icon">
        <Icon size={16} aria-hidden />
      </span>
      <div className="asoc-mail-body">
        <div className="asoc-mail-top">
          <span className="account-handle-mono">{item.from}</span>
          <span className="asoc-mail-kind">{label}</span>
          <PriorityChip priority={item.priority} />
          <span className="asoc-mail-time num">{ago(item.ts)}</span>
        </div>

        {item.note && <p className="asoc-mail-note">“{item.note}”</p>}

        {item.kind === 'commendation' && (
          <p className="asoc-mail-warm">
            Commended you — good sportsmanship, recorded once per opponent per game and counted by
            your reputation fold. Nothing to answer.
          </p>
        )}

        {item.kind === 'friend-request' &&
          (accepting ? (
            <span className="asoc-mail-busy" role="status">
              <Loader2 size={14} className="asoc-spin" aria-hidden />
              Countersigning acceptance — writing the edge into both chains…
            </span>
          ) : (
            <div className="asoc-mail-actions">
              <button
                type="button"
                className="btn small"
                disabled={acceptBusy}
                onClick={() => onAccept(item.id)}
              >
                <Check size={14} aria-hidden /> Accept
              </button>
              <button
                type="button"
                className="btn ghost small"
                disabled={acceptBusy}
                onClick={() => onDismiss(item.id)}
              >
                <X size={14} aria-hidden /> Decline
              </button>
            </div>
          ))}

        {item.kind === 'rematch-invite' && (
          <div className="asoc-mail-actions">
            <span className="asoc-mail-hint">Answer rematch invites from Rated play.</span>
            <button type="button" className="btn ghost small" onClick={() => onDismiss(item.id)}>
              Dismiss
            </button>
          </div>
        )}
      </div>
    </li>
  )
}

export function PeopleTab(): JSX.Element {
  const [selectedHandle, setSelectedHandle] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  // Fixture data gated on DEV_FIXTURE: when the flag flips off with transport,
  // these degrade to their honest empty states instead of sample rows.
  const [friends, setFriends] = useState<UiFriend[]>(DEV_FIXTURE ? FRIENDS : [])
  const [mail, setMail] = useState<UiMailItem[]>(DEV_FIXTURE ? MAILBOX : [])
  const [acceptingId, setAcceptingId] = useState<string | null>(null)
  const [justAccepted, setJustAccepted] = useState<string | null>(null)

  const viewProfile = useCallback((handle: string) => {
    setSelectedHandle(handle)
  }, [])

  const removeFriend = useCallback((handle: string) => {
    setFriends((fs) => fs.filter((f) => f.handle !== handle))
  }, [])

  const acceptMail = useCallback((id: string) => {
    setAcceptingId(id)
  }, [])

  const dismissMail = useCallback((id: string) => {
    setMail((ms) => ms.filter((m) => m.id !== id))
  }, [])

  // Accept = countersign the pending request (§3): mock the witness round,
  // then land the new edge in the local friends list.
  useEffect(() => {
    if (!acceptingId) return
    const item = mail.find((m) => m.id === acceptingId)
    if (!item) {
      setAcceptingId(null)
      return
    }
    const t = window.setTimeout(() => {
      setFriends((fs) =>
        fs.some((f) => f.handle === item.from)
          ? fs
          : [
              {
                handle: item.from,
                displayName: item.from.split('#')[0] ?? item.from,
                presence: 'online',
                since: MOCK_NOW,
                countersigned: true
              },
              ...fs
            ]
      )
      setMail((ms) => ms.filter((m) => m.id !== item.id))
      setJustAccepted(item.from)
      setAcceptingId(null)
    }, 900)
    return () => window.clearTimeout(t)
  }, [acceptingId, mail])

  // The countersigned confirmation lingers briefly, then clears.
  useEffect(() => {
    if (!justAccepted) return
    const t = window.setTimeout(() => setJustAccepted(null), 6000)
    return () => window.clearTimeout(t)
  }, [justAccepted])

  // Viewing a profile takes over the whole tab (hooks all live above this).
  if (selectedHandle) {
    return <ProfilePage handle={selectedHandle} onBack={() => setSelectedHandle(null)} />
  }

  const q = query.trim().toLowerCase()
  const matches: UiProfile[] = q
    ? Object.keys(PROFILES)
        .map((key) => PROFILES[key])
        .filter((p): p is UiProfile => Boolean(p))
        .filter(
          (p) => p.displayName.toLowerCase().includes(q) || p.handle.toLowerCase().includes(q)
        )
    : []

  // Submitting navigates even for unknown handles — ProfilePage owns the
  // honest empty state. A single local match resolves to its full handle.
  const onSubmit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault()
    const raw = query.trim()
    if (!raw) return
    const only = matches.length === 1 ? matches[0] : undefined
    setSelectedHandle(only ? only.handle : raw)
  }

  return (
    <div className="asoc-people">
      {/* ---- Find player (§5: anyone is viewable, verification is local) ---- */}
      <section className="panel asoc-find">
        <div className="panel-head">
          <span className="asoc-head-icon">
            <Search size={15} aria-hidden />
          </span>
          <span className="panel-title">Find a player</span>
        </div>
        <div className="asoc-panel-body">
          <form className="asoc-search" role="search" onSubmit={onSubmit}>
            <div className="asoc-search-box">
              <Search size={15} aria-hidden className="asoc-search-icon" />
              <input
                type="text"
                className="text-input asoc-search-input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Name or handle — e.g. mira#T8FQ2"
                aria-label="Find a player by name or handle"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <button type="submit" className="btn small" disabled={!query.trim()}>
              View
            </button>
          </form>

          {q && (
            <ul className="asoc-suggest">
              {matches.map((p) => (
                <li key={p.handle}>
                  <button
                    type="button"
                    className="asoc-suggest-row"
                    onClick={() => viewProfile(p.handle)}
                  >
                    <span className="asoc-suggest-flair" aria-hidden>
                      {p.flair}
                    </span>
                    <span className="asoc-suggest-name">{p.displayName}</span>
                    <span className="account-handle-mono muted">{p.handle}</span>
                    <span className="asoc-suggest-seen num">
                      last witnessed {ago(p.lastWitnessedWts)}
                    </span>
                    <ChevronRight size={14} aria-hidden className="asoc-suggest-go" />
                  </button>
                </li>
              ))}
              {matches.length === 0 && (
                <li className="asoc-suggest-none">
                  No local match for “{query.trim()}” — submit to look it up on the network anyway.
                </li>
              )}
            </ul>
          )}

          <p className="asoc-caption">
            Anyone is viewable — including accounts offline for years. Your client gathers the
            pieces from whoever still holds them and checks the math locally; no server is asked.
          </p>
        </div>
      </section>

      <div className="asoc-columns">
        {/* ---- Friends (§3: witnessed countersigned edges) ---- */}
        <section className="panel asoc-friends-panel">
          <div className="panel-head">
            <span className="asoc-head-icon">
              <Users size={15} aria-hidden />
            </span>
            <span className="panel-title">Friends</span>
            {DEV_FIXTURE && <FixturePreviewBadge />}
            <span className="muted small num">{friends.length}</span>
          </div>
          <div className="asoc-panel-body">
            {friends.length === 0 ? (
              <div className="asoc-empty">
                <Users size={22} aria-hidden />
                <span>
                  No friends yet. A friendship is a countersigned edge written into both chains —
                  send a request from any profile.
                </span>
              </div>
            ) : (
              <ul className="asoc-friends">
                {friends.map((f) => (
                  <FriendRow
                    key={f.handle}
                    friend={f}
                    onView={viewProfile}
                    onRemove={removeFriend}
                  />
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* ---- Mailbox (§10 anti-spam; C-3 ephemeral coordination state) ---- */}
        <section className="panel asoc-mail-panel">
          <div className="panel-head">
            <span className="asoc-head-icon">
              <Mail size={15} aria-hidden />
            </span>
            <span className="panel-title">Mailbox</span>
            {DEV_FIXTURE && <FixturePreviewBadge />}
            <span className="muted small num">{mail.length}</span>
          </div>
          <div className="asoc-panel-body">
            {justAccepted && (
              <p className="asoc-accepted" role="status">
                <Check size={14} aria-hidden />
                Friendship with {justAccepted} countersigned — the edge is now written into both
                chains.
              </p>
            )}

            {mail.length === 0 ? (
              <div className="asoc-empty">
                <Mail size={22} aria-hidden />
                <span>Mailbox clear. New requests queue with relaying peers until you next sync.</span>
              </div>
            ) : (
              <ul className="asoc-mailbox">
                {mail.map((m) => (
                  <MailRow
                    key={m.id}
                    item={m}
                    accepting={acceptingId === m.id}
                    acceptBusy={acceptingId !== null}
                    onAccept={acceptMail}
                    onDismiss={dismissMail}
                  />
                ))}
              </ul>
            )}

            <p className="asoc-caption">
              Relaying peers enforce per-sender-root rate limits and per-recipient fair-share
              quotas, prioritizing senders with an existing entanglement, trust, or reputation
              edge — a sybil flood cannot evict these before you next sync. The mailbox itself is
              ephemeral coordination state: expiring, reconstructible, never account data.
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}
