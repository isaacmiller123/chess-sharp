import type { JSX } from 'react'
import { Scale, ShieldCheck, Users } from 'lucide-react'
import { width } from '@shared/accounts/mm/pairing'
import { DEV_FIXTURE } from '../mock/fixtures'
import { FixturePreviewBadge } from '../mock/FixturePreviewBadge'

/**
 * §7 trust-width meter — QUALITATIVE ONLY. The width curve is the shared
 * authority mm/pairing.ts width(T) = widthMin + widthSpan·(1−T)² (quadratic,
 * integer, PARAMS_A4) — the meter draws its band geometry from that one
 * formula and NOTHING else; there is no local width curve in the renderer
 * (A4-18). But §7 makes suspicion-widening "invisible, reversible, decaying
 * with clean play … nothing visible or permanent", so a compliant client
 * renders NO trust number and NO exact ±window (A4-25): only a coarse band
 * label and a relative, number-free band. T is publicly recomputable — this
 * is a rendering rule, exactly like §6's rating hiding (C-4).
 */

/** Widest the window ever gets: the shared curve at the trust floor (±500). */
export const WIDTH_FLOOR: number = width(0)
/** Tightest the window ever gets: the shared curve at full trust (±50). */
export const WIDTH_CEIL: number = width(1_000_000)

/** Coarse qualitative band — the only trust-derived state the surface shows. */
export type WidthBand = 'precision' | 'standard' | 'wide'

/** Classify the shared width() output into the coarse rendered band. */
export function widthBand(tMicro: number): WidthBand {
  const frac = (width(tMicro) - WIDTH_CEIL) / (WIDTH_FLOOR - WIDTH_CEIL)
  if (frac <= 0.15) return 'precision'
  if (frac <= 0.5) return 'standard'
  return 'wide'
}

const BAND_LABEL: Record<WidthBand, string> = {
  precision: 'Precision band',
  standard: 'Standard band',
  wide: 'Wide band'
}

const BAND_DESC: Record<WidthBand, string> = {
  precision: 'close matches — your history reads clean',
  standard: 'moderate spread around your rating',
  wide: 'broad spread — precision re-earned with clean play'
}

/**
 * Visualizes §7 trust-width pairing as a relative band on a rating axis
 * centered on "you". Geometry comes from the shared quadratic width();
 * no number (neither T nor the ±window) is ever rendered — the §7 widening
 * stays invisible on every compliant surface.
 */
export function TrustWidthMeter({ tMicro }: { tMicro: number }): JSX.Element {
  const w = width(tMicro)
  const frac = w / WIDTH_FLOOR
  const band = widthBand(tMicro)
  const leftPct = 50 - frac * 50

  return (
    <div className="arate-meter">
      <div className="arate-meter-head">
        <span className="arate-meter-title">
          <ShieldCheck size={14} aria-hidden /> Trust-earned precision
        </span>
        {/* The tMicro feeding this meter is a fixture constant until trust
            syncs with network transport — the band shown is sample data. */}
        {DEV_FIXTURE && <FixturePreviewBadge label="Sample band — awaiting network transport" />}
        <span className={`arate-meter-bandlabel is-${band}`}>{BAND_LABEL[band]}</span>
      </div>

      <div
        className="arate-meter-axis"
        role="img"
        aria-label={`Pairing window: ${BAND_LABEL[band].toLowerCase()} — ${BAND_DESC[band]}. Relative width only; the exact window and the trust score are never rendered.`}
      >
        <div className="arate-meter-track" aria-hidden>
          <div
            className="arate-meter-band"
            style={{ left: `${leftPct}%`, width: `${frac * 100}%` }}
          />
          <span className="arate-meter-you" />
        </div>
        <div className="arate-meter-scale" aria-hidden>
          <span>widest</span>
          <span className="arate-meter-scale-you">you</span>
          <span>widest</span>
        </div>
      </div>

      <p className="arate-meter-curve">
        The window is a continuous curve on trust — tightest at high trust, flat near the top,
        widest at the floor. Precision is earned; keeping it tight means playing like your history.
      </p>

      <p className="arate-meter-note">
        <Users size={13} aria-hidden />
        An island term attracts comparable-suspicion accounts to each other — cheaters paired
        together generate the judge&rsquo;s evidence themselves.
      </p>

      <p className="arate-meter-foot">
        <Scale size={13} aria-hidden />
        Suspicion only ever widens pairing — invisible, reversible, decaying with clean play. That
        is why no trust score and no exact window is shown here or anywhere: a compliant client
        renders only this coarse band. Bans come only from the Tier-2 judge.
      </p>
    </div>
  )
}
