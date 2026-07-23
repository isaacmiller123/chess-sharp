import { useEffect, useState, type JSX } from 'react'
import { Radio } from 'lucide-react'
import { DEV_FIXTURE } from '../mock/fixtures'
import { FixturePreviewBadge } from '../mock/FixturePreviewBadge'
import { WitnessStrip } from './WitnessStrip'
import { LeaseConflictDialog } from './LeaseConflictDialog'
import { PostGameReceipt } from './PostGameReceipt'
import './gamechrome.css'

/**
 * Showcase of the in-game account surfaces (mounted under the Rated play tab,
 * below the lobby). These components are HUD chrome: once wiring lands, the
 * witness strip rides above the board during rated games, the lease-conflict
 * dialog takes the seat when another device holds the write lease, and the
 * entanglement receipt lands with the game-over banner.
 */
export function GameChromeShowcase(): JSX.Element {
  const [attested, setAttested] = useState(true)
  const [conflictOpen, setConflictOpen] = useState(false)

  // Simulate the move cadence: a move goes out, the witness countersignature
  // lands a beat later — the strip's indicator pulses on each landing.
  useEffect(() => {
    let landing: number | undefined
    const id = window.setInterval(() => {
      setAttested(false)
      landing = window.setTimeout(() => setAttested(true), 1200)
    }, 4800)
    return () => {
      window.clearInterval(id)
      if (landing !== undefined) window.clearTimeout(landing)
    }
  }, [])

  return (
    <section className="agc-showcase" aria-label="In-game surfaces">
      <header>
        <h2 className="agc-title">In-game surfaces</h2>
        {/* Witness names, lease state and receipts below are sample data. */}
        {DEV_FIXTURE && <FixturePreviewBadge label="Sample chrome — awaiting network transport" />}
        <p className="agc-lead">
          These mount into the online HUD once wiring lands: the witness strip rides above the
          board through every rated game, the lease dialog takes the seat when another of your
          devices holds the board, and the receipt lands with the game-over banner.
        </p>
      </header>

      <div className="agc-demo">
        <h3 className="agc-demo-label">During the game — witness strip</h3>
        <WitnessStrip
          witness="sable#J6KT9"
          epoch={12}
          leaseRemainingMs={47_000}
          attested={attested}
        />
        <p className="agc-demo-note">
          The lease TTL renews on heartbeat while this device holds the board; the indicator
          pulses as the witness countersigns each move.
        </p>
      </div>

      <div className="agc-demo">
        <h3 className="agc-demo-label">Second device — “playing elsewhere”</h3>
        <div className="agc-conflict-demo">
          <p>
            Witnessed events are single-writer: start a rated game while another of your devices
            holds the live lease, and this dialog takes the seat instead of the board.
          </p>
          <button
            type="button"
            className="btn ghost agc-btn-icon"
            onClick={() => setConflictOpen(true)}
          >
            <Radio size={14} aria-hidden /> Show the conflict
          </button>
        </div>
      </div>

      <div className="agc-demo">
        <h3 className="agc-demo-label">After the game — entanglement receipt</h3>
        <PostGameReceipt />
      </div>

      {conflictOpen && <LeaseConflictDialog onClose={() => setConflictOpen(false)} />}
    </section>
  )
}
