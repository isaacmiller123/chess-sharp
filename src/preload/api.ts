import { ipcRenderer, type IpcRendererEvent } from 'electron'
import type { Api, EngineBestmove, EngineLine, ReviewProgress } from '@shared/types'

// The single typed surface exposed to the renderer. Mirrors the IPC channels in
// src/main/ipc/*. Raw ipcRenderer is NEVER exposed.
export const api: Api = {
  app: {
    ping: () => ipcRenderer.invoke('app:ping', {}),
    dataVersion: () => ipcRenderer.invoke('app:dataVersion', {})
  },
  settings: {
    get: (key) => ipcRenderer.invoke('settings:get', { key }),
    set: (key, value) => ipcRenderer.invoke('settings:set', { key, value })
  },
  engine: {
    analyze: (req) => ipcRenderer.invoke('engine:analyze', req),
    stop: (handleId) => ipcRenderer.invoke('engine:stop', { handleId }),
    play: (req) => ipcRenderer.invoke('engine:play', req),
    status: () => ipcRenderer.invoke('engine:status', {}),
    newGame: (instance) => ipcRenderer.invoke('engine:newGame', { instance }),
    onLine: (cb) => {
      const listener = (_e: IpcRendererEvent, data: EngineLine) => cb(data)
      ipcRenderer.on('engine:line', listener)
      return () => ipcRenderer.removeListener('engine:line', listener)
    },
    onBestmove: (cb) => {
      const listener = (_e: IpcRendererEvent, data: EngineBestmove) => cb(data)
      ipcRenderer.on('engine:bestmove', listener)
      return () => ipcRenderer.removeListener('engine:bestmove', listener)
    }
  },
  puzzles: {
    next: (req) => ipcRenderer.invoke('puzzles:next', req),
    get: (puzzleId) => ipcRenderer.invoke('puzzles:get', { puzzleId }),
    themes: () => ipcRenderer.invoke('puzzles:themes', {}),
    attempt: (req) => ipcRenderer.invoke('puzzles:attempt', req)
  },
  ratings: {
    get: (kind) => ipcRenderer.invoke('ratings:get', { kind })
  },
  progress: {
    summary: () => ipcRenderer.invoke('progress:summary', {})
  },
  games: {
    save: (input) => ipcRenderer.invoke('games:save', input),
    list: (req) => ipcRenderer.invoke('games:list', req ?? {}),
    get: (gameId) => ipcRenderer.invoke('games:get', { gameId }),
    reportResult: (req) => ipcRenderer.invoke('games:reportResult', req)
  },
  openings: {
    lookup: (fen) => ipcRenderer.invoke('openings:lookup', { fen })
  },
  coach: {
    explainMove: (args) => ipcRenderer.invoke('coach:explainMove', args),
    positional: (args) => ipcRenderer.invoke('coach:positional', args)
  },
  review: {
    run: (req) => ipcRenderer.invoke('review:run', req),
    get: (gameId) => ipcRenderer.invoke('review:get', { gameId }),
    onProgress: (cb) => {
      const listener = (_e: IpcRendererEvent, data: ReviewProgress) => cb(data)
      ipcRenderer.on('review:progress', listener)
      return () => ipcRenderer.removeListener('review:progress', listener)
    }
  },
  perf: {
    estimate: (req) => ipcRenderer.invoke('perf:estimate', req)
  }
}
