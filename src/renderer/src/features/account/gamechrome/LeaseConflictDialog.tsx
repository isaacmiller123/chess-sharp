import { useEffect, useState, type JSX } from 'react'
import { CircleCheck, KeyRound, Laptop, RefreshCw, X } from 'lucide-react'
import { OverlayDialog } from '../../../components/OverlayDialog'
import { PinEntryDialog } from '../pin/PinEntryDialog'

/**
 * §4 "Playing elsewhere" — the write-lease conflict moment. Another enrolled
 * device holds the live lease, so this device cannot append witnessed events.
 * The user can wait for expiry (the other device's heartbeat keeps renewing
 * while it plays, mirrored by the mock) or take over now — takeover is a
 * PIN-gated witnessed session that advances the lease epoch (fencing token).
 */

const LEASE_TTL_MS = 60_000
const INITIAL_REMAINING_MS = 32_000

function fmtMmSs(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function LeaseConflictDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const [phase, setPhase] = useState<'conflict' | 'pin' | 'granted'>('conflict')
  const [lease, setLease] = useState({ remainingMs: INITIAL_REMAINING_MS, renewals: 0 })

  // The other device is still playing, so its heartbeat renews the lease at
  // expiry — waiting only pays off once it stops. Ticks until takeover.
  useEffect(() => {
    if (phase === 'granted') return
    const id = window.setInterval(() => {
      setLease((l) =>
        l.remainingMs <= 1000
          ? { remainingMs: LEASE_TTL_MS, renewals: l.renewals + 1 }
          : { remainingMs: l.remainingMs - 1000, renewals: l.renewals }
      )
    }, 1000)
    return () => window.clearInterval(id)
  }, [phase])

  return (
    <>
      <OverlayDialog
        onClose={onClose}
        placement="center"
        className="shell-modal"
        labelledBy="agc-lease-title"
      >
        <div className="shell-modal-head">
          <h2 id="agc-lease-title">
            {phase === 'granted' ? 'Lease granted' : 'Playing elsewhere'}
          </h2>
          <button type="button" className="shell-modal-close" aria-label="Close" onClick={onClose}>
            <X size={18} aria-hidden />
          </button>
        </div>

        {phase === 'granted' ? (
          <div className="shell-modal-body">
            <div className="agc-granted" role="status">
              <span className="agc-granted-icon" aria-hidden>
                <CircleCheck size={18} />
              </span>
              <div>
                <p className="agc-granted-title">Lease epoch 13 granted</p>
                <p className="agc-granted-copy">
                  The fencing token advanced. Anything the old device tries to append under epoch
                  12 is refused — and a same-epoch fork would be self-authenticating fraud,
                  provable by anyone who sees both heads. This device can play rated now.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="shell-modal-body">
            <div className="agc-conflict-device">
              <span className="agc-conflict-device-icon" aria-hidden>
                <Laptop size={18} />
              </span>
              <div className="agc-conflict-device-meta">
                <span className="agc-conflict-device-name">
                  MacBook Air holds the live write lease
                </span>
                <span className="agc-conflict-device-sub">
                  epoch 12 · expires in {fmtMmSs(lease.remainingMs)}
                </span>
              </div>
            </div>
            {lease.renewals > 0 && (
              <p className="agc-conflict-renewed" role="status">
                <RefreshCw size={12} aria-hidden /> Heartbeat renewed the lease — MacBook Air is
                still playing.
              </p>
            )}
            <p className="agc-conflict-copy">
              Your account appends witnessed events under one live lease at a time. That
              single-writer rule is what makes a same-epoch fork provable fraud instead of sync
              noise — so this device pauses rather than write beside the other one.
            </p>
            <p className="agc-conflict-copy">
              Wait for the lease to expire, or take it over now. Takeover needs your PIN — it
              opens a witnessed session and advances the epoch.
            </p>
          </div>
        )}

        <div className="shell-modal-foot">
          {phase === 'granted' ? (
            <button type="button" className="btn" onClick={onClose}>
              Done
            </button>
          ) : (
            <>
              <button type="button" className="btn ghost" onClick={onClose}>
                Wait
              </button>
              <button
                type="button"
                className="btn agc-btn-icon"
                onClick={() => setPhase('pin')}
              >
                <KeyRound size={14} aria-hidden /> Take over
              </button>
            </>
          )}
        </div>
      </OverlayDialog>

      {phase === 'pin' && (
        <PinEntryDialog
          purpose="lease-takeover"
          onClose={() => setPhase('conflict')}
          onSuccess={() => setPhase('granted')}
        />
      )}
    </>
  )
}
