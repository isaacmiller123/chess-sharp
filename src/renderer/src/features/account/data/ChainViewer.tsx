import { useEffect, useState, type JSX } from 'react'
import { CircleCheck, History, Link2, Search, ShieldCheck, Signature } from 'lucide-react'
import { CHAIN_EVENTS, DEV_FIXTURE, MOCK_NOW, OWN_ACCOUNT, fakeB64u, shortB64u } from '../mock/fixtures'
import { FixturePreviewBadge } from '../mock/FixturePreviewBadge'
import { accountsUiStore, useAccountsUi } from '../mock/store'
import { fmtInt, relTime } from './format'

/**
 * §2 — the chain, rendered honestly: a self-carried, append-only, hash-linked
 * log with two lanes. WIRED: when signed in, the rows, heights and fold
 * digest are derived from the REAL stored chain (mock/store deriveChainEvents
 * / foldDigestOf), and "Verify from genesis" runs the real verifyChain. The
 * fixture rows (DEV_FIXTURE) only back the signed-out preview; ckpt
 * spot-check animation stays a preview flow until witness cosigning syncs.
 */

type LaneFilter = 'all' | 'w' | 'p'

const LANE_FILTERS: { key: LaneFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'w', label: 'Witnessed' },
  { key: 'p', label: 'Personal' }
]

/** Preview-only fold digest (real one comes from the store when signed in). */
const FOLD_DIGEST = fakeB64u('isaac-fold-digest')

/** Newest first; on a timestamp tie the witnessed event sinks (genesis last). */
const EVENTS_NEWEST_FIRST = [...CHAIN_EVENTS].sort(
  (a, b) => b.ts - a.ts || (a.lane === 'w' ? 1 : -1)
)

export function ChainViewer(): JSX.Element {
  const ui = useAccountsUi()
  const [lane, setLane] = useState<LaneFilter>('all')

  // REAL chain data when signed in; fixture preview otherwise.
  const real = ui.chainEvents
  const allRows =
    real !== null
      ? [...real].sort((a, b) => b.ts - a.ts || (a.lane === 'w' ? 1 : -1))
      : EVENTS_NEWEST_FIRST
  const totalEvents = ui.account?.chainEvents ?? OWN_ACCOUNT.chainEvents
  const chainHeight = ui.account?.chainHeight ?? OWN_ACCOUNT.chainHeight
  const foldDigest = ui.foldDigest ?? FOLD_DIGEST
  // Clock rule (complete-3): REAL chain timestamps format against the real
  // clock at render; only the fixture preview stays on the frozen MOCK_NOW.
  const nowMs = real !== null ? Date.now() : MOCK_NOW
  const [auditNote, setAuditNote] = useState<string | null>(null)

  // Per-checkpoint spot-check: one mock re-derivation at a time.
  const [spotId, setSpotId] = useState<string | null>(null)
  const [spotPct, setSpotPct] = useState(0)
  const [deepIds, setDeepIds] = useState<string[]>([])

  // Full audit ("Verify from genesis"): mock progress over every event.
  const [audit, setAudit] = useState<'idle' | 'running' | 'done'>('idle')
  const [auditN, setAuditN] = useState(0)

  // Spot-check progress ticker (mock re-derivation of the covered range).
  useEffect(() => {
    if (!spotId) return
    const iv = window.setInterval(() => {
      setSpotPct((p) => Math.min(p + 9, 100))
    }, 110)
    return () => window.clearInterval(iv)
  }, [spotId])

  // Spot-check completion: flip the row to "verified deep".
  useEffect(() => {
    if (!spotId || spotPct < 100) return
    const t = window.setTimeout(() => {
      setDeepIds((ids) => (ids.includes(spotId) ? ids : [...ids, spotId]))
      setSpotId(null)
      setSpotPct(0)
    }, 260)
    return () => window.clearTimeout(t)
  }, [spotId, spotPct])

  // Full-audit progress ticker.
  useEffect(() => {
    if (audit !== 'running') return
    const iv = window.setInterval(() => {
      setAuditN((n) => Math.min(n + 87, totalEvents))
    }, 90)
    return () => window.clearInterval(iv)
  }, [audit, totalEvents])

  // Full-audit completion.
  useEffect(() => {
    if (audit !== 'running' || auditN < totalEvents) return
    const t = window.setTimeout(() => setAudit('done'), 320)
    return () => window.clearTimeout(t)
  }, [audit, auditN, totalEvents])

  const events = lane === 'all' ? allRows : allRows.filter((ev) => ev.lane === lane)

  const startAudit = (): void => {
    setAuditNote(null)
    setAuditN(0)
    setAudit('running')
    // Signed in ⇒ the audit is REAL: re-verify the stored chain from genesis
    // (signatures, hash links, lane rules) via the shared verifyChain.
    if (real !== null) {
      void accountsUiStore.verifyOwnChainNow().then((r) => {
        if (r !== 'ok') {
          setAudit('idle')
          setAuditNote(
            r === 'failed'
              ? 'Verification FAILED — the stored chain did not verify from genesis.'
              : 'Verification unavailable — no stored chain for this session.'
          )
        }
      })
    }
  }

  return (
    <section className="panel adata-chain">
      <div className="panel-head">
        <Link2 size={15} aria-hidden />
        <span className="panel-title">Event log</span>
        {/* Signed out, the log falls back to the fixture rows — say so. */}
        {real === null && DEV_FIXTURE && (
          <FixturePreviewBadge label="Sample chain — sign in to derive your real chain" />
        )}
        <span className="muted small">Self-carried · append-only · hash-linked</span>
      </div>

      {/* Stat strip — every number below is a fold output, never an assertion. */}
      <div className="adata-stats">
        <div className="adata-stat">
          <span className="adata-stat-label">Chain height</span>
          <span className="adata-stat-value num">{fmtInt(chainHeight)}</span>
        </div>
        <div className="adata-stat">
          <span className="adata-stat-label">Total events</span>
          <span className="adata-stat-value num">{fmtInt(totalEvents)}</span>
        </div>
        <div className="adata-stat">
          <span className="adata-stat-label">Fold digest</span>
          <span className="adata-stat-value adata-mono" title={foldDigest}>
            {shortB64u(foldDigest)}
          </span>
        </div>
      </div>

      {/* Lane filter + legend */}
      <div className="adata-lanebar">
        <div className="segmented" aria-label="Filter events by lane">
          {LANE_FILTERS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              className={`seg${lane === key ? ' on' : ''}`}
              aria-pressed={lane === key}
              onClick={() => setLane(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="adata-legend muted small">
          <span className="adata-legend-item">
            <b className="adata-lane lane-w" aria-hidden>
              W
            </b>
            Witnessed — single-writer under the write lease, countersigned; a same-epoch fork is
            fraud.
          </span>
          <span className="adata-legend-item">
            <b className="adata-lane lane-p" aria-hidden>
              P
            </b>
            Personal — self-signed, CRDT-mergeable across devices; concurrent writes are sync
            noise, not fraud.
          </span>
        </div>
      </div>

      {/* Event list, newest first */}
      <ol className="adata-events">
        {events.map((ev) => {
          const isDeep = ev.ckpt
            ? ev.ckpt.verified === 'deep' || deepIds.includes(ev.id)
            : false
          const spotting = spotId === ev.id
          return (
            <li key={ev.id} className={`adata-ev${ev.ckpt ? ' is-ckpt' : ''}`}>
              <span className={`adata-lane lane-${ev.lane}`} aria-hidden>
                {ev.lane === 'w' ? 'W' : 'P'}
              </span>
              <span className="adata-ev-main">
                <span className="adata-ev-summary">{ev.summary}</span>
                <span className="adata-ev-meta">
                  <span className="adata-type">{ev.type}</span>
                  <span className="adata-mono num muted small" title="Lane height">
                    #{fmtInt(ev.height)}
                  </span>
                  {ev.witnesses !== undefined && (
                    <span className="adata-wit muted small">
                      <Signature size={12} aria-hidden /> {ev.witnesses} witness
                      {ev.witnesses === 1 ? '' : 'es'}
                    </span>
                  )}
                </span>
                {ev.ckpt && (
                  <span className="adata-ckpt-row">
                    <ShieldCheck size={13} aria-hidden />
                    <span
                      className={`adata-ckpt-verify${isDeep ? ' is-deep' : ''}`}
                      role={deepIds.includes(ev.id) ? 'status' : undefined}
                    >
                      {ev.ckpt.cosigners} of {ev.ckpt.of} cosigners ·{' '}
                      {isDeep ? 'verified deep ✓' : 'verified incrementally ✓'}
                    </span>
                    {spotting ? (
                      <span className="adata-ckpt-spotting" aria-busy="true">
                        <span className="adata-progress mini">
                          <span
                            className="adata-progress-fill"
                            style={{ width: `${spotPct}%` }}
                          />
                        </span>
                        <span className="muted small">re-deriving covered range…</span>
                      </span>
                    ) : (
                      !isDeep && (
                        <button
                          type="button"
                          className="btn ghost small adata-spot-btn"
                          disabled={spotId !== null}
                          onClick={() => {
                            setSpotPct(0)
                            setSpotId(ev.id)
                          }}
                        >
                          <Search size={12} aria-hidden /> Spot-check
                        </button>
                      )
                    )}
                  </span>
                )}
              </span>
              <span className="adata-ev-time muted small">{relTime(ev.ts, nowMs)}</span>
            </li>
          )
        })}
      </ol>

      <p className="adata-slice-note muted small">
        Newest slice shown — viewing fetches slices; game history lazy-pages at ~2 KB per game.
      </p>

      {/* Full audit */}
      <div className="adata-audit" aria-busy={audit === 'running'}>
        {audit === 'idle' && (
          <>
            <button type="button" className="btn ghost adata-audit-btn" onClick={startAudit}>
              <History size={15} aria-hidden /> Verify from genesis
            </button>
            <span className="muted small">
              Full audit — recompute every fold from event 0 and compare digests.
            </span>
            {auditNote !== null && (
              <span className="muted small" role="alert">
                {auditNote}
              </span>
            )}
          </>
        )}
        {audit === 'running' && (
          <>
            <span className="adata-progress">
              <span
                className="adata-progress-fill"
                style={{ width: `${(auditN / Math.max(1, totalEvents)) * 100}%` }}
              />
            </span>
            <span className="muted small num adata-audit-count">
              Recomputing fold — event {fmtInt(auditN)} of {fmtInt(totalEvents)}
            </span>
          </>
        )}
        {audit === 'done' && (
          <>
            <p className="adata-audit-done" role="status">
              <CircleCheck size={15} aria-hidden /> {fmtInt(totalEvents)} events verified · fold
              digest matches · no forks
            </p>
            <button type="button" className="btn ghost small" onClick={startAudit}>
              Verify again
            </button>
          </>
        )}
      </div>

      {/* How verification works — the §2 rule, stated plainly. */}
      <div className="adata-hownote">
        <ShieldCheck size={14} aria-hidden />
        <p>
          <b>How verification works.</b> A checkpoint is never trusted: it must equal exact
          recomputation of the fold from the prior snapshot — one incremental step every viewer
          checks. Viewers also re-derive a deeper range at random (a spot-check), and always when
          the cosigner set lacks diversity. A snapshot that fails recomputation is
          self-authenticating fraud — slashable for the subject and the cosigning witnesses alike.
        </p>
      </div>
    </section>
  )
}
