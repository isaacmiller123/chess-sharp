import { useEffect, useState, type JSX } from 'react'
import { Check, Loader2, RefreshCw } from 'lucide-react'
import { DEV_FIXTURE, fakeB64u, shortB64u } from '../mock/fixtures'
import { FixturePreviewBadge } from '../mock/FixturePreviewBadge'
import type { UiVerdict } from '../mock/types'

/**
 * Receipts always (§8): the accused — or anyone — re-runs the exact judge on
 * the exact transcripts and compares verdict bits against the published
 * record. The re-run here is a deterministic DEV_FIXTURE mock (labeled in the
 * UI): a per-game progress tick, then the bit-identical comparison.
 */

/** ~60 ms per mock "game" keeps a 48-game re-run under three seconds. */
const TICK_MS = 60

export function JudgeReceipts({ verdict }: { verdict: UiVerdict }): JSX.Element {
  const [phase, setPhase] = useState<'idle' | 'running' | 'done'>('idle')
  const [game, setGame] = useState(0)

  const total = verdict.window.games

  // Advance one judged game per tick while the mock re-run is going.
  useEffect(() => {
    if (phase !== 'running') return
    const id = window.setInterval(() => {
      setGame((g) => Math.min(g + 1, total))
    }, TICK_MS)
    return () => window.clearInterval(id)
  }, [phase, total])

  // When the last game lands, hold a beat, then show the comparison result.
  useEffect(() => {
    if (phase !== 'running' || game < total) return
    const t = window.setTimeout(() => setPhase('done'), 350)
    return () => window.clearTimeout(t)
  }, [phase, game, total])

  // Deterministic fake digest: same verdict → same bits, locally and published.
  const digest = shortB64u(fakeB64u(`${verdict.id}-bits`))

  const start = (): void => {
    setGame(0)
    setPhase('running')
  }

  return (
    <div className="afair-receipts">
      {DEV_FIXTURE && <FixturePreviewBadge label="Sample re-run — the real judge arrives with wiring" />}
      <p className="afair-receipts-caption">
        The accused can re-run the exact judge on the exact transcripts — receipts, not
        accusations.
      </p>

      {phase === 'idle' && (
        <button type="button" className="btn ghost afair-receipts-run" onClick={start}>
          <RefreshCw size={14} aria-hidden /> Re-run this verdict locally
        </button>
      )}

      {phase === 'running' && (
        <div className="afair-receipts-progress" aria-busy="true">
          <div className="afair-receipts-bar" aria-hidden>
            <div
              className="afair-receipts-fill"
              style={{ width: `${(game / total) * 100}%` }}
            />
          </div>
          <p className="afair-receipts-line">
            <Loader2 size={13} aria-hidden className="afair-spin" />
            game {Math.min(game + 1, total)} of {total} ·{' '}
            {verdict.nodesPerMove.toLocaleString('en-US')} nodes/move · single-thread
          </p>
        </div>
      )}

      {phase === 'done' && (
        <div className="afair-receipts-done" role="status">
          <p className="afair-receipts-verdict">
            <Check size={15} aria-hidden />
            Your verdict bits match the published record — {total} of {total} games reproduce
            bit-identically.
          </p>
          <p className="afair-receipts-digest">
            local {digest} ≡ published {digest}
          </p>
          <button type="button" className="btn ghost afair-receipts-run" onClick={start}>
            <RefreshCw size={14} aria-hidden /> Run again
          </button>
        </div>
      )}
    </div>
  )
}
