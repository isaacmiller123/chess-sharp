import type { CSSProperties, JSX } from 'react'
import { Wifi, WifiOff, Loader } from 'lucide-react'
import { useAccountNetStatus, type AccountNetStatus, type NetPresence } from '../net/accountNetStatus'

/**
 * The LIVE overlay-presence pill (A6 M4). Reads the account-net status bridge
 * (net/accountNetStatus) and states — honestly, at a glance — whether this
 * signed-in client is actually on the fabric right now and how many third
 * machines it can reach (§4). It replaces the old "offline preview on network
 * surfaces" fixture pill: this reflects reality, never a fabricated claim.
 *
 * No dead state: "offline" (no peer / not up yet), "connecting…" (peer up,
 * bootstrapping), or "online · N peers". Colour follows the semantic palette.
 */

interface Tone {
  fg: string
  soft: string
  Icon: typeof Wifi
}

const TONE: Record<NetPresence, Tone> = {
  online: { fg: 'var(--success)', soft: 'var(--success-soft)', Icon: Wifi },
  connecting: { fg: 'var(--warning)', soft: 'var(--warning-soft)', Icon: Loader },
  offline: { fg: 'var(--text-muted)', soft: 'color-mix(in srgb, var(--text-muted) 14%, transparent)', Icon: WifiOff },
}

/** Human label for a status (also used by aria-label). */
export function netStatusLabel(net: AccountNetStatus): string {
  if (net.presence === 'online')
    return `Overlay live · ${net.peersReachable} peer${net.peersReachable === 1 ? '' : 's'}`
  if (net.presence === 'connecting') return 'Overlay connecting…'
  return 'Overlay offline'
}

const PILL: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
  padding: 'var(--space-1) var(--space-3)',
  borderRadius: 'var(--radius-pill)',
  fontSize: 'var(--fs-xs)',
  fontWeight: 'var(--fw-medium)',
  whiteSpace: 'nowrap',
}

/**
 * The pill. `title` explains the §4 rated-play boundary on hover. When online,
 * the reachable-witness count is surfaced in the tooltip (the honest signal
 * behind whether a rated game can be witnessed right now).
 */
export function NetStatusPill({ style }: { style?: CSSProperties }): JSX.Element {
  const net = useAccountNetStatus()
  const tone = TONE[net.presence]
  const { Icon } = tone
  const label = netStatusLabel(net)
  const title =
    net.presence === 'online'
      ? `On the overlay — ${net.witnessesReachable} witness-capable third machine${net.witnessesReachable === 1 ? '' : 's'} reachable. Rated play needs one; with none, it waits honestly (casual/link play stays available).`
      : net.presence === 'connecting'
        ? 'Your account peer is up and bootstrapping its routing table from the fabric directory — peers appear as they announce.'
        : 'No live account peer — the overlay starts on sign-in over WebRTC. Local, offline and unrated play stay fully available.'
  return (
    <span
      role="status"
      aria-label={label}
      title={title}
      style={{ ...PILL, color: tone.fg, background: tone.soft, ...style }}
    >
      <Icon size={12} aria-hidden />
      {label}
    </span>
  )
}
