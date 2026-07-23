import { useState, type JSX } from 'react'
import {
  Ban,
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  FileKey,
  Flame,
  HardDrive,
  KeyRound,
  Lock,
  Scale,
  ShieldAlert,
  ShieldCheck
} from 'lucide-react'
import type { UiDevice } from '../mock/types'
import { DEV_FIXTURE, DEVICES, shortB64u } from '../mock/fixtures'
import { FixturePreviewBadge } from '../mock/FixturePreviewBadge'
import { useAccountsUi } from '../mock/store'
import { PinSetupWizard } from '../pin/PinSetupWizard'
import { PinEntryDialog } from '../pin/PinEntryDialog'
import { FuseBanCard } from '../pin/FuseBanCard'
import { RecoveryExport } from '../auth/RecoveryExport'
import './hub.css'

/**
 * Security tab (ACCOUNTS-SPEC §1, §9, C-5): device key certificates and
 * revocation, the PIN committee with its lifetime fuse, the ban taxonomy as a
 * reference (everything cites a public signed record — no blocklist), and the
 * recovery export. Devices render from the REAL chain when signed in; the
 * PIN committee is DEV_FIXTURE sample state (committee-held, needs the
 * witness network) and labels itself as such.
 */

function enrolledDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

/**
 * One enrolled child key (§1). Revocation is a witnessed-lane append — it
 * needs witness connectivity (a declared residual), so the control is HONEST:
 * disabled with the reason stated, never a mock that pretends to sign
 * (complete-6). The revoked flags themselves are real chain facts
 * (derive.ts deriveDevices over cert/revoke events) when signed in.
 */
function DeviceRow({ device }: { device: UiDevice }): JSX.Element {
  const revoked = Boolean(device.revoked)

  return (
    <li className={`ahub-device${revoked ? ' is-revoked' : ''}`}>
      <div className="ahub-device-row">
        <span className="ahub-device-icon" aria-hidden>
          <HardDrive size={16} />
        </span>
        <div className="ahub-device-main">
          <span className="ahub-device-label">
            <span className="ahub-device-name">{device.label}</span>
            {device.thisDevice && <span className="ahub-pill is-accent">This device</span>}
            {revoked ? (
              <span className="ahub-pill is-danger">
                <Ban size={11} aria-hidden /> Revoked
              </span>
            ) : device.witnessed ? (
              <span
                className="ahub-pill is-success"
                title="Enrollment countersigned by witnesses at first witnessed contact (PIN-gated) — eligible for rated play"
              >
                <ShieldCheck size={11} aria-hidden /> Witnessed
              </span>
            ) : (
              <span
                className="ahub-pill is-neutral"
                title="Personal-lane root-signed certificate — valid offline and for unrated play; rated play needs a witness countersignature at first witnessed contact"
              >
                <Lock size={11} aria-hidden /> Offline-only
              </span>
            )}
          </span>
          <span className="ahub-device-meta muted small">
            key #{device.index} · <code>{shortB64u(device.pub)}</code> · enrolled{' '}
            {enrolledDate(device.enrolledTs)}
          </span>
        </div>
        {!device.thisDevice && !revoked && (
          // HONEST residual (complete-6): revocation is a witnessed-lane
          // append, and this client has no witness connectivity yet — so the
          // control is disabled and says why, instead of mocking a signature.
          <button
            type="button"
            className="btn danger small ahub-device-revoke"
            disabled
            title="Requires witness connectivity — arrives with network transport"
          >
            Revoke
          </button>
        )}
      </div>
    </li>
  )
}

export function SecurityTab(): JSX.Element {
  const ui = useAccountsUi()
  const pin = ui.pin

  const [wizardOpen, setWizardOpen] = useState(false)
  const [entryOpen, setEntryOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [fuseOpen, setFuseOpen] = useState(false)

  // REAL device rows derived from the chain's cert/revoke events when signed
  // in (mock/store deriveDevices); the fixture set only backs the preview.
  const devices = ui.devices ?? DEVICES
  const revokedCount = devices.filter((d) => d.revoked).length
  const activeCount = devices.length - revokedCount
  const failPct = Math.min(100, Math.round((pin.failures / pin.lifetimeCap) * 100))

  return (
    <div className="ahub-security">
      {/* ---- Devices (§1): root-signed key certificates ---- */}
      <section className="panel" aria-labelledby="ahub-devices-title">
        <div className="panel-head">
          <span className="ahub-head-icon" aria-hidden>
            <HardDrive size={15} />
          </span>
          <span className="panel-title" id="ahub-devices-title">
            Devices
          </span>
          {/* Signed out, the list falls back to the fixture set — say so. */}
          {ui.devices === null && DEV_FIXTURE && (
            <FixturePreviewBadge label="Sample devices — sign in to derive your real chain" />
          )}
          <span className="muted small num">
            {activeCount} enrolled · {revokedCount} revoked
          </span>
        </div>
        <p className="ahub-lede muted small">
          Every device holds its own child key, introduced by a root-signed certificate carried in
          your chain. Enrollment works fully offline; the witnessed zone additionally
          countersigns a device at its first witnessed contact (PIN-gated).
        </p>
        <ul className="ahub-devices">
          {devices.map((d) => (
            <DeviceRow key={d.pub} device={d} />
          ))}
        </ul>
        <p className="ahub-panel-foot">
          <ShieldAlert size={14} aria-hidden />
          <span>
            Revoking a key signs a <b>witnessed</b> revocation, which invalidates all enrollments
            with earlier witnessed timestamps — a password thief&rsquo;s silent offline enrollments
            never outrank your revocation. That append needs witness connectivity, which arrives
            with network transport — until then the Revoke control is disabled rather than
            pretending to sign.
          </span>
        </p>
      </section>

      {/* ---- PIN (§1): the witnessed-zone gate and its lifetime fuse ---- */}
      <section className="panel" aria-labelledby="ahub-pin-title">
        <div className="panel-head">
          <span className="ahub-head-icon" aria-hidden>
            <KeyRound size={15} />
          </span>
          <span className="panel-title" id="ahub-pin-title">
            PIN — the witnessed-zone gate
          </span>
          {/* Committee-held state needs the witness network (C-2): the whole
              PIN surface is DEV_FIXTURE sample data until transport ships. */}
          {DEV_FIXTURE && <FixturePreviewBadge />}
          {pin.set ? (
            <span className="ahub-pill is-success">
              <Check size={11} aria-hidden /> Set · {pin.committee.t}-of-{pin.committee.n} committee
            </span>
          ) : (
            <span className="ahub-pill is-warn">Not set</span>
          )}
        </div>
        <div className="ahub-panel-body">
          <p className="ahub-lede muted small">
            Your password alone gives full local, offline, and unrated play. The PIN gates the
            witnessed zone — rated play, lease takeover, witnessing a new device. It is verified by
            a {pin.committee.t}-of-{pin.committee.n} committee that holds shares and a failure
            counter, and can neither learn the PIN nor derive your keys.
          </p>

          {pin.set ? (
            <>
              <div className="ahub-fusemeter">
                <div className="ahub-fusemeter-top">
                  <span className="ahub-fusemeter-label">
                    <Flame size={13} aria-hidden /> Lifetime failures
                  </span>
                  <span className="small num">
                    <b>{pin.failures}</b> / {pin.lifetimeCap}
                  </span>
                </div>
                <span
                  className="ahub-meter"
                  role="img"
                  aria-label={`${pin.failures} of ${pin.lifetimeCap} lifetime PIN failures recorded`}
                >
                  <span className="ahub-meter-fill is-warn" style={{ width: `${failPct}%` }} />
                </span>
                <p className="muted small">
                  The counter never resets — not on success, not on re-provisioning. At{' '}
                  {pin.lifetimeCap} the fuse trips: a 90-day witnessed-zone ban published as a
                  threshold-signed record. Each served ban refills headroom by {pin.refill}.
                  &ldquo;Lifetime&rdquo; means lifetime.
                </p>
              </div>

              <div className="ahub-pin-actions">
                <button
                  type="button"
                  className="btn ghost ahub-ibtn"
                  onClick={() => setWizardOpen(true)}
                >
                  <KeyRound size={14} aria-hidden /> Change PIN
                </button>
                <button type="button" className="btn ahub-ibtn" onClick={() => setEntryOpen(true)}>
                  <ShieldCheck size={14} aria-hidden /> Try a witnessed session
                </button>
              </div>
              <p className="muted small">
                Changing the PIN re-provisions the committee as a PIN-gated handoff — shares move,
                the failure counter carries forward. A fresh committee never starts at zero.
              </p>
            </>
          ) : (
            <div className="ahub-pin-actions">
              <button type="button" className="btn ahub-ibtn" onClick={() => setWizardOpen(true)}>
                <KeyRound size={14} aria-hidden /> Set up a PIN
              </button>
            </div>
          )}

          <div className="ahub-fuse-showcase">
            <button
              type="button"
              className="ahub-expander"
              aria-expanded={fuseOpen}
              onClick={() => setFuseOpen((v) => !v)}
            >
              {fuseOpen ? (
                <ChevronDown size={14} aria-hidden />
              ) : (
                <ChevronRight size={14} aria-hidden />
              )}
              What a tripped fuse looks like
            </button>
            {fuseOpen && (
              <div className="ahub-fuse-demo">
                <FuseBanCard />
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ---- Standing (§9): the ban taxonomy, cited not asserted ---- */}
      <section className="panel" aria-labelledby="ahub-standing-title">
        <div className="panel-head">
          <span className="ahub-head-icon" aria-hidden>
            <Scale size={15} />
          </span>
          <span className="panel-title" id="ahub-standing-title">
            Standing
          </span>
        </div>
        <div className="ahub-panel-body">
          {/* Derived (§0), never asserted: the strip renders the fold's
              standing for the signed-in account (good on a fresh chain). */}
          {ui.account === null || ui.account.standing.state === 'good' ? (
            <div className="ahub-standing is-good">
              <ShieldCheck size={16} aria-hidden />
              <span>
                <b>In good standing</b> — no ban record exists under your root; any verifier
                reaches the same conclusion from your public chain.
              </span>
            </div>
          ) : (
            <div className="ahub-standing is-bad">
              <ShieldAlert size={16} aria-hidden />
              <span>
                <b>
                  {ui.account.standing.state === 'self-ban'
                    ? 'Anticheat self-ban in effect'
                    : ui.account.standing.state === 'pin-fuse'
                      ? 'PIN fuse tripped — witnessed zone closed'
                      : 'Permanently distrusted — same-epoch fork proven'}
                </b>{' '}
                — derived from your public chain; see Overview for the record.
              </span>
            </div>
          )}

          <h3 className="ahub-subhead">The only three ways to lose it</h3>
          <ul className="ahub-taxonomy">
            <li className="ahub-tax">
              <span className="ahub-tax-icon is-warn" aria-hidden>
                <Scale size={15} />
              </span>
              <div className="ahub-tax-body">
                <span className="ahub-tax-title">
                  Anticheat self-ban <span className="ahub-pill is-warn">90 days</span>
                </span>
                <span className="muted small">
                  The Tier-2 judge is the only anticheat trigger, and only its deterministic 5σ
                  CONVICTION obliges a ban (A5-21): an honest client signs its own ban before its
                  next witnessed event. The earlier 3σ escalation only obliges deeper analysis —
                  it never bans. Suppressing an obliged self-ban is provable — and escalates to
                  permanent distrust.
                </span>
              </div>
            </li>
            <li className="ahub-tax">
              <span className="ahub-tax-icon is-warn" aria-hidden>
                <Flame size={15} />
              </span>
              <div className="ahub-tax-body">
                <span className="ahub-tax-title">
                  PIN-fuse ban <span className="ahub-pill is-warn">90 days</span>
                </span>
                <span className="muted small">
                  {pin.lifetimeCap} lifetime PIN failures trip the committee&rsquo;s fuse: a
                  threshold-signed fuse-tripped record published under your key — a public signed
                  fact that every lease grant and every witness must check.
                </span>
              </div>
            </li>
            <li className="ahub-tax">
              <span className="ahub-tax-icon is-danger" aria-hidden>
                <Ban size={15} />
              </span>
              <div className="ahub-tax-body">
                <span className="ahub-tax-title">
                  Fork / equivocation <span className="ahub-pill is-danger">Permanent</span>
                </span>
                <span className="muted small">
                  Two signed successors of one chain head under one lease epoch are
                  self-authenticating proof of fraud. The proof convicts by itself — permanent on
                  sight, with only the mechanical lease-epoch appeal for witness faults.
                </span>
              </div>
            </li>
          </ul>
          <p className="ahub-tax-foot muted small">
            <ShieldAlert size={13} aria-hidden />
            <span>
              Every ban binds to the root and survives key rotation; expiry uses diversity-bound
              witnessed time; any verifier derives this from public signed records — no blocklist
              exists.
            </span>
          </p>
        </div>
      </section>

      {/* ---- Recovery (C-5): the export is the lifeline ---- */}
      <section className="panel" aria-labelledby="ahub-recovery-title">
        <div className="panel-head">
          <span className="ahub-head-icon" aria-hidden>
            <FileKey size={15} />
          </span>
          <span className="panel-title" id="ahub-recovery-title">
            Recovery
          </span>
        </div>
        <div className="ahub-panel-body">
          <div className="ahub-recovery-row">
            <span className="setting-label">
              <strong>Export recovery phrase / keyfile</strong>
              <span className="setting-sub">
                The deal, plainly: there is no reset and no support desk — whoever holds the
                password (or this export) is the account. Keep one copy somewhere safe.
              </span>
            </span>
            <button type="button" className="btn ahub-ibtn" onClick={() => setExportOpen(true)}>
              <Download size={14} aria-hidden /> Export
            </button>
          </div>
        </div>
      </section>

      {wizardOpen && <PinSetupWizard onClose={() => setWizardOpen(false)} />}
      {entryOpen && (
        <PinEntryDialog purpose="device-witness" onClose={() => setEntryOpen(false)} />
      )}
      {exportOpen && <RecoveryExport onClose={() => setExportOpen(false)} />}
    </div>
  )
}
