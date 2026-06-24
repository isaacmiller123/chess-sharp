import { app, ipcMain, type IpcMainInvokeEvent } from 'electron'
import type { z } from 'zod'

// Origin allowlist: only our own renderer (dev server in dev, app:// in prod).
export function senderAllowed(e: IpcMainInvokeEvent): boolean {
  const url = e.senderFrame?.url ?? ''
  if (!app.isPackaged) {
    return url.startsWith('http://localhost') || url.startsWith('app://')
  }
  return url.startsWith('app://')
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
