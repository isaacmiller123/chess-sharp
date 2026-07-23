import { type JSX } from 'react'
import {
  AlertTriangle,
  CircleCheck,
  Database,
  HardDrive,
  Network,
  Radio,
  RefreshCw,
  Server,
  Signature,
  Wifi
} from 'lucide-react'
import { DEV_FIXTURE, MOCK_NOW, OVERLAY_STATUS, SHARD_DUTY, WITNESS_SET } from '../mock/fixtures'
import { FixturePreviewBadge } from '../mock/FixturePreviewBadge'
import { isWebBuild } from '../../../platform'
import { fmtInt, relTime } from './format'

/**
 * §4/§5/§11 — what this node carries and who watches it: shard duty against
 * the per-platform budget, the canonical witness set (with the operator peer
 * labelled for exactly what it is, C-10), and overlay reachability with the
 * honest rated-play boundary. DEV_FIXTURE surface (labeled per panel):
 * static fixtures on the frozen MOCK_NOW clock; no asserted state.
 */

/** §11 advertised budgets: desktop app 300 MB, desktop browser ~50 MB. */
const BUDGET_MB = isWebBuild ? 50 : 300
const BUDGET_CONTEXT = isWebBuild ? 'browser · navigator.storage.persist()' : 'desktop app'

/** C-10, verbatim intent: always-awake, same rules, zero authority. */
const OPERATOR_TITLE =
  'Always-awake operator peer — follows the same rules as every other node, holds zero ' +
  'authority, and is removable without loss of truth or data; only availability at minimal scale.'

export function StoragePanel(): JSX.Element {
  const usedPct = Math.min(100, (SHARD_DUTY.carriedMb / BUDGET_MB) * 100)
  const reachable = OVERLAY_STATUS.witnessesReachable

  return (
    <div className="adata-storage">
      {/* ---- Shard duty (§5 layer 3, §11 budgets) ---- */}
      <section className="panel adata-duty">
        <div className="panel-head">
          <HardDrive size={15} aria-hidden />
          <span className="panel-title">Shard duty</span>
          {DEV_FIXTURE && <FixturePreviewBadge />}
          <span className="muted small">
            {BUDGET_MB} MB budget · {BUDGET_CONTEXT}
          </span>
        </div>
        <div className="adata-duty-body">
          <div className="adata-meter-label num">
            <span>
              Carrying <b>{SHARD_DUTY.carriedMb.toFixed(1)} MB</b> of {BUDGET_MB} MB
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
              <span className="adata-ministat-value num">{fmtInt(SHARD_DUTY.shards)}</span>
              <span className="adata-ministat-label">shards carried</span>
            </div>
            <div className="adata-ministat">
              <span className="adata-ministat-value num">{fmtInt(SHARD_DUTY.accounts)}</span>
              <span className="adata-ministat-label">accounts served</span>
            </div>
            <div className="adata-ministat">
              <span className="adata-ministat-value num">
                {fmtInt(SHARD_DUTY.repairsLast24h)}
              </span>
              <span className="adata-ministat-label">repairs last 24 h</span>
            </div>
            <div className="adata-ministat">
              <span className="adata-ministat-value">
                <RefreshCw size={13} aria-hidden /> {relTime(SHARD_DUTY.lastRepairTs, MOCK_NOW)}
              </span>
              <span className="adata-ministat-label">last repair</span>
            </div>
          </div>

          <p className="adata-erasure">
            <Database size={13} aria-hidden /> Every chain is erasure-coded into 40 shards — any 12
            reconstruct it.
          </p>
        </div>
      </section>

      {/* ---- Witness set (§4 canonical set) ---- */}
      <section className="panel adata-wset">
        <div className="panel-head">
          <Signature size={15} aria-hidden />
          <span className="panel-title">Witness set</span>
          {DEV_FIXTURE && <FixturePreviewBadge />}
          <span className="muted small">canonical — closest eligible nodes by key-distance</span>
        </div>
        <div className="adata-wtable-wrap">
          <table className="adata-wtable">
            <thead>
              <tr>
                <th scope="col">Node</th>
                <th scope="col" className="is-num">
                  Key-dist
                </th>
                <th scope="col" className="is-num">
                  Uptime
                </th>
                <th scope="col" className="is-num" title="Entanglement-distance from you">
                  Ent-dist
                </th>
                <th scope="col">Role</th>
              </tr>
            </thead>
            <tbody>
              {WITNESS_SET.map((w) => (
                <tr
                  key={w.nodeId}
                  className={w.online ? undefined : 'is-offline'}
                  title={w.role === 'operator' ? OPERATOR_TITLE : undefined}
                >
                  <td className="adata-wnode">
                    <span
                      className={`adata-dot${w.online ? ' on' : ''}`}
                      role="img"
                      aria-label={w.online ? 'Online' : 'Offline'}
                      title={w.online ? 'Online' : 'Offline'}
                    />
                    <span className="adata-mono">{w.handle}</span>
                  </td>
                  <td className="is-num num">#{w.distance}</td>
                  <td className="is-num num">{w.uptimePct.toFixed(w.uptimePct >= 99.9 ? 2 : 1)}%</td>
                  <td className="is-num num">{w.entanglementDist}</td>
                  <td>
                    <span className={`adata-role is-${w.role}`}>{w.role}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="adata-eligibility muted small">
          Eligibility: minimum own-trust, attested uptime, and entanglement-distance from you above
          a floor — someone you mostly play cannot witness you.
        </p>
      </section>

      {/* ---- Overlay (§5 routing, C-11 signaling, §4 honest boundary) ---- */}
      <section className="panel adata-overlay">
        <div className="panel-head">
          <Network size={15} aria-hidden />
          <span className="panel-title">Overlay</span>
          {DEV_FIXTURE && <FixturePreviewBadge />}
          <span className="muted small">key-distance routing over WebRTC data channels</span>
        </div>
        <div className="adata-overlay-body">
          <div className="adata-overlay-stats">
            <span className="adata-net-item">
              <Wifi size={14} aria-hidden />
              <b className="num">{fmtInt(OVERLAY_STATUS.peers)}</b> peers
            </span>
            <span className="adata-net-item">
              <Radio size={14} aria-hidden />
              <b className="num">
                {OVERLAY_STATUS.relays.connected}/{OVERLAY_STATUS.relays.total}
              </b>{' '}
              relays — Nostr signaling + TURN, replaceable
            </span>
            <span className="adata-net-item" title={OPERATOR_TITLE}>
              <Server size={14} aria-hidden />
              operator peer
              <span
                className={`adata-dot${OVERLAY_STATUS.operatorReachable ? ' on' : ''}`}
                aria-hidden
              />
              {OVERLAY_STATUS.operatorReachable ? 'reachable' : 'unreachable'}
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
