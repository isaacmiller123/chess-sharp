// Go board — minimal read-only Shudan mount (P2 wave 1).
//
// @sabaki/shudan is a PREACT component. Rather than aliasing react →
// preact/compat app-wide (the app is React 19; chessground and friends must
// stay on real React), we mount a self-contained preact island: this React
// component owns a host <div> and renders the Goban into it with preact's own
// runtime (shudan imports 'preact' directly, which is installed — no
// electron.vite.config.ts alias needed; JSX in this file stays React JSX, the
// preact side uses h() calls only).
//
// P2 wave 2 adds interactivity (vertex clicks → onMove, dead-stone marking in
// the scoring phase, last-move marker, ko marker). For now: render the
// position from the go GameSpec state, read-only.

import { useEffect, useRef } from 'react'
import type { JSX } from 'react'
import { h, render } from 'preact'
import { Goban } from '@sabaki/shudan'
import '@sabaki/shudan/css/goban.css'
import type { GameBoardProps } from '../registry'
import { signMapOf, type GoState } from '../go'

export default function GoBoard({ state }: GameBoardProps): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const goState = state as GoState
    render(
      h(Goban as never, {
        signMap: signMapOf(goState),
        showCoordinates: true,
        fuzzyStonePlacement: false,
        animateStonePlacement: false
      }),
      host
    )
    return (): void => {
      // Unmount the preact tree when the React component goes away.
      render(null, host)
    }
  }, [state])

  return <div ref={hostRef} style={{ display: 'grid', placeItems: 'center' }} />
}
