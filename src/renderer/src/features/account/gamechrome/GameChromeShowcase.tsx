import { useEffect, useState, type JSX } from 'react'
import { AlertTriangle, CircleCheck, Radio } from 'lucide-react'
import { useAccountNetStatus } from '../net/accountNetStatus'
import { WitnessStrip } from './WitnessStrip'
import { LeaseConflictDialog } from './LeaseConflictDialog'
import { PostGameReceipt } from './PostGameReceipt'
import './gamechrome.css'

/**
 * Preview of the in-game account surfaces (mounted under the Rated play tab,
 * below the lobby). A6 M4: this is an honest, clearly-labelled EXAMPLE of the
 * HUD chrome — the live witness strip / lease dialog / entanglement receipt
 * mount over the board during an actual rated game (wired in the online game
 * flow, not here). What IS live here is the §4 rated-play boundary at the top:
 * whether a third machine is reachable right now to witness a game — read
 * straight off the account peer's presence directory (net/accountNetStatus),
 * never a fabricated status.
 */
export function GameChromeShowcase(): JSX.Element {
  const net = useAccountNetStatus()
  const [attested, setAttested] = useState(true)
  const [conflictOpen, setConflictOpen] = useState(false)

  // Illustrate the move cadence: a move goes out, the witness countersignature
  // lands a beat later — the strip's indicator pulses on each landing. (Example
  // animation; a real game drives this from the live witness stream.)
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

  const witnesses = net.witnessesReachable

  return (
    <section className="agc-showcase" aria-label="In-game surfaces">
      <header>
        <h2 className="agc-title">In-game surfaces</h2>
        {/* LIVE §4 rated-play boundary — the one real, load-bearing status here:
            can a game be witnessed right now. Honest availability, never a dead
            button; the chrome below is a labelled example of the live HUD. */}
        {net.ratedAvailable ? (
          <p className="agc-lead" role="status" style={{ color: 'var(--success)' }}>
            <CircleCheck size={15} aria-hidden /> Rated play available — {witnesses} witness-capable
            third machine{witnesses === 1 ? '' : 's'} reachable to countersign a game.
          </p>
        ) : (
          <p className="agc-lead" role="status" style={{ color: 'var(--warning)' }}>
            <AlertTriangle size={15} aria-hidden />{' '}
            {net.peerLive
              ? 'Rated play waiting — no third machine reachable yet. It needs one witness that is neither player; casual/link play stays available.'
              : 'Overlay offline — the witness fabric comes up on sign-in. Casual/link play stays available.'}
          </p>
        )}
        <p className="agc-lead">
          Below is an <b>example</b> of the chrome that mounts over the board during a real rated
          game: the witness strip rides above it every move, the lease dialog takes the seat when
          another of your devices holds the board, and the receipt lands with the game-over banner.
        </p>
      </header>

      <div className="agc-demo">
        <h3 className="agc-demo-label">During the game — witness strip (example)</h3>
        <WitnessStrip
          witness="sable#J6KT9"
          epoch={12}
          leaseRemainingMs={47_000}
          attested={attested}
        />
        <p className="agc-demo-note">
          The lease TTL renews on heartbeat while this device holds the board; the indicator pulses
          as the witness countersigns each move.
        </p>
      </div>

      <div className="agc-demo">
        <h3 className="agc-demo-label">Second device — “playing elsewhere” (example)</h3>
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
        <h3 className="agc-demo-label">After the game — entanglement receipt (example)</h3>
        <PostGameReceipt />
      </div>

      {conflictOpen && <LeaseConflictDialog onClose={() => setConflictOpen(false)} />}
    </section>
  )
}
