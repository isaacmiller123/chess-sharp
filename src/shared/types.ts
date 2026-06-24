// Shared IPC contract — imported (type-only) by both preload and renderer.
// This is the single source of truth for the `window.api` surface. It grows as
// foundation features land; only the implemented subset is wired today.

export interface PingResult {
  ok: boolean
  ts: number
}

export interface DataVersion {
  appVersion: string
  engineVersion: string
  puzzleDbDate: string
}

export interface SettingsGetResult {
  value: unknown
}

export interface OkResult {
  ok: boolean
}

export interface Api {
  app: {
    ping(): Promise<PingResult>
    dataVersion(): Promise<DataVersion>
  }
  settings: {
    get(key: string): Promise<SettingsGetResult>
    set(key: string, value: unknown): Promise<OkResult>
  }
}

declare global {
  interface Window {
    api: Api
  }
}
