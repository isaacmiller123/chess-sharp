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
  | 'puzzleSolved'
  | 'puzzleFailed'

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
  /**
   * Seconds to wait (from the sound's start) before this partial sounds. Lets a
   * recipe stagger notes into a short arpeggio without a separate scheduler.
   * Default 0 (sounds immediately, like every other partial). The partial then
   * runs for `dur` seconds (or to the end of the recipe when `dur` is omitted).
   */
  delay?: number
  /** Per-partial duration in seconds. Omit to run until the recipe ends. */
  dur?: number
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
  // move — soft, dry wooden "tock". Lowest, shortest, single triangle partial so
  // it stays unobtrusive under rapid play and reads plainly as "a piece moved".
  move: {
    partials: [{ type: 'triangle', freq: 300, toFreq: 196, gain: 1 }],
    attack: 0.002,
    duration: 0.085,
    peak: 0.5
  },
  // capture — harder, grittier knock. A square sub-tone adds a percussive thud
  // the plain move lacks, and a quick bright triangle "click" rides on top.
  capture: {
    partials: [
      { type: 'square', freq: 180, toFreq: 110, gain: 0.6 },
      { type: 'triangle', freq: 520, toFreq: 320, gain: 0.45 }
    ],
    attack: 0.001,
    duration: 0.13,
    peak: 0.55
  },
  // check — bright, attention-getting two-tone in a high register (clear fifth),
  // the second note delayed so it reads as a deliberate "ding-ding" alert.
  check: {
    partials: [
      { type: 'sine', freq: 880, gain: 0.8, dur: 0.09 },
      { type: 'sine', freq: 1320, gain: 0.45, delay: 0.07, dur: 0.11 }
    ],
    attack: 0.002,
    duration: 0.2,
    peak: 0.5
  },
  // castle — low rolling "thunk-thunk": two staggered triangle hits suggest the
  // king and rook settling. Deliberately bassy so it never reads like a capture.
  castle: {
    partials: [
      { type: 'triangle', freq: 240, toFreq: 175, gain: 0.85, dur: 0.1 },
      { type: 'triangle', freq: 200, toFreq: 150, gain: 0.7, delay: 0.085, dur: 0.12 },
      { type: 'sine', freq: 360, toFreq: 300, gain: 0.22 }
    ],
    attack: 0.003,
    duration: 0.22,
    peak: 0.5
  },
  // promote — celebratory rising triad (C5-E5-G5-ish). Sequential sine notes give
  // an unmistakable "level up" flourish distinct from the single-note move/check.
  promote: {
    partials: [
      { type: 'sine', freq: 523, gain: 0.7, delay: 0, dur: 0.1 },
      { type: 'sine', freq: 659, gain: 0.7, delay: 0.08, dur: 0.1 },
      { type: 'sine', freq: 784, toFreq: 988, gain: 0.75, delay: 0.16, dur: 0.16 },
      { type: 'triangle', freq: 1568, gain: 0.18, delay: 0.16, dur: 0.16 }
    ],
    attack: 0.004,
    duration: 0.36,
    peak: 0.45
  },
  // gameStart — warm ascending perfect-fourth fanfare (A4 -> D5). Two clean sine
  // notes, gentle and inviting; lower and rounder than the puzzleSolved cue.
  gameStart: {
    partials: [
      { type: 'sine', freq: 440, gain: 0.9, delay: 0, dur: 0.16 },
      { type: 'sine', freq: 587, gain: 0.9, delay: 0.12, dur: 0.2 },
      { type: 'triangle', freq: 880, gain: 0.18, delay: 0.12, dur: 0.2 }
    ],
    attack: 0.006,
    duration: 0.34,
    peak: 0.42
  },
  // gameEnd — settled descending resolve (G4 -> C4) with a soft low body. Reads
  // as a calm "that's over", clearly the inverse of the gameStart rise.
  gameEnd: {
    partials: [
      { type: 'sine', freq: 392, gain: 0.85, delay: 0, dur: 0.18 },
      { type: 'sine', freq: 262, gain: 0.85, delay: 0.14, dur: 0.26 },
      { type: 'triangle', freq: 196, gain: 0.3, delay: 0.14, dur: 0.26 }
    ],
    attack: 0.006,
    duration: 0.44,
    peak: 0.45
  },
  // lowTime — tense, dry high tick. Square wave with a slight downward bend so a
  // repeated train of these feels like an urgent countdown clock.
  lowTime: {
    partials: [{ type: 'square', freq: 920, toFreq: 760, gain: 0.7 }],
    attack: 0.001,
    duration: 0.09,
    peak: 0.4
  },
  // puzzleSolved — pleasant, brighter-than-gameStart success arpeggio: a rising
  // major triad (C5-E5-G5) capped by a high octave sparkle. Triangle bodies give
  // it a chime-like shimmer that clearly says "correct!".
  puzzleSolved: {
    partials: [
      { type: 'triangle', freq: 523, gain: 0.7, delay: 0, dur: 0.11 },
      { type: 'triangle', freq: 659, gain: 0.7, delay: 0.09, dur: 0.11 },
      { type: 'triangle', freq: 784, gain: 0.75, delay: 0.18, dur: 0.16 },
      { type: 'sine', freq: 1047, gain: 0.4, delay: 0.26, dur: 0.18 }
    ],
    attack: 0.004,
    duration: 0.46,
    peak: 0.46
  },
  // puzzleFailed — soft, non-harsh error: a gentle descending minor second
  // (F4 -> E4-ish) on a mellow triangle. Lower and rounder than the check alert,
  // deliberately understated so a wrong answer never feels punishing.
  puzzleFailed: {
    partials: [
      { type: 'triangle', freq: 349, gain: 0.8, delay: 0, dur: 0.13 },
      { type: 'triangle', freq: 277, gain: 0.8, delay: 0.11, dur: 0.2 },
      { type: 'sine', freq: 174, gain: 0.25, delay: 0.11, dur: 0.2 }
    ],
    attack: 0.005,
    duration: 0.34,
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
    const peak = Math.max(recipe.peak, 0.0002)

    // Master bus for the whole sound — a single shared output node that we tear
    // down once the longest partial has rung out.
    const bus = ctx.createGain()
    bus.gain.setValueAtTime(peak, now)
    bus.connect(this.master)

    let tailEnd = recipe.duration
    for (const p of recipe.partials) {
      const start = now + (p.delay ?? 0)
      // Per-partial length: explicit `dur`, else whatever's left of the recipe.
      const span = p.dur ?? Math.max(recipe.duration - (p.delay ?? 0), recipe.attack + 0.01)
      const stop = start + span
      tailEnd = Math.max(tailEnd, (p.delay ?? 0) + span)

      const osc = ctx.createOscillator()
      osc.type = p.type
      osc.frequency.setValueAtTime(p.freq, start)
      if (p.toFreq && p.toFreq !== p.freq) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(p.toFreq, 1), stop)
      }

      // Each partial gets its own attack/decay so staggered notes read as
      // distinct events rather than one smeared blob.
      const env = ctx.createGain()
      env.gain.setValueAtTime(0.0001, start)
      env.gain.exponentialRampToValueAtTime(Math.max(p.gain, 0.0002), start + recipe.attack)
      env.gain.exponentialRampToValueAtTime(0.0001, stop)

      osc.connect(env)
      env.connect(bus)
      osc.start(start)
      osc.stop(stop + 0.02)
      osc.onended = () => {
        try {
          osc.disconnect()
          env.disconnect()
        } catch {
          /* ignore */
        }
      }
    }

    // Tear down the shared bus shortly after the last partial's tail.
    window.setTimeout(
      () => {
        try {
          bus.disconnect()
        } catch {
          /* ignore */
        }
      },
      Math.ceil((tailEnd + 0.05) * 1000)
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
