// The renderer-wide multiplayer singleton the UI imports. Binds the pure session
// authority (MpNetSession) to the real trystero/WebRTC transport. Import `mp`
// anywhere in the renderer to host/join and drive an internet game.

import { MpNetSession } from './mpSession'
import { createRtcTransport } from './rtcTransport'

export const mp = new MpNetSession(createRtcTransport)
