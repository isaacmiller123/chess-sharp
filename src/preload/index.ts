import { contextBridge } from 'electron'
import { api } from './api'

// Expose exactly one frozen, typed API object. contextIsolation + sandbox are on,
// so the renderer can reach nothing but window.api.
contextBridge.exposeInMainWorld('api', api)
