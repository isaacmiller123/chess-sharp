// §5 viewing flow, staged: nobody is hosting the account, so the viewer gathers
// the pieces and checks the math itself. resolve → pointers → holders → shards →
// verify. Two drive modes, one card:
//   • LIVE (recon === null): the overlay resolve is still in flight — the stages
//     cycle as an indeterminate "gathering" animation and the card never
//     completes on its own; ProfilePage hands in the REAL numbers (and calls the
//     reveal) the moment resolveProfile settles.
//   • SETTLED (recon !== null): the real §5 facts are known (live resolve done,
//     or the offline fixture preview) — the stages advance on a timer and reveal
//     the profile. Every number shown comes from the resolved view (or the
//     fixture), so the copy stays spec-honest; the floor / below-M-of-N /
//     spot-check degradations render exactly as verified, never hidden.

import { useEffect, useRef, useState, type JSX } from 'react'
import { Check, Database, Link2, Loader2, Scale, Search, Server, ShieldCheck } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { UiProfile, UiReconstruction } from '../mock/types'

const STEP_MS = 620
const STAGE_COUNT = 5
const TAIL_MS = 450
/** Indeterminate "gathering" cadence while the live resolve is in flight. */
const PULSE_MS = 520

export type ReconCheckpoint = UiProfile['checkpoint']

export function ReconstructionCard({
  profile,
  handle: handleProp,
  recon: reconProp,
  checkpoint: checkpointProp,
  onDone
}: {
  /** Convenience source (fixture / suite): supplies handle + recon + checkpoint
   *  in one object when the explicit props are omitted. */
  profile?: UiProfile
  handle?: string
  /** The resolved §5 reconstruction facts, or null while the live overlay
   *  resolve is still in flight (indeterminate gathering animation). */
  recon?: UiReconstruction | null
  /** The verified §2 checkpoint surface, or null while resolving. */
  checkpoint?: ReconCheckpoint | null
  /** Called once the staged reveal finishes (SETTLED mode only). */
  onDone: () => void
}): JSX.Element {
  const handle = handleProp ?? profile?.handle ?? ''
  const recon: UiReconstruction | null = reconProp !== undefined ? reconProp : profile?.reconstruction ?? null
  const checkpoint: ReconCheckpoint | null =
    checkpointProp !== undefined ? checkpointProp : profile?.checkpoint ?? null
  const [stageIdx, setStageIdx] = useState(0)
  const [shardsGot, setShardsGot] = useState(0)
  const onDoneRef = useRef(onDone)

  useEffect(() => {
    onDoneRef.current = onDone
  }, [onDone])

  // One elapsed-time driver. SETTLED: advance the stage every STEP_MS, animate
  // the erasure meter inside the shards stage, hand off after a short beat. LIVE
  // (recon === null): cycle the active stage on a pulse and never hand off — the
  // real resolve completing (recon becomes non-null) re-runs this effect.
  useEffect(() => {
    setStageIdx(0)
    setShardsGot(0)
    if (recon === null) {
      let i = 0
      const id = window.setInterval(() => {
        i = (i + 1) % STAGE_COUNT
        setStageIdx(i)
      }, PULSE_MS)
      return () => window.clearInterval(id)
    }
    const need = recon.shardsNeed
    const t0 = Date.now()
    const id = window.setInterval(() => {
      const elapsed = Date.now() - t0
      setStageIdx(Math.min(Math.floor(elapsed / STEP_MS), STAGE_COUNT))
      const frac = Math.min(1, Math.max(0, (elapsed - 3 * STEP_MS) / STEP_MS))
      setShardsGot(Math.round(frac * Math.max(0, need)))
      if (elapsed >= STAGE_COUNT * STEP_MS + TAIL_MS) {
        window.clearInterval(id)
        onDoneRef.current()
      }
    }, 60)
    return () => window.clearInterval(id)
  }, [recon])

  const gathering = recon === null
  const running = gathering || stageIdx < STAGE_COUNT
  // On the floor path fewer shards than needed are reachable — the meter honestly
  // stalls at what survivors hold instead of pretending completion.
  const got = recon ? Math.min(shardsGot, recon.shardsNeed, recon.shardsHave) : 0

  const stages: { key: string; Icon: LucideIcon; title: string; detail: string }[] = [
    {
      key: 'resolve',
      Icon: Search,
      title: 'Resolve key',
      detail: recon ? `Overlay lookup — ${recon.hops} hops to the key's neighborhood` : 'Overlay lookup…'
    },
    {
      key: 'pointers',
      Icon: Link2,
      title: 'Enumerate pointers',
      detail: recon
        ? `${recon.pointerCount.toLocaleString()} authenticated pointer records, ranked by embedded proof${
            recon.pointersIgnored ? ` · ${recon.pointersIgnored} unproven ignored` : ''
          }`
        : 'Authenticated pointer records, ranked by embedded proof…'
    },
    {
      key: 'holders',
      Icon: Server,
      title: 'Contact holders',
      detail: recon ? `${recon.holdersOnline} of the 3–5 freshest holders answering` : 'Contacting the freshest holders…'
    },
    {
      key: 'shards',
      Icon: Database,
      title: 'Reassemble chain',
      detail: recon
        ? `${got} of ${recon.shardsNeed} shards needed · ${recon.shardsHave} of ${recon.shardsTotal} reachable`
        : 'Erasure-coded shards — any 12 of 40 reconstruct…'
    },
    {
      key: 'verify',
      Icon: ShieldCheck,
      title: 'Verify checkpoint',
      detail:
        recon && checkpoint
          ? `#${checkpoint.height.toLocaleString()} · ${checkpoint.cosigners}-of-${checkpoint.of} cosigned · verified ${checkpoint.verified}${
              checkpoint.mOfN ? '' : ' · BELOW the M-of-N cosigner threshold — surfaced honestly'
            }${recon.spotChecked ? ' · spot-check: deeper range re-derived' : ''}${
              recon.path === 'floor' ? ' · floor path: no verified chain — degraded view' : ''
            }`
          : 'Checkpoint incremental verify + spot-check…'
    }
  ]

  return (
    <section className="card aprof-card aprof-rail aprof-recon" aria-busy={running}>
      <header className="aprof-card-head">
        <span className="aprof-eyebrow">
          <Database size={14} aria-hidden /> Reconstructing{' '}
          <span className="account-handle-mono">{handle}</span>
        </span>
        <p className="aprof-card-sub muted small">
          Nobody is hosting this account right now — gathering the pieces from peers and checking
          the math locally.
        </p>
      </header>

      <ol className="aprof-stages">
        {stages.map((s, i) => {
          const done = !gathering && i < stageIdx
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
                {s.key === 'shards' && recon && (done || active) && (
                  <span
                    className="aprof-shardmeter"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={recon.shardsNeed}
                    aria-valuenow={got}
                    aria-label="Shards reassembled"
                  >
                    <span
                      className="aprof-shardmeter-fill"
                      style={{ width: `${recon.shardsNeed ? (got / recon.shardsNeed) * 100 : 0}%` }}
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
        {recon?.path === 'floor'
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
