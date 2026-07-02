// LAN multiplayer IPC (Api.mp). Thin electron shim over MpSession: validates
// payloads (zod + handle()), owns the ONE live session, and forwards every
// session event to the renderer that started it via webContents.send('mp:event').
//
// Renderer-reload safety: the session's event sink targets a WebContents *by id*
// and re-resolves the live object at emit time. A WebContents survives an
// in-place reload (F5 / Vite HMR full reload) — only closing the window destroys
// it — so events keep flowing to the reloaded page, which re-subscribes via the
// preload's ipcRenderer.on. If the window that owns the session is gone, the
// session is torn down (no orphaned server/socket). Events that fire during the
// brief reload gap are dropped harmlessly: the game is host-authoritative, so the
// next 'move' re-syncs both clocks and the board.

import { webContents, type WebContents } from 'electron'
import { z } from 'zod'
import { handle } from './util'
import { MpSession } from '../mp/session'
import { mpGameConfigSchema, uciSchema, JOIN_CODE_CHARS } from '../mp/protocol'
import type { MpEvent } from '../../shared/types'

// One session at a time (you can't host and join simultaneously).
let session: MpSession | null = null
// The WebContents id that owns the live session; events are routed here and
// re-resolved every emit so a reloaded renderer still receives them.
let ownerWcId: number | null = null

function teardown(): void {
  session?.close() // close() also drops the 'event' listener via removeAllListeners
  session = null
  ownerWcId = null
}

/** Resolve the live WebContents that owns the session (or null if it's gone). */
function ownerWc(): WebContents | null {
  if (ownerWcId == null) return null
  const wc = webContents.fromId(ownerWcId)
  return wc && !wc.isDestroyed() ? wc : null
}

/** Create the session and pipe its events to the renderer that asked for it. */
function createSession(sender: WebContents): MpSession {
  teardown()
  ownerWcId = sender.id
  const s = new MpSession()
  s.on('event', (ev: MpEvent) => {
    const wc = ownerWc()
    if (wc) wc.send('mp:event', ev)
    // If the owning window is truly gone (closed, not reloaded), stop the game so
    // we don't leak a server/socket waiting on a renderer that will never return.
    else if (ownerWcId != null && webContents.fromId(ownerWcId) == null) teardown()
  })
  session = s
  return s
}

// Join codes: 10 base32 chars + optional separators (see protocol.ts codec).
const joinCodeSchema = z
  .string()
  .min(JOIN_CODE_CHARS)
  .max(JOIN_CODE_CHARS + 4)

export function registerMp(): void {
  handle('mp:host', z.object({ config: mpGameConfigSchema }).strict(), async ({ config }, e) => {
    const s = createSession(e.sender)
    try {
      return await s.host(config)
    } catch (err) {
      // Binding failed (offline / no LAN). Surface it as an error event too, so a
      // renderer that already subscribed hears the reason, then tear down.
      const message = err instanceof Error ? err.message : 'failed to host'
      if (!e.sender.isDestroyed()) e.sender.send('mp:event', { type: 'error', message } satisfies MpEvent)
      teardown()
      throw err
    }
  })

  handle('mp:join', z.object({ code: joinCodeSchema }).strict(), async ({ code }, e) => {
    const s = createSession(e.sender)
    const res = await s.join(code)
    if (!res.ok) teardown()
    return res
  })

  handle('mp:leave', z.object({}).strict(), () => {
    teardown()
    return { ok: true }
  })

  handle('mp:sendMove', z.object({ uci: uciSchema }).strict(), async ({ uci }) => {
    return session ? session.sendMove(uci) : { ok: false }
  })

  handle('mp:resign', z.object({}).strict(), async () => {
    return session ? session.resign() : { ok: false }
  })

  handle('mp:offerDraw', z.object({}).strict(), async () => {
    return session ? session.offerDraw() : { ok: false }
  })

  handle('mp:acceptDraw', z.object({}).strict(), async () => {
    return session ? session.acceptDraw() : { ok: false }
  })

  handle('mp:offerRematch', z.object({}).strict(), async () => {
    return session ? session.offerRematch() : { ok: false }
  })
}
