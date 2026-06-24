import { app, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { z } from 'zod'

// Origin allowlist: only our own renderer (dev server in dev, app:// in prod).
function senderAllowed(e: IpcMainInvokeEvent): boolean {
  const url = e.senderFrame?.url ?? ''
  if (!app.isPackaged) {
    return url.startsWith('http://localhost') || url.startsWith('app://')
  }
  return url.startsWith('app://')
}

// Every handler: assert sender origin, then zod-validate the payload before work.
function handle<S extends z.ZodTypeAny, R>(
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

// In-memory settings stub for the scaffold; real persistence arrives with the DB layer.
const settings = new Map<string, unknown>()

export function registerIpc(): void {
  handle('app:ping', z.object({}).strict(), () => ({ ok: true, ts: Date.now() }))

  handle('app:dataVersion', z.object({}).strict(), () => ({
    appVersion: app.getVersion(),
    engineVersion: 'Stockfish 18 (pending bundling)',
    puzzleDbDate: '2026-06-03'
  }))

  handle('settings:get', z.object({ key: z.string() }).strict(), ({ key }) => ({
    value: settings.get(key) ?? null
  }))

  handle('settings:set', z.object({ key: z.string(), value: z.unknown() }).strict(), ({ key, value }) => {
    settings.set(key, value)
    return { ok: true }
  })
}
