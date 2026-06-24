import type { JSX } from 'react'
import type { Key } from 'chessground/types'
import type { Color } from '../../chess/chess'

export interface HintArrowProps {
  from?: Key
  to?: Key
  orientation: Color
  stage: 0 | 1 | 2 | 3
}

const FILES = 'abcdefgh'

/** Square key -> centre coords in an 8x8 viewBox, respecting board orientation. */
function center(key: Key, orientation: Color): { cx: number; cy: number } {
  const f = FILES.indexOf(key[0])
  const r = Number.parseInt(key[1], 10) - 1
  if (f < 0 || !Number.isFinite(r)) return { cx: -1, cy: -1 }
  if (orientation === 'white') return { cx: f + 0.5, cy: 7.5 - r }
  return { cx: 7.5 - f, cy: r + 0.5 }
}

/**
 * SVG overlay drawing the hint ring (stage >= 1) and destination arrow
 * (stage >= 2) on top of the board. Board exposes no shapes/drawable prop,
 * so we render an absolutely-positioned overlay matched to the 8x8 grid.
 * Mimics chessground's green right-click brush color.
 */
export function HintArrow({ from, to, orientation, stage }: HintArrowProps): JSX.Element | null {
  if (stage < 1 || !from) return null
  const a = center(from, orientation)
  if (a.cx < 0) return null

  const showArrow = stage >= 2 && !!to
  const b = to ? center(to, orientation) : a

  // Shorten the line so the arrowhead sits inside the destination square.
  const dx = b.cx - a.cx
  const dy = b.cy - a.cy
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  const headBack = 0.34
  const tipX = b.cx - ux * 0.18
  const tipY = b.cy - uy * 0.18
  const lineEndX = tipX - ux * headBack
  const lineEndY = tipY - uy * headBack
  // Arrowhead triangle.
  const perpX = -uy
  const perpY = ux
  const halfW = 0.2
  const baseX = tipX - ux * headBack
  const baseY = tipY - uy * headBack
  const head = `${tipX},${tipY} ${baseX + perpX * halfW},${baseY + perpY * halfW} ${baseX - perpX * halfW},${baseY - perpY * halfW}`

  return (
    <svg className="hint-overlay" viewBox="0 0 8 8" preserveAspectRatio="none" aria-hidden>
      <circle
        cx={a.cx}
        cy={a.cy}
        r={0.45}
        fill="none"
        stroke="var(--brush-green)"
        strokeWidth={0.12}
        opacity={0.9}
      />
      {showArrow && (
        <>
          <line
            x1={a.cx}
            y1={a.cy}
            x2={lineEndX}
            y2={lineEndY}
            stroke="var(--brush-green)"
            strokeWidth={0.16}
            strokeLinecap="round"
            opacity={0.85}
          />
          <polygon points={head} fill="var(--brush-green)" opacity={0.85} />
        </>
      )}
    </svg>
  )
}
