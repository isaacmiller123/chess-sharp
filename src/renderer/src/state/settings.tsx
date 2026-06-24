import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { DEFAULT_PIECE_SET, normalizePieceSet, type PieceSetId } from '../board/pieceSets'

export type BoardTheme = 'brown' | 'green' | 'blue' | 'grey' | 'purple' | 'wood' | 'slate' | 'ice'

/** Analysis search depth: a fixed ply count, or 'max' (let the engine run to its ceiling). */
export type AnalysisDepth = number | 'max'

/** Inclusive bounds for the multi-PV (number of candidate lines) preference. */
export const ANALYSIS_MULTIPV_MIN = 1
export const ANALYSIS_MULTIPV_MAX = 5

/** Inclusive bounds for the fixed analysis depth (before the 'max' sentinel). */
export const ANALYSIS_DEPTH_MIN = 18
export const ANALYSIS_DEPTH_MAX = 30

/** Inclusive bounds (ms) for the casual-play engine move time. */
export const PLAY_THINK_MS_MIN = 100
export const PLAY_THINK_MS_MAX = 3000

export interface AppSettings {
  theme: 'light' | 'dark'
  boardTheme: BoardTheme
  pieceSet: PieceSetId
  showLegal: boolean
  coordinates: boolean
  animation: boolean
  sound: boolean
  username: string
  avatar: string | null // data URL
  /** Candidate lines to request from the analysis engine (1–5). */
  analysisMultiPV: number
  /** Fixed analysis search depth in plies, or 'max' to run to the engine ceiling. */
  analysisDepth: AnalysisDepth
  /** Engine move time (ms) for casual Play vs the engine. */
  playThinkMs: number
}

const DEFAULTS: AppSettings = {
  theme: 'dark',
  boardTheme: 'brown',
  pieceSet: DEFAULT_PIECE_SET,
  showLegal: true,
  coordinates: true,
  animation: true,
  sound: true,
  username: 'User',
  avatar: null,
  analysisMultiPV: 3,
  analysisDepth: 22,
  playThinkMs: 600
}

const KEY = 'oct.settings.v1'

/** Clamp + round a possibly-stale numeric pref; falls back to `fallback` for non-finite input. */
function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

/** Coerce a stored analysis depth into a valid ply count or the 'max' sentinel. */
function normalizeDepth(value: unknown): AnalysisDepth {
  if (value === 'max') return 'max'
  return clampInt(value, ANALYSIS_DEPTH_MIN, ANALYSIS_DEPTH_MAX, DEFAULTS.analysisDepth as number)
}

function load(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const stored = JSON.parse(raw) as Partial<AppSettings>
      const merged = { ...DEFAULTS, ...stored }
      // Coerce a possibly-stale/removed piece set back to a known id.
      merged.pieceSet = normalizePieceSet(stored.pieceSet)
      // Defend Analysis/Play against corrupt or out-of-range stored values.
      merged.analysisMultiPV = clampInt(
        stored.analysisMultiPV,
        ANALYSIS_MULTIPV_MIN,
        ANALYSIS_MULTIPV_MAX,
        DEFAULTS.analysisMultiPV
      )
      merged.analysisDepth = normalizeDepth(stored.analysisDepth)
      merged.playThinkMs = clampInt(
        stored.playThinkMs,
        PLAY_THINK_MS_MIN,
        PLAY_THINK_MS_MAX,
        DEFAULTS.playThinkMs
      )
      return merged
    }
  } catch {
    /* ignore corrupt settings */
  }
  return DEFAULTS
}

/** Appearance + engine prefs reset by the Settings "reset to defaults" action (Profile is preserved). */
const RESETTABLE_KEYS = [
  'theme',
  'boardTheme',
  'pieceSet',
  'showLegal',
  'coordinates',
  'animation',
  'sound',
  'analysisMultiPV',
  'analysisDepth',
  'playThinkMs'
] as const

interface Ctx {
  settings: AppSettings
  update: (patch: Partial<AppSettings>) => void
  /** Restore appearance + board/play + engine prefs to defaults; leaves profile untouched. */
  resetDefaults: () => void
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

  const resetDefaults = () =>
    setSettings((s) => {
      const next = { ...s }
      for (const k of RESETTABLE_KEYS) {
        // Assign each resettable key from DEFAULTS; the key union keeps this type-safe.
        Object.assign(next, { [k]: DEFAULTS[k] })
      }
      return next
    })

  return (
    <SettingsContext.Provider value={{ settings, update, resetDefaults }}>{children}</SettingsContext.Provider>
  )
}

export function useSettings(): Ctx {
  const c = useContext(SettingsContext)
  if (!c) throw new Error('useSettings must be used within SettingsProvider')
  return c
}
