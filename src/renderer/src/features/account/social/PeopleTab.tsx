import {
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type JSX
} from 'react'
import {
  AlertTriangle,
  Check,
  Loader2,
  Mail,
  RefreshCw,
  Search,
  Signature,
  UserPlus,
  Users,
  X
} from 'lucide-react'
import {
  getSocialClientState,
  runAcceptRequest,
  runDeclineRequest,
  runRemoveFriend,
  runSendFriendRequest,
  runSyncMailbox,
  subscribeSocialClient,
  type FriendPresence,
  type MailPriority,
  type SocialClientState,
  type SocialFriendView,
  type SocialRequestView
} from '../net/socialClient'
import { isAccountRoot } from '../net/viewerClient'
import { ProfilePage } from '../profile/ProfilePage'
import './social.css'

/**
 * People tab — the LIVE social surface (docs/building/ACCOUNTS-SPEC.md §3, §10,
 * C-3), un-fixtured onto the account net's socialClient (net/socialClient.ts):
 *
 *  - Find a player: look anyone up by account root/handle; ProfilePage
 *    reconstructs from shard space (§5), owner online or not — no local index.
 *  - Friends: the witnessed countersigned edges folded from THIS account's OWN
 *    chain (§3, one verifiable list), with each friend's live ephemeral presence
 *    overlaid (§10). Remove is a unilateral signed witnessed event.
 *  - Mailbox: incoming friend requests that the relaying peers held for us until
 *    we synced, in the §10 anti-spam priority order (established senders first,
 *    a sybil flood can never evict them). Accept countersigns the edge into both
 *    chains; decline drops it (ephemeral coordination state, C-3).
 *
 * Every list is live signed data or an honest empty state — NO fixtures, NO dead
 * buttons. When the account peer is still coming up the surface says so.
 */

const MIN = 60_000
const HOUR = 3_600_000
const DAY = 86_400_000

/** Short relative time against the wall clock (renderer glue — real time is
 * allowed here); old timestamps fall back to a date. */
function ago(ts: number): string {
  const d = Date.now() - ts
  if (d < MIN) return 'just now'
  if (d < HOUR) return `${Math.max(1, Math.round(d / MIN))} min ago`
  if (d < DAY) return `${Math.round(d / HOUR)} h ago`
  if (d < 30 * DAY) return `${Math.round(d / DAY)} d ago`
  return new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

/** "Friends since/for …" phrasing relative to the wall clock. */
function friendLabel(since: number | null): string | null {
  if (since === null) return null
  const days = Math.round((Date.now() - since) / DAY)
  if (days < 1) return 'Friends since today'
  if (days === 1) return 'Friends for a day'
  if (days < 60) return `Friends for ${days} days`
  if (days < 540) return `Friends for ${Math.round(days / 30)} months`
  return `Friends for ${Math.round(days / 365)} years`
}

const PRESENCE_META: Record<FriendPresence, { dot: 'online' | 'away' | 'offline'; label: string }> = {
  online: { dot: 'online', label: 'Online now' },
  playing: { dot: 'online', label: 'Playing' },
  away: { dot: 'away', label: 'Away' },
  offline: { dot: 'offline', label: 'Offline' }
}

/** §10 relayer priorities — why this request survived the queue. */
const PRIORITY_META: Record<MailPriority, { label: string; title: string; className: string }> = {
  entangled: {
    label: 'Entangled',
    title: 'Prioritized — an existing countersigned edge (friendship or witnessed game) with this sender',
    className: 'is-entangled'
  },
  reputable: {
    label: 'Reputable',
    title: 'Prioritized — an established conduct/trust record, no edge with you yet',
    className: 'is-reputable'
  },
  new: {
    label: 'New sender',
    title: 'No prior edge — rate-limited to a fair share of your mailbox (a sybil flood cannot evict established requests)',
    className: 'is-new'
  }
}

function PriorityChip({ priority }: { priority: MailPriority }): JSX.Element {
  const meta = PRIORITY_META[priority]
  return (
    <span className={`asoc-prio ${meta.className}`} title={meta.title}>
      {meta.label}
    </span>
  )
}

/** React bridge to the live social client (house useSyncExternalStore pattern —
 * getSocialClientState returns a stable reference between real changes). */
function useSocialClient(): SocialClientState {
  return useSyncExternalStore(subscribeSocialClient, getSocialClientState, getSocialClientState)
}

/**
 * One friend row with the inline two-step remove (arm → confirm → sign the
 * unilateral witnessed removal). §3: removal writes to YOUR chain and the peer
 * cannot block it. The row leaves the list once the fold no longer asserts the
 * edge (or shows an honest "writes when a witness is reachable" note).
 */
function FriendRow({
  friend,
  busy,
  onView,
  onRemove
}: {
  friend: SocialFriendView
  busy: boolean
  onView: (root: string) => void
  onRemove: (root: string) => void
}): JSX.Element {
  const [armed, setArmed] = useState(false)
  const presence = PRESENCE_META[friend.presence]
  const since = friendLabel(friend.since)

  return (
    <li className={`asoc-friend${armed ? ' is-armed' : ''}`}>
      <div className="asoc-friend-row">
        <span
          className={`asoc-presence is-${presence.dot}`}
          role="img"
          aria-label={presence.label}
          title={presence.label}
        />
        <div className="asoc-friend-id">
          <span className="asoc-friend-name">{friend.name ?? friend.label}</span>
          <span className="account-handle-mono muted">{friend.label}</span>
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
          {since && <span className="asoc-friend-since num">{since}</span>}
        </div>
        <div className="asoc-friend-actions">
          <button type="button" className="btn ghost small" onClick={() => onView(friend.root)}>
            View
          </button>
          <button
            type="button"
            className="btn danger small"
            disabled={armed || busy}
            onClick={() => setArmed(true)}
          >
            Remove
          </button>
        </div>
      </div>

      {armed && (
        <div className="asoc-remove-confirm">
          <p className="asoc-remove-note">
            <AlertTriangle size={14} aria-hidden />
            Removal is a unilateral signed witnessed event — it writes to your chain.{' '}
            {friend.name ?? friend.label} is not asked and cannot block it.
          </p>
          <div className="asoc-remove-actions">
            <button
              type="button"
              className="btn ghost small"
              disabled={busy}
              onClick={() => setArmed(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn danger solid small"
              disabled={busy}
              onClick={() => onRemove(friend.root)}
            >
              {busy ? 'Signing removal…' : 'Remove friend'}
            </button>
          </div>
        </div>
      )}
    </li>
  )
}

/** One incoming friend request — the only live mailbox item today (§3 add flow). */
function RequestRow({
  item,
  accepting,
  acceptBusy,
  onAccept,
  onDecline
}: {
  item: SocialRequestView
  accepting: boolean
  acceptBusy: boolean
  onAccept: (id: string) => void
  onDecline: (id: string) => void
}): JSX.Element {
  return (
    <li className="asoc-mail is-friend-request" aria-busy={accepting}>
      <span className="asoc-mail-icon">
        <UserPlus size={16} aria-hidden />
      </span>
      <div className="asoc-mail-body">
        <div className="asoc-mail-top">
          <span className="account-handle-mono">{item.name ?? item.label}</span>
          <span className="asoc-mail-kind">Friend request</span>
          <PriorityChip priority={item.priority} />
          <span className="asoc-mail-time num">{ago(item.ts)}</span>
        </div>

        {accepting ? (
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
              onClick={() => onDecline(item.id)}
            >
              <X size={14} aria-hidden /> Decline
            </button>
          </div>
        )}
      </div>
    </li>
  )
}

export function PeopleTab(): JSX.Element {
  const social = useSocialClient()
  const [selectedHandle, setSelectedHandle] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [acceptingId, setAcceptingId] = useState<string | null>(null)
  const [removingRoot, setRemovingRoot] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // Opening People pulls anything the relays held for us (a best-effort drain;
  // the singleton's own poll keeps it fresh thereafter).
  useEffect(() => {
    void runSyncMailbox()
  }, [])

  const viewProfile = useCallback((root: string) => {
    setSelectedHandle(root)
  }, [])

  const onAccept = useCallback((id: string) => {
    setAcceptingId(id)
    setNotice(null)
    void runAcceptRequest(id).then((r) => {
      setAcceptingId(null)
      if (!r.ok)
        setNotice(
          r.reason === 'edge-pending-witness'
            ? 'Consent sent — the countersigned edge lands in your chain once a witness is reachable.'
            : `Could not accept (${r.reason ?? 'unavailable'}).`
        )
    })
  }, [])

  const onDecline = useCallback((id: string) => {
    runDeclineRequest(id)
  }, [])

  const onRemove = useCallback((root: string) => {
    setRemovingRoot(root)
    setNotice(null)
    void runRemoveFriend(root).then((r) => {
      setRemovingRoot(null)
      if (!r.ok)
        setNotice(
          r.reason === 'edge-pending-witness'
            ? 'Removal signed — it writes to your chain once a witness is reachable.'
            : `Could not remove (${r.reason ?? 'unavailable'}).`
        )
    })
  }, [])

  const onAdd = useCallback((root: string) => {
    setNotice(null)
    void runSendFriendRequest(root).then((r) => {
      setNotice(
        r.ok
          ? 'Friend request sent — it waits with the recipient’s relaying peers until they next sync.'
          : r.reason === 'no-relay'
            ? 'No relaying peers reachable yet — try again once the network is up.'
            : `Could not send the request (${r.reason ?? 'unavailable'}).`
      )
    })
  }, [])

  // Viewing a profile takes over the whole tab (all hooks live above this).
  if (selectedHandle) {
    return <ProfilePage handle={selectedHandle} onBack={() => setSelectedHandle(null)} />
  }

  const q = query.trim()
  const queryIsRoot = isAccountRoot(q)
  const connecting = social.phase !== 'live'

  // Submitting navigates even for unknown handles — ProfilePage owns the honest
  // empty state for anything that is not a resolvable account root.
  const onSubmit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault()
    if (q) setSelectedHandle(q)
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
                placeholder="Account handle or root — paste a 43-char account id"
                aria-label="Find a player by account handle or root"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <button type="submit" className="btn small" disabled={!q}>
              View
            </button>
            {queryIsRoot && (
              <button
                type="button"
                className="btn ghost small"
                onClick={() => onAdd(q)}
                title="Send a §3 friend request (rides the mailbox — survives them being offline)"
              >
                <UserPlus size={14} aria-hidden /> Add friend
              </button>
            )}
          </form>

          {notice && (
            <p className="asoc-accepted" role="status">
              <Check size={14} aria-hidden />
              {notice}
            </p>
          )}

          <p className="asoc-caption">
            Anyone is viewable — including accounts offline for years. Your client gathers the
            pieces from whoever still holds them and checks the math locally; no server is asked.
            There is no name directory: look someone up by their account id.
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
            <span className="muted small num">{social.friends.length}</span>
          </div>
          <div className="asoc-panel-body">
            {social.friends.length === 0 ? (
              <div className="asoc-empty">
                <Users size={22} aria-hidden />
                <span>
                  {connecting
                    ? 'Connecting to the network — your friends and their presence appear once the account peer is up.'
                    : 'No friends yet. A friendship is a countersigned edge written into both chains — look someone up above and send a request.'}
                </span>
              </div>
            ) : (
              <ul className="asoc-friends">
                {social.friends.map((f) => (
                  <FriendRow
                    key={f.root}
                    friend={f}
                    busy={removingRoot === f.root}
                    onView={viewProfile}
                    onRemove={onRemove}
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
            <span className="muted small num">{social.requests.length}</span>
            <button
              type="button"
              className="btn ghost small"
              style={{ marginLeft: 'auto' }}
              onClick={() => void runSyncMailbox()}
              disabled={connecting || social.busy === 'syncing'}
              title="Drain your relaying peers now"
            >
              <RefreshCw size={13} aria-hidden className={social.busy === 'syncing' ? 'asoc-spin' : ''} />
              Sync
            </button>
          </div>
          <div className="asoc-panel-body">
            {social.requests.length === 0 ? (
              <div className="asoc-empty">
                <Mail size={22} aria-hidden />
                <span>
                  {connecting
                    ? 'Connecting to the network — friend requests held for you arrive on the first sync.'
                    : 'Mailbox clear. New friend requests queue with relaying peers until you next sync.'}
                </span>
              </div>
            ) : (
              <ul className="asoc-mailbox">
                {social.requests.map((m) => (
                  <RequestRow
                    key={m.id}
                    item={m}
                    accepting={acceptingId === m.id}
                    acceptBusy={acceptingId !== null}
                    onAccept={onAccept}
                    onDecline={onDecline}
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
