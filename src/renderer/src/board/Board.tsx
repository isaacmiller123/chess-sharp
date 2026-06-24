import { useEffect, useRef } from 'react'
import { Chessground } from 'chessground'
import type { Api } from 'chessground/api'
import type { Config } from 'chessground/config'
import type { Key } from 'chessground/types'
import type { Color } from '../chess/chess'

export interface BoardProps {
  fen: string
  orientation: Color
  turnColor: Color
  dests: Map<Key, Key[]>
  lastMove?: [Key, Key]
  check?: Color
  movableColor?: Color | 'both'
  viewOnly?: boolean
  showDests?: boolean
  animation?: boolean
  coordinates?: boolean
  /** Bump to force the board to re-sync to `fen` even when fen is unchanged (e.g. cancelled promotion / illegal move). */
  syncNonce?: number
  onMove?: (orig: Key, dest: Key) => void
}

export function Board(props: BoardProps) {
  const elRef = useRef<HTMLDivElement>(null)
  const apiRef = useRef<Api | null>(null)
  const propsRef = useRef(props)
  propsRef.current = props

  const config = (): Config => {
    const p = propsRef.current
    return {
      fen: p.fen,
      orientation: p.orientation,
      turnColor: p.turnColor,
      coordinates: p.coordinates ?? true,
      viewOnly: p.viewOnly ?? false,
      check: p.check,
      lastMove: p.lastMove,
      highlight: { lastMove: true, check: true },
      animation: { enabled: p.animation ?? true, duration: 200 },
      movable: {
        free: false,
        color: p.viewOnly ? undefined : (p.movableColor ?? p.turnColor),
        dests: p.dests,
        showDests: p.showDests ?? true,
        events: {
          after: (orig, dest) => propsRef.current.onMove?.(orig as Key, dest as Key)
        }
      },
      drawable: { enabled: true, visible: true }
    }
  }

  useEffect(() => {
    if (!elRef.current) return
    apiRef.current = Chessground(elRef.current, config())
    return () => {
      apiRef.current?.destroy()
      apiRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    apiRef.current?.set(config())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    props.fen,
    props.orientation,
    props.turnColor,
    props.movableColor,
    props.viewOnly,
    props.showDests,
    props.coordinates,
    props.check,
    props.lastMove?.join(''),
    props.syncNonce
  ])

  return <div className="cg-wrap" ref={elRef} />
}
