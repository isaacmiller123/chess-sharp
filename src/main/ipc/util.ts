import { app, ipcMain, type IpcMainInvokeEvent } from 'electron'
import type { z } from 'zod'

// Origin allowlist: only our own LOCAL renderer. Remote navigation is blocked by
// hardenWindow, so the sender can only be the Vite dev server (dev) or the
// bundled renderer loaded via loadFile (file://) or a registered app:// protocol.
export function senderAllowed(e: IpcMainInvokeEvent): boolean {
  const url = e.senderFrame?.url ?? ''
  return (
    url.startsWith('http://localhost') ||
    url.startsWith('http://127.0.0.1') ||
    url.startsWith('app://') ||
    url.startsWith('file://')
  )
}

// Every handler: assert sender origin, then zod-validate the payload before work.
export function handle<S extends z.ZodTypeAny, R>(
  channel: string,
  schema: S,
  fn: (arg: z.infer<S>, e: IpcMainInvokeEvent) => R | Promise<R>
): void {
  ipcMain.handle(channel, async (e, raw) => {
    if (!senderAllowed(e)) throw new Error(`IPC ${channel}: sender not allowed`)
    const parsed = schema.safeParse(raw)
    if (!parsed.success) throw new Error(`IPC ${channel}: invalid payload`)
    return fn(parsed.data, e)
  })
}
