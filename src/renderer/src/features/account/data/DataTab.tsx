import { useEffect, useState, type JSX } from 'react'
import {
  AlertTriangle,
  CircleCheck,
  Database,
  HardDrive,
  Network,
  Radio,
  Server,
  Signature,
  Wifi
} from 'lucide-react'
import { ChainViewer } from './ChainViewer'
import { StoragePanel } from './StoragePanel'
import { fmtInt } from './format'
import { getAccountPeer, type AccountPeer } from '../net/peerService'
import { liveWitnessRows, readStorageStats, type LiveStorageStats, type LiveWitnessRow } from '../net/viewerClient'
import './data.css'

/**
 * Data & network tab (A-UI + A6 M3): the chain (§2) then storage + the fabric
 * (§4/§5/§11). Section intros restate §0 — everything shown is recomputable
 * public signed data, never asserted state.
 *
 * WIRED: when the live account peer is up, the storage/overlay panel renders
 * REAL §5/§11 figures off it — the advertised shard budget, what the persistent
 * store carries, live overlay reachability, and the honest reachable-witness
 * count (the §4 rated-play boundary). Signed out / peer not started ⇒ the
 * clearly-labelled DEV_FIXTURE sample panel (offline preview).
 */

export function DataTab(): JSX.Element {
  // getAccountPeer() is a module singleton (started on sign-in, async); poll so
  // the panel flips to live the moment the peer comes up, and back on sign-out.
  const [peer, setPeer] = useState<AccountPeer | null>(() => getAccountPeer())
  useEffect(() => {
    const id = window.setInterval(() => setPeer(getAccountPeer()), 2000)
    return () => window.clearInterval(id)
  }, [])

  return (
    <div className="adata-tab">
      <header className="adata-sechead">
        <h2 className="adata-sectitle">Your chain</h2>
        <p className="adata-secsub muted">
          Your account is a signed file you carry — an append-only log of signed events. Nothing
          here is asserted: every number is a pure fold over public signed data, recomputable by
          anyone, bit-identically.
        </p>
      </header>
      <ChainViewer />

      <header className="adata-sechead">
        <h2 className="adata-sectitle">Storage &amp; network</h2>
        <p className="adata-secsub muted">
          No database, ever — the network of clients is the storage. Everyone online holds a few
          pieces of everyone else; to view anyone, you gather the pieces and check the math
          yourself.
        </p>
      </header>
      {peer ? <LiveStoragePanel peer={peer} /> : <StoragePanel />}
    </div>
  )
}

/** C-10, verbatim intent: always-awake, same rules, zero authority. */
const OPERATOR_TITLE =
  'Eligible third machines (witness + PIN committee) follow the same rules as every other node, ' +
  'hold zero authority, and are removable without loss of truth or data; only availability.'

/** §4/§5/§11 from the LIVE peer: shard duty against the advertised budget, the
 * live witness-capable set over the directory, and overlay reachability with the
 * honest rated-play boundary. Every figure is read off the peer — never a
 * fixture — and refreshed on a light interval as the directory churns. */
function LiveStoragePanel({ peer }: { peer: AccountPeer }): JSX.Element {
  const [stats, setStats] = useState<LiveStorageStats | null>(null)
  const [witnesses, setWitnesses] = useState<LiveWitnessRow[]>([])

  useEffect(() => {
    let cancelled = false
    const refresh = (): void => {
      setWitnesses(liveWitnessRows(peer))
      void readStorageStats(peer).then((s) => {
        if (!cancelled) setStats(s)
      })
    }
    refresh()
    const id = window.setInterval(refresh, 4000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [peer])

  const budgetMb = stats?.budgetMb ?? peer.caps.shardMb
  const carriedMb = stats?.carriedMb ?? 0
  const usedPct = budgetMb > 0 ? Math.min(100, (carriedMb / budgetMb) * 100) : 0
  const reachable = stats?.witnessesReachable ?? 0

  return (
    <div className="adata-storage">
      {/* ---- Shard duty (§5 layer 3, §11 budgets) ---- */}
      <section className="panel adata-duty">
        <div className="panel-head">
          <HardDrive size={15} aria-hidden />
          <span className="panel-title">Shard duty</span>
          <span className="adata-dot on" role="img" aria-label="Live" title="Live — read off your account peer" />
          <span className="muted small">
            {budgetMb} MB budget{stats?.persisted ? ' · navigator.storage.persist()' : ''}
          </span>
        </div>
        <div className="adata-duty-body">
          <div className="adata-meter-label num">
            <span>
              Carrying <b>{carriedMb.toFixed(1)} MB</b> of {budgetMb} MB
            </span>
            <span className="muted small">{usedPct.toFixed(0)}%</span>
          </div>
          <span className="adata-progress">
            <span className="adata-progress-fill" style={{ width: `${usedPct}%` }} />
          </span>
          <p className="muted small adata-duty-note">
            Capacity is advertised per platform — eviction is churn, and churn is repaired.
          </p>

          <div className="adata-duty-stats">
            <div className="adata-ministat">
              <span className="adata-ministat-value num">{fmtInt(stats?.shards ?? 0)}</span>
              <span className="adata-ministat-label">shards carried</span>
            </div>
            <div className="adata-ministat">
              <span className="adata-ministat-value num">{fmtInt(stats?.accounts ?? 0)}</span>
              <span className="adata-ministat-label">accounts served</span>
            </div>
            <div className="adata-ministat">
              <span className="adata-ministat-value num">{fmtInt(stats?.pointers ?? 0)}</span>
              <span className="adata-ministat-label">pointers held</span>
            </div>
            <div className="adata-ministat">
              <span className="adata-ministat-value num">{fmtInt(stats?.peers ?? 0)}</span>
              <span className="adata-ministat-label">overlay peers</span>
            </div>
          </div>

          <p className="adata-erasure">
            <Database size={13} aria-hidden /> Every chain is erasure-coded into 40 shards — any 12
            reconstruct it.
          </p>
          {(stats?.shards ?? 0) === 0 && (
            <p className="muted small adata-duty-note">
              Not carrying any shard rows yet — duty publishing populates this as witnessed games
              land and repair assigns you carriers.
            </p>
          )}
        </div>
      </section>

      {/* ---- Witness set (§4 eligible live nodes) ---- */}
      <section className="panel adata-wset">
        <div className="panel-head">
          <Signature size={15} aria-hidden />
          <span className="panel-title">Witness-capable peers</span>
          <span className="adata-dot on" role="img" aria-label="Live" />
          <span className="muted small">live, over the presence directory</span>
        </div>
        <div className="adata-wtable-wrap">
          {witnesses.length > 0 ? (
            <table className="adata-wtable">
              <thead>
                <tr>
                  <th scope="col">Node</th>
                  <th scope="col" className="is-num">
                    Uptime
                  </th>
                  <th scope="col" className="is-num">
                    Budget
                  </th>
                  <th scope="col">Role</th>
                </tr>
              </thead>
              <tbody>
                {witnesses.map((w) => (
                  <tr key={w.nodeId} title={OPERATOR_TITLE}>
                    <td className="adata-wnode">
                      <span className="adata-dot on" role="img" aria-label="Online" title="Online" />
                      <span className="adata-mono">{w.handle}</span>
                    </td>
                    <td className="is-num num">{w.uptimePct.toFixed(w.uptimePct >= 99.9 ? 2 : 1)}%</td>
                    <td className="is-num num">{w.shardMb} MB</td>
                    <td>
                      <span className="adata-role is-witness">{w.committee ? 'witness · committee' : 'witness'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="muted small adata-eligibility">
              No third machine is reachable right now — rated play waits for one (casual/link play
              stays available).
            </p>
          )}
        </div>
        <p className="adata-eligibility muted small">
          Eligibility (checked at assignment): minimum own-trust, attested uptime, and
          entanglement-distance from you above a floor — someone you mostly play cannot witness you.
        </p>
      </section>

      {/* ---- Overlay (§5 routing, C-11 signaling, §4 honest boundary) ---- */}
      <section className="panel adata-overlay">
        <div className="panel-head">
          <Network size={15} aria-hidden />
          <span className="panel-title">Overlay</span>
          <span className="adata-dot on" role="img" aria-label="Live" />
          <span className="muted small">key-distance routing over WebRTC data channels</span>
        </div>
        <div className="adata-overlay-body">
          <div className="adata-overlay-stats">
            <span className="adata-net-item">
              <Wifi size={14} aria-hidden />
              <b className="num">{fmtInt(stats?.peers ?? 0)}</b> peers
            </span>
            <span className="adata-net-item">
              <Radio size={14} aria-hidden /> Nostr signaling + TURN, replaceable (C-11)
            </span>
            <span className="adata-net-item" title={OPERATOR_TITLE}>
              <Server size={14} aria-hidden />
              <b className="num">{reachable}</b> witness-capable reachable
            </span>
          </div>

          {reachable >= 1 ? (
            <p className="adata-avail is-ok" role="status">
              <CircleCheck size={15} aria-hidden /> Rated play available — {reachable} eligible
              witness{reachable === 1 ? '' : 'es'} reachable
            </p>
          ) : (
            <p className="adata-avail is-wait" role="status">
              <AlertTriangle size={15} aria-hidden /> Rated play waiting — no third machine
              reachable yet
            </p>
          )}
          <p className="adata-avail-note muted small">
            Rated play needs one witness that is neither player: with exactly two machines online,
            it waits for a third — it degrades honestly, never a dead button.
          </p>
        </div>
      </section>
    </div>
  )
}
