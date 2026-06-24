import { ipcRenderer } from 'electron'
import type { Api } from '@shared/types'

// The single typed surface exposed to the renderer. Mirrors the IPC channels in
// src/main/ipc/registry.ts. Raw ipcRenderer is NEVER exposed.
export const api: Api = {
  app: {
    ping: () => ipcRenderer.invoke('app:ping', {}),
    dataVersion: () => ipcRenderer.invoke('app:dataVersion', {})
  },
  settings: {
    get: (key) => ipcRenderer.invoke('settings:get', { key }),
    set: (key, value) => ipcRenderer.invoke('settings:set', { key, value })
  }
}
