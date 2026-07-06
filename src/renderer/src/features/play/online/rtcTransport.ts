// The trystero-backed MpTransportFactory. This is the ONLY file that touches the
// signaling network + WebRTC: it turns a room code into a live trystero room, wires
// the room's peer/message callbacks to the pure MpNetSession's listeners, and polls
// relay connectivity so the UI can show "contacting relays / searching". Everything
// game-related is opaque wire text sent through a single action channel.
//
// trystero 0.25.2, default import = the Nostr strategy over multiple public relays.
// Beyond peer discovery no game data touches the relays: it's sent directly
// peer-to-peer and end-to-end encrypted over the WebRTC data channel.

import { joinRoom, getRelaySockets } from 'trystero'
import { normalizeRoomCode } from '@shared/mp/wire'
import type { MpTransport, MpTransportFactory, MpTransportListeners } from './mpSession'

/** A unique app namespace so only Chess# builds discover each other. Bumped to v3
 *  alongside the wire protocol so a v2 build never even shares a room with v3. */
const APP_ID = 'chess-sharp-mp-v3'

/** How often we sample relay socket state for the "contacting relays" UI (ms). */
const RELAY_POLL_MS = 2_000

// STUN/TURN for WebRTC NAT traversal. Google STUN is blocked in China, hence the
// Cloudflare STUN; the TURN entries are a best-effort fallback for symmetric NATs
// (ICE silently skips any dead server, so extras never hurt).
const ICE_SERVERS: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  { urls: 'stun:stun.cloudflare.com:3478' },
  {
    urls: [
      'turn:openrelay.metered.ca:80',
      'turn:openrelay.metered.ca:443',
      'turn:openrelay.metered.ca:443?transport=tcp'
    ],
    username: 'openrelayproject',
    credential: 'openrelayproject'
  },
  {
    urls: ['turn:standard.relay.metered.ca:80', 'turn:standard.relay.metered.ca:443?transport=tcp'],
    username: 'openrelayproject',
    credential: 'openrelayproject'
  }
]

/** Create a trystero room for `roomCode` and adapt it to the MpTransport contract. */
export const createRtcTransport: MpTransportFactory = (
  roomCode: string,
  listeners: MpTransportListeners
): MpTransport => {
  // The code we bond on must be canonical so host and guest land in the same room.
  const canonical = normalizeRoomCode(roomCode) ?? roomCode

  const room = joinRoom(
    {
      appId: APP_ID,
      // Encrypt session descriptions with a room-derived key so two players who
      // share the code (and only they) can complete the WebRTC handshake.
      password: 'chs-' + canonical,
      rtcConfig: { iceServers: ICE_SERVERS }
    },
    canonical
  )

  // One action channel carries all wire text. Payloads are plain strings.
  const msg = room.makeAction<string>('m')

  msg.onMessage = (data, { peerId }) => {
    // trystero delivers the same type it was sent (string here); guard anyway.
    if (typeof data === 'string') listeners.onMessage(data, peerId)
  }

  room.onPeerJoin = (peerId) => listeners.onPeerJoin(peerId)
  room.onPeerLeave = (peerId) => listeners.onPeerLeave(peerId)

  // Poll relay connectivity for the "contacting relays" UI. getRelaySockets()
  // returns { url: WebSocket } for the strategy's relays; count the open ones.
  let relayTimer: ReturnType<typeof setInterval> | null = null
  const pollRelays = (): void => {
    if (!listeners.onRelayStatus) return
    const sockets = (getRelaySockets() ?? {}) as Record<string, { readyState?: number }>
    const urls = Object.keys(sockets)
    const total = urls.length
    let connected = 0
    for (const url of urls) {
      // WebSocket.OPEN === 1
      if (sockets[url]?.readyState === 1) connected++
    }
    listeners.onRelayStatus(connected, total)
  }
  const stopRelayPoll = (): void => {
    if (relayTimer) {
      clearInterval(relayTimer)
      relayTimer = null
    }
  }
  if (listeners.onRelayStatus) {
    relayTimer = setInterval(pollRelays, RELAY_POLL_MS)
    // Fire once promptly so the UI doesn't sit blank for the first interval.
    pollRelays()
  }

  // A same-code rejoin (host→leave→host, or a reconnect) must not race a room
  // that's still tearing down; expose the leave() settle as `closed` so the
  // session can await it before re-creating the transport (T7).
  let resolveClosed: () => void = () => {}
  const closed = new Promise<void>((res) => {
    resolveClosed = res
  })

  return {
    send(text: string, toPeer?: string): void {
      try {
        // Target one peer when given; otherwise broadcast to the whole room. The
        // send is async: surface a rejected promise to the session (T6) instead of
        // an unhandled rejection — it treats a dead channel like heartbeat trouble.
        const p = toPeer ? msg.send(text, { target: toPeer }) : msg.send(text)
        void Promise.resolve(p).catch((err) => listeners.onSendError?.(err))
      } catch (err) {
        // Synchronous throw (closed/absent channel): same path.
        listeners.onSendError?.(err)
      }
    },
    stopRelayPoll,
    closed,
    close(): void {
      stopRelayPoll()
      // room.leave() may be async; swallow its rejection and settle `closed`.
      try {
        void Promise.resolve(room.leave())
          .catch(() => {})
          .finally(resolveClosed)
      } catch {
        resolveClosed()
      }
    }
  }
}
