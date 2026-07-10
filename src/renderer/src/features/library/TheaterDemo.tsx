// Dev harness for Replay Theater (`?theater=<kind>` — see main.tsx).
//
// Mounts ReplayTheater over a canned finished game so the cinematic camera,
// capture emphasis, transport controls and export are visually verifiable
// without playing a full game first. Chess gets an authored miniature (Légal's
// mate — two captures and a checkmate in 13 plies); every other kind plays a
// deterministic seeded self-play through its real GameSpec, biased toward
// captures so the emphasis choreography shows up. Code-split: nothing in the
// app shell imports this module.

import { useEffect, useState, type JSX } from 'react'
import { SettingsProvider } from '../../state/settings'
import type { GameKind, GameSpec } from '../../games/kernel'
import { getGame, isRegisteredGame, type GameEntry } from '../../games/registry'
import { ReplayTheater, buildTheaterInput, type TheaterInput } from './ReplayTheater'

// Légal's mate: 1.e4 e5 2.Nf3 d6 3.Bc4 Bg4 4.Nc3 g6 5.Nxe5 Bxd1 6.Bxf7+ Ke7 7.Nd5#
const LEGAL_MATE = [
  'e2e4', 'e7e5', 'g1f3', 'd7d6', 'f1c4', 'c8g4', 'b1c3', 'g7g6',
  'f3e5', 'g4d1', 'c4f7', 'e8e7', 'c3d5'
]

/** Deterministic PRNG (mulberry32) — the demo take is identical every run. */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a += 0x6d2b79f5
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Seeded self-play through the real spec: prefers captures (they are the
 *  choreography's showpiece), avoids pass/swap while board moves exist. */
function demoMoves(spec: GameSpec<unknown>, options: unknown, maxPlies: number): string[] {
  const rand = rng(0xc1a99e5)
  const moves: string[] = []
  let s = spec.init(options)
  for (let i = 0; i < maxPlies; i++) {
    if (spec.result(s) !== null) break
    const legal = spec.legalMoves(s)
    if (legal.length === 0) break
    const board = legal.filter((m) => m !== 'pass' && m !== 'swap')
    const pool = board.length > 0 ? board : legal
    let pick: string | undefined
    if (rand() < 0.7) {
      const caps = pool.filter((m) => {
        try {
          return spec.moveMeta(s, m).capture === true
        } catch {
          return false
        }
      })
      if (caps.length > 0) pick = caps[Math.floor(rand() * caps.length)]
    }
    pick ??= pool[Math.floor(rand() * pool.length)]
    const next = spec.play(s, pick)
    if (next === null) break
    moves.push(pick)
    s = next
  }
  return moves
}

async function buildDemo(kindParam: string): Promise<TheaterInput> {
  const kind = (isRegisteredGame(kindParam) ? kindParam : 'chess') as GameKind
  const entry = getGame(kind) as GameEntry
  if (entry.requiresPreload) await entry.spec.preload?.()
  const spec = entry.spec as GameSpec<unknown>
  const options = kind === 'go' ? { size: 9 } : undefined
  const moves = kind === 'chess' ? LEGAL_MATE : demoMoves(spec, options, kind === 'go' ? 46 : 60)
  // Result display: replay the line to ask the spec (self-play may end mid-game).
  let s = spec.init(options)
  for (const m of moves) s = spec.play(s, m) ?? s
  const outcome = spec.result(s)
  return buildTheaterInput({
    entry,
    moves,
    options,
    result: outcome?.score ?? '*',
    reason: outcome?.reason,
    white: 'Demo White',
    black: 'Demo Black',
    event: 'Theater harness'
  })
}

export default function TheaterDemo({ kindParam }: { kindParam: string }): JSX.Element {
  const [data, setData] = useState<TheaterInput | null>(null)
  useEffect(() => {
    let cancelled = false
    void buildDemo(kindParam).then((d) => {
      if (!cancelled) setData(d)
    })
    return () => {
      cancelled = true
    }
  }, [kindParam])
  return (
    <SettingsProvider>
      {data ? (
        <ReplayTheater
          data={data}
          onExit={() => {
            window.location.search = ''
          }}
        />
      ) : (
        <div style={{ padding: 40, font: '14px Inter, system-ui, sans-serif' }}>
          Setting the stage…
        </div>
      )}
    </SettingsProvider>
  )
}
