import { useEffect, useRef, useState } from 'react'
import type { EngineLine } from '@shared/types'

export interface PvLine {
  multipv: number
  depth: number
  scoreCp?: number
  mate?: number
  pv: string[]
}

// Live infinite analysis of `fen` while `enabled`. Streams MultiPV lines from the
// main-process Stockfish via the engine IPC push channel.
export function useAnalysis(fen: string, enabled: boolean, multipv = 3) {
  const [lines, setLines] = useState<PvLine[]>([])
  const [depth, setDepth] = useState(0)
  const handleRef = useRef<number | null>(null)
  const linesRef = useRef<Map<number, PvLine>>(new Map())

  useEffect(() => {
    if (!window.api?.engine) return
    const off = window.api.engine.onLine((l: EngineLine) => {
      if (l.handleId !== handleRef.current || !l.multipv || !l.pv) return
      linesRef.current.set(l.multipv, {
        multipv: l.multipv,
        depth: l.depth ?? 0,
        scoreCp: l.scoreCp,
        mate: l.mate,
        pv: l.pv
      })
      setLines(Array.from(linesRef.current.values()).sort((a, b) => a.multipv - b.multipv))
      if (l.depth) setDepth(l.depth)
    })
    return off
  }, [])

  useEffect(() => {
    const engine = window.api?.engine
    if (!engine) return
    let cancelled = false
    linesRef.current = new Map()
    setLines([])
    setDepth(0)

    const stopCurrent = () => {
      if (handleRef.current !== null) {
        engine.stop(handleRef.current)
        handleRef.current = null
      }
    }
    stopCurrent()

    if (enabled) {
      engine
        .analyze({ fen, multipv, limit: { kind: 'infinite' } })
        .then(({ handleId }) => {
          if (cancelled) engine.stop(handleId)
          else handleRef.current = handleId
        })
        .catch(() => undefined)
    }

    return () => {
      cancelled = true
      stopCurrent()
    }
  }, [fen, enabled, multipv])

  return { lines, depth }
}
