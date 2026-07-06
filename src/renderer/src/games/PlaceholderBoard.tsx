// TODO(P2): replace with real per-family board renderers (chessgroundx for the
// chess family, shudan for go, draughtsground for checkers, ...). This stub
// exists so registry entries have a working lazy renderer from day one.
import type { JSX } from 'react'
import type { GameBoardProps } from './registry'

export default function PlaceholderBoard({ kind }: GameBoardProps): JSX.Element {
  return (
    <div
      style={{
        display: 'grid',
        placeItems: 'center',
        aspectRatio: '1 / 1',
        borderRadius: 8,
        background: 'var(--bg-elevated, #2a2a2a)',
        color: 'var(--text-muted, #888)',
        fontSize: 14
      }}
    >
      {kind} board coming soon
    </div>
  )
}
