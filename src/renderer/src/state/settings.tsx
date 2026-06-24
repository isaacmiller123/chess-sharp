import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type BoardTheme = 'brown' | 'green' | 'blue' | 'grey'

export interface AppSettings {
  theme: 'light' | 'dark'
  boardTheme: BoardTheme
  showLegal: boolean
  coordinates: boolean
  animation: boolean
  sound: boolean
  username: string
  avatar: string | null // data URL
}

const DEFAULTS: AppSettings = {
  theme: 'dark',
  boardTheme: 'brown',
  showLegal: true,
  coordinates: true,
  animation: true,
  sound: true,
  username: 'User',
  avatar: null
}

const KEY = 'oct.settings.v1'

function load(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<AppSettings>) }
  } catch {
    /* ignore corrupt settings */
  }
  return DEFAULTS
}

interface Ctx {
  settings: AppSettings
  update: (patch: Partial<AppSettings>) => void
}

const SettingsContext = createContext<Ctx | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(load)

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme
    try {
      localStorage.setItem(KEY, JSON.stringify(settings))
    } catch {
      /* storage may be unavailable */
    }
  }, [settings])

  const update = (patch: Partial<AppSettings>) => setSettings((s) => ({ ...s, ...patch }))

  return <SettingsContext.Provider value={{ settings, update }}>{children}</SettingsContext.Provider>
}

export function useSettings(): Ctx {
  const c = useContext(SettingsContext)
  if (!c) throw new Error('useSettings must be used within SettingsProvider')
  return c
}
