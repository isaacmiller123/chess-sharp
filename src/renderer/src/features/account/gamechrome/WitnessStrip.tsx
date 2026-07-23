import { useEffect, useState, type JSX } from 'react'
import { FileKey, ShieldCheck, Signature, Timer } from 'lucide-react'

/**
 * §4 in-game witness strip — rides above the board during a rated game,
 * visually kin to the online status bar (features/play/online/OnlineChrome).
 * Shows the game's witness (a third machine, neither player), the write-lease
 * epoch (the fencing token), a live lease TTL, and a countersignature
 * indicator that pulses as the witness countersigns each move.
 *
 * Unwired preview: the TTL is a local countdown. In real play the device's
 * heartbeat renews the lease while it holds the board, so the mock renews the
 * same way when the countdown reaches zero.
 */

function fmtMmSs(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function WitnessStrip({
  witness,
  epoch,
  leaseRemainingMs,
  attested
}: {
  witness: string
  epoch: number
  leaseRemainingMs: number
  attested: boolean
}): JSX.Element {
  const [remainingMs, setRemainingMs] = useState(leaseRemainingMs)

  useEffect(() => {
    setRemainingMs(leaseRemainingMs)
    const id = window.setInterval(() => {
      // Heartbeat renewal: while this device is playing, the lease never
      // actually lapses — the countdown refills instead of hitting a wall.
      setRemainingMs((r) => (r <= 1000 ? leaseRemainingMs : r - 1000))
    }, 1000)
    return () => window.clearInterval(id)
  }, [leaseRemainingMs])

  return (
    <div className="agc-strip" role="group" aria-label="Witness status">
      <span className="agc-strip-tag">
        <ShieldCheck size={13} aria-hidden /> Witnessed
      </span>
      <span
        className="agc-strip-witness agc-mono"
        title="This game's witness — a third machine, neither player, drawn by key-distance"
      >
        {witness}
      </span>
      <span
        className="agc-lease"
        title="fencing token — two valid overlapping-epoch leases are impossible"
      >
        <FileKey size={12} aria-hidden /> epoch {epoch}
      </span>
      <span
        className="agc-lease-ttl num"
        title="Write-lease TTL — the heartbeat renews it while this device is playing"
      >
        <Timer size={12} aria-hidden /> {fmtMmSs(remainingMs)}
      </span>
      {/* Keyed on the attested flag so the pulse animation replays each time a
          fresh countersignature lands. */}
      <span
        key={attested ? 'signed' : 'pending'}
        className={`agc-attest${attested ? ' is-on' : ''}`}
        role="status"
        title="Each move gets witness-countersigned"
      >
        <span className="agc-attest-dot" aria-hidden />
        <Signature size={13} aria-hidden />
        {attested ? 'Move countersigned' : 'Countersigning…'}
      </span>
    </div>
  )
}
