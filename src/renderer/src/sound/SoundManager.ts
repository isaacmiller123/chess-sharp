// SoundManager — offline-first chess sound effects for the renderer.
//
// Design decisions (see resources/assets/sound/README.md):
//   * Zero shipped binary assets by default. Sounds are SYNTHESIZED at runtime
//     via the WebAudio API. This keeps the app fully offline, dependency-free,
//     and free of any third-party asset-licensing concerns.
//   * If a project later drops CC0 sample files into resources/assets/sound/,
//     the manager will transparently prefer them (see `samplePaths` below) and
//     fall back to synthesis when a sample is missing or fails to decode.
//   * Autoplay policies (Chromium / Electron) suspend an AudioContext created
//     before a user gesture. We lazily create the context and resume it on the
//     first user gesture; until then play() is a silent no-op.
//
// The manager is intentionally decoupled from React and from window.api: it is
// a plain singleton-friendly class. The useSound hook wraps it for components.

export type SoundName =
  | 'move'
  | 'capture'
  | 'check'
  | 'castle'
  | 'promote'
  | 'gameStart'
  | 'gameEnd'
  | 'lowTime'

export interface SoundManagerOptions {
  /** Master on/off. When false, play() is a no-op. Default: true. */
  enabled?: boolean
  /** 0..1 master gain. Default: 0.6. */
  volume?: number
}

const SETTINGS_KEY = 'oct.settings.v1'

/** Read the `sound` flag from the shared settings localStorage key. */
export function readSoundEnabledFromSettings(): boolean {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return true
    const parsed = JSON.parse(raw) as { sound?: unknown }
    return parsed.sound !== false
  } catch {
    return true
  }
}

// A synthesized recipe: a short blip built from one or more oscillator partials
// shaped by a simple attack/decay envelope. Tuned to read as crisp UI ticks,
// not musical notes — deliberately understated to match the app's polish.
interface Tone {
  type: OscillatorType
  /** Start frequency (Hz). */
  freq: number
  /** Optional end frequency for a quick pitch sweep. */
  toFreq?: number
  /** Relative weight of this partial in the mix (0..1). */
  gain: number
}

interface Recipe {
  partials: Tone[]
  /** Attack time in seconds. */
  attack: number
  /** Total duration in seconds. */
  duration: number
  /** Peak gain for this sound (multiplied by master volume). */
  peak: number
}

const RECIPES: Record<SoundName, Recipe> = {
  // Soft wooden "tock" for a quiet move.
  move: {
    partials: [{ type: 'triangle', freq: 320, toFreq: 220, gain: 1 }],
    attack: 0.002,
    duration: 0.09,
    peak: 0.5
  },
  // Brighter, slightly noisier knock for a capture.
  capture: {
    partials: [
      { type: 'square', freq: 200, toFreq: 130, gain: 0.7 },
      { type: 'triangle', freq: 440, toFreq: 300, gain: 0.4 }
    ],
    attack: 0.001,
    duration: 0.12,
    peak: 0.55
  },
  // Two-tone alert for check.
  check: {
    partials: [
      { type: 'sine', freq: 660, gain: 0.8 },
      { type: 'sine', freq: 990, gain: 0.4 }
    ],
    attack: 0.003,
    duration: 0.16,
    peak: 0.5
  },
  // Rolling double-thunk for castling.
  castle: {
    partials: [
      { type: 'triangle', freq: 260, toFreq: 180, gain: 0.8 },
      { type: 'sine', freq: 380, toFreq: 300, gain: 0.3 }
    ],
    attack: 0.002,
    duration: 0.17,
    peak: 0.5
  },
  // Upward chime for a promotion.
  promote: {
    partials: [
      { type: 'sine', freq: 520, toFreq: 880, gain: 0.8 },
      { type: 'triangle', freq: 1040, toFreq: 1320, gain: 0.25 }
    ],
    attack: 0.004,
    duration: 0.26,
    peak: 0.45
  },
  // Gentle ascending pair for a new game.
  gameStart: {
    partials: [{ type: 'sine', freq: 440, toFreq: 660, gain: 1 }],
    attack: 0.006,
    duration: 0.3,
    peak: 0.42
  },
  // Descending resolve for game end.
  gameEnd: {
    partials: [
      { type: 'sine', freq: 520, toFreq: 330, gain: 0.9 },
      { type: 'triangle', freq: 260, toFreq: 196, gain: 0.3 }
    ],
    attack: 0.006,
    duration: 0.42,
    peak: 0.45
  },
  // Tense, repeating-feeling tick for low clock time.
  lowTime: {
    partials: [{ type: 'square', freq: 880, toFreq: 740, gain: 0.7 }],
    attack: 0.001,
    duration: 0.1,
    peak: 0.4
  }
}

// Optional sample overrides. By default none ship; if a project adds CC0 files
// here, place them under resources/assets/sound/ and Vite's `?url` import or a
// public-dir path can be wired in. Left empty intentionally — synthesis is the
// shipped default.
const samplePaths: Partial<Record<SoundName, string>> = {}

type AudioCtor = typeof AudioContext

function getAudioContextCtor(): AudioCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    AudioContext?: AudioCtor
    webkitAudioContext?: AudioCtor
  }
  return w.AudioContext ?? w.webkitAudioContext ?? null
}

export class SoundManager {
  private enabled: boolean
  private volume: number
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private unlocked = false
  private gestureBound = false
  private readonly buffers = new Map<SoundName, AudioBuffer | null>()
  private readonly boundUnlock: () => void

  constructor(opts: SoundManagerOptions = {}) {
    this.enabled = opts.enabled ?? true
    this.volume = clamp01(opts.volume ?? 0.6)
    this.boundUnlock = () => {
      void this.unlock()
    }
  }

  /** Enable/disable all output. Disabling never throws and is instant. */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled
  }

  isEnabled(): boolean {
    return this.enabled
  }

  /** Set master volume (0..1). */
  setVolume(volume: number): void {
    this.volume = clamp01(volume)
    if (this.master && this.ctx) {
      this.master.gain.setValueAtTime(this.volume, this.ctx.currentTime)
    }
  }

  /**
   * Register one-shot listeners that resume/unlock the AudioContext on the
   * first user gesture (required by autoplay policies). Idempotent. Call once,
   * e.g. from a top-level effect.
   */
  attachGestureUnlock(target: Document | HTMLElement = document): void {
    if (this.gestureBound || typeof window === 'undefined') return
    this.gestureBound = true
    const opts: AddEventListenerOptions = { once: true, passive: true }
    target.addEventListener('pointerdown', this.boundUnlock, opts)
    target.addEventListener('keydown', this.boundUnlock, opts)
    target.addEventListener('touchstart', this.boundUnlock, opts)
  }

  /** Eagerly create + resume the context (safe to call inside a gesture). */
  async unlock(): Promise<void> {
    const ctx = this.ensureContext()
    if (!ctx) return
    try {
      if (ctx.state === 'suspended') await ctx.resume()
      this.unlocked = ctx.state === 'running'
    } catch {
      /* resume can reject if still gesture-gated; will retry on next play */
    }
  }

  /**
   * Play a named sound. No-ops silently when disabled, when no AudioContext is
   * available, or before the first gesture unlocks autoplay. Never throws.
   */
  play(name: SoundName): void {
    if (!this.enabled) return
    const ctx = this.ensureContext()
    if (!ctx || !this.master) return

    // Try to (re)resume opportunistically; if still suspended, bail quietly.
    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => {})
    }
    this.unlocked = true

    const sample = this.buffers.get(name)
    if (sample) {
      this.playBuffer(ctx, sample)
      return
    }
    if (sample === undefined && samplePaths[name]) {
      // Kick off a one-time async load; play synth this time so it isn't silent.
      void this.loadSample(name, samplePaths[name] as string)
    }
    this.playSynth(ctx, RECIPES[name])
  }

  /** Release audio resources. Safe to call multiple times. */
  dispose(): void {
    try {
      void this.ctx?.close()
    } catch {
      /* ignore */
    }
    this.ctx = null
    this.master = null
    this.unlocked = false
    this.buffers.clear()
  }

  // ---- internals ----------------------------------------------------------

  private ensureContext(): AudioContext | null {
    if (this.ctx) return this.ctx
    const Ctor = getAudioContextCtor()
    if (!Ctor) return null
    try {
      this.ctx = new Ctor()
    } catch {
      this.ctx = null
      return null
    }
    const master = this.ctx.createGain()
    master.gain.setValueAtTime(this.volume, this.ctx.currentTime)
    master.connect(this.ctx.destination)
    this.master = master
    this.unlocked = this.ctx.state === 'running'
    return this.ctx
  }

  private playSynth(ctx: AudioContext, recipe: Recipe): void {
    if (!this.master) return
    const now = ctx.currentTime
    const env = ctx.createGain()
    const peak = recipe.peak
    env.gain.setValueAtTime(0.0001, now)
    env.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), now + recipe.attack)
    env.gain.exponentialRampToValueAtTime(0.0001, now + recipe.duration)
    env.connect(this.master)

    for (const p of recipe.partials) {
      const osc = ctx.createOscillator()
      osc.type = p.type
      osc.frequency.setValueAtTime(p.freq, now)
      if (p.toFreq && p.toFreq !== p.freq) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(p.toFreq, 1), now + recipe.duration)
      }
      const partialGain = ctx.createGain()
      partialGain.gain.setValueAtTime(p.gain, now)
      osc.connect(partialGain)
      partialGain.connect(env)
      osc.start(now)
      osc.stop(now + recipe.duration + 0.02)
      osc.onended = () => {
        try {
          osc.disconnect()
          partialGain.disconnect()
        } catch {
          /* ignore */
        }
      }
    }
    // Tear down the envelope node shortly after the tail.
    window.setTimeout(
      () => {
        try {
          env.disconnect()
        } catch {
          /* ignore */
        }
      },
      Math.ceil((recipe.duration + 0.05) * 1000)
    )
  }

  private playBuffer(ctx: AudioContext, buffer: AudioBuffer): void {
    if (!this.master) return
    const src = ctx.createBufferSource()
    src.buffer = buffer
    src.connect(this.master)
    src.start()
    src.onended = () => {
      try {
        src.disconnect()
      } catch {
        /* ignore */
      }
    }
  }

  private async loadSample(name: SoundName, url: string): Promise<void> {
    // Mark as "loading" so we don't fire repeated fetches; null means "no sample".
    this.buffers.set(name, null)
    const ctx = this.ensureContext()
    if (!ctx) return
    try {
      const res = await fetch(url)
      if (!res.ok) return
      const data = await res.arrayBuffer()
      const decoded = await ctx.decodeAudioData(data)
      this.buffers.set(name, decoded)
    } catch {
      // Leave as null → permanently falls back to synthesis for this name.
    }
  }

  /** Exposed for tests/diagnostics. */
  get state(): { hasContext: boolean; unlocked: boolean; enabled: boolean } {
    return { hasContext: this.ctx !== null, unlocked: this.unlocked, enabled: this.enabled }
  }
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0
  return Math.min(1, Math.max(0, n))
}

// Process-wide singleton. Components should use the useSound hook, which wires
// this to the live settings flag and to the gesture-unlock listeners.
let singleton: SoundManager | null = null

export function getSoundManager(): SoundManager {
  if (!singleton) {
    singleton = new SoundManager({ enabled: readSoundEnabledFromSettings() })
  }
  return singleton
}
