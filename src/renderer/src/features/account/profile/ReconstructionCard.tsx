// §5 viewing flow, staged: nobody is hosting the account, so the viewer
// gathers the pieces and checks the math itself. resolve → pointers → holders
// → shards → verify, ~600ms per stage (mock timers with cleanup — the UI is
// unwired by design). Every number rendered comes from the profile fixture's
// reconstruction/checkpoint data, so the copy stays spec-honest.

import { useEffect, useRef, useState, type JSX } from 'react'
import { Check, Database, Link2, Loader2, Scale, Search, Server, ShieldCheck } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { UiProfile } from '../mock/types'

const STEP_MS = 620
const STAGE_COUNT = 5
const TAIL_MS = 450

export function ReconstructionCard({
  profile,
  onDone
}: {
  profile: UiProfile
  onDone: () => void
}): JSX.Element {
  const [stageIdx, setStageIdx] = useState(0)
  const [shardsGot, setShardsGot] = useState(0)
  const onDoneRef = useRef(onDone)

  useEffect(() => {
    onDoneRef.current = onDone
  }, [onDone])

  // One elapsed-time driver: advances the stage every STEP_MS, animates the
  // erasure meter inside the shards stage, then hands off after a short beat.
  useEffect(() => {
    setStageIdx(0)
    setShardsGot(0)
    const need = profile.reconstruction.shardsNeed
    const t0 = Date.now()
    const id = window.setInterval(() => {
      const elapsed = Date.now() - t0
      setStageIdx(Math.min(Math.floor(elapsed / STEP_MS), STAGE_COUNT))
      const frac = Math.min(1, Math.max(0, (elapsed - 3 * STEP_MS) / STEP_MS))
      setShardsGot(Math.round(frac * need))
      if (elapsed >= STAGE_COUNT * STEP_MS + TAIL_MS) {
        window.clearInterval(id)
        onDoneRef.current()
      }
    }, 60)
    return () => window.clearInterval(id)
  }, [profile])

  const r = profile.reconstruction
  const ck = profile.checkpoint
  const running = stageIdx < STAGE_COUNT
  // On the floor path fewer shards than needed are reachable — the meter
  // honestly stalls at what survivors hold instead of pretending completion.
  const got = Math.min(shardsGot, r.shardsNeed, r.shardsHave)

  const stages: { key: string; Icon: LucideIcon; title: string; detail: string }[] = [
    {
      key: 'resolve',
      Icon: Search,
      title: 'Resolve key',
      detail: `Overlay lookup — ${r.hops} hops to the key's neighborhood`
    },
    {
      key: 'pointers',
      Icon: Link2,
      title: 'Enumerate pointers',
      detail: `${r.pointerCount.toLocaleString()} authenticated pointer records, ranked by embedded proof · ${r.pointersIgnored} unproven ignored`
    },
    {
      key: 'holders',
      Icon: Server,
      title: 'Contact holders',
      detail: `${r.holdersOnline} of the 3–5 freshest holders answering`
    },
    {
      key: 'shards',
      Icon: Database,
      title: 'Reassemble chain',
      detail: `${got} of ${r.shardsNeed} shards needed · ${r.shardsHave} of ${r.shardsTotal} reachable`
    },
    {
      key: 'verify',
      Icon: ShieldCheck,
      title: 'Verify checkpoint',
      detail: `#${ck.height.toLocaleString()} · ${ck.cosigners}-of-${ck.of} cosigned · verified ${ck.verified}${
        ck.mOfN ? '' : ' · BELOW the M-of-N cosigner threshold — surfaced honestly'
      }${r.spotChecked ? ' · spot-check: deeper range re-derived' : ''}${
        r.path === 'floor' ? ' · floor path: no verified chain — degraded view' : ''
      }`
    }
  ]

  return (
    <section className="card aprof-card aprof-rail aprof-recon" aria-busy={running}>
      <header className="aprof-card-head">
        <span className="aprof-eyebrow">
          <Database size={14} aria-hidden /> Reconstructing{' '}
          <span className="account-handle-mono">{profile.handle}</span>
        </span>
        <p className="aprof-card-sub muted small">
          Nobody is hosting this account right now — gathering the pieces from peers and checking
          the math locally.
        </p>
      </header>

      <ol className="aprof-stages">
        {stages.map((s, i) => {
          const done = i < stageIdx
          const active = running && i === stageIdx
          return (
            <li
              key={s.key}
              className={`aprof-stage${done ? ' is-done' : active ? ' is-active' : ' is-pending'}`}
            >
              <span className="aprof-stage-mark" aria-hidden>
                {done ? (
                  <Check size={14} />
                ) : active ? (
                  <Loader2 size={14} className="aprof-spin" />
                ) : (
                  <s.Icon size={14} />
                )}
              </span>
              <span className="aprof-stage-body">
                <span className="aprof-stage-title">{s.title}</span>
                {(done || active) && (
                  <span className="aprof-stage-detail muted small num">{s.detail}</span>
                )}
                {s.key === 'shards' && (done || active) && (
                  <span
                    className="aprof-shardmeter"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={r.shardsNeed}
                    aria-valuenow={got}
                    aria-label="Shards reassembled"
                  >
                    <span
                      className="aprof-shardmeter-fill"
                      style={{ width: `${(got / r.shardsNeed) * 100}%` }}
                    />
                  </span>
                )}
              </span>
            </li>
          )
        })}
      </ol>

      <footer className="aprof-card-foot muted small">
        <Scale size={13} aria-hidden />
        {r.path === 'floor'
          ? 'Reconstruction floor: fewer shard rows than needed reached — the view is degraded, self-healing, and never silent about it (C-12). Background repair heals as carriers return.'
          : 'Guaranteed: the union of what survivors hold. Expected: everything — background repair heals the rest.'}
      </footer>

      <span className="visually-hidden" role="status">
        {running
          ? `${stages[Math.min(stageIdx, STAGE_COUNT - 1)].title}…`
          : 'Chain verified — opening profile'}
      </span>
    </section>
  )
}
