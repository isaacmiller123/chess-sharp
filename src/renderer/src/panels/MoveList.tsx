import type { ReactNode } from 'react'
import type { TreeNode } from '../state/gameTree'
import { displaySan } from '../chess/notation'
import { badgeAbbr, badgeTone, isNotableBadge, type BadgeMap } from './moveBadges'

export interface MoveListProps {
  root: TreeNode
  currentId: string
  figurineMode: boolean
  onSelect: (id: string) => void
  /** Optional per-ply review classifications. Keyed by half-move ply (1-based). */
  badges?: BadgeMap
}

export function MoveList({ root, currentId, figurineMode, onSelect, badges }: MoveListProps) {
  if (root.children.length === 0) {
    return (
      <div className="move-list empty muted small" role="status">
        No moves yet — play on the board to start a line.
      </div>
    )
  }
  return (
    <div className="move-list" role="group" aria-label="Move list">
      <Line
        node={root}
        currentId={currentId}
        figurineMode={figurineMode}
        onSelect={onSelect}
        badges={badges}
        forceNum
      />
    </div>
  )
}

function Line({
  node,
  currentId,
  figurineMode,
  onSelect,
  badges,
  forceNum
}: {
  node: TreeNode
  currentId: string
  figurineMode: boolean
  onSelect: (id: string) => void
  badges?: BadgeMap
  forceNum: boolean
}) {
  const out: ReactNode[] = []
  let cur = node
  let needNum = forceNum
  while (cur.children.length) {
    const main = cur.children[0]
    out.push(
      <MoveToken
        key={main.id}
        node={main}
        forceNum={needNum}
        current={main.id === currentId}
        figurineMode={figurineMode}
        onSelect={onSelect}
        badges={badges}
      />
    )
    if (cur.children.length > 1) {
      for (const v of cur.children.slice(1)) {
        out.push(
          <span className="variation" key={`v${v.id}`}>
            {'( '}
            <MoveToken
              node={v}
              forceNum
              current={v.id === currentId}
              figurineMode={figurineMode}
              onSelect={onSelect}
            />
            <Line node={v} currentId={currentId} figurineMode={figurineMode} onSelect={onSelect} forceNum={false} />
            {') '}
          </span>
        )
      }
      needNum = true
    } else {
      needNum = false
    }
    cur = main
  }
  return <>{out}</>
}

function MoveToken({
  node,
  forceNum,
  current,
  figurineMode,
  onSelect,
  badges
}: {
  node: TreeNode
  forceNum: boolean
  current: boolean
  figurineMode: boolean
  onSelect: (id: string) => void
  badges?: BadgeMap
}) {
  const isWhite = node.ply % 2 === 1
  const num = Math.ceil(node.ply / 2)
  const prefix = isWhite ? `${num}.` : forceNum ? `${num}…` : ''
  const san = node.move ? displaySan(node.move.san, figurineMode) : ''
  const rawSan = node.move?.san ?? ''
  const badge = badges?.get(node.ply)
  const notableBadge = badge && isNotableBadge(badge) ? badge : undefined
  // Spoken label uses the plain SAN (never the figurine glyph) plus move number
  // and side, and appends the classification word so it is not color-only.
  const label = `${num}${isWhite ? '. ' : '... '}${rawSan}${notableBadge ? `, ${notableBadge}` : ''}`
  return (
    <button
      type="button"
      className={`move${current ? ' is-current' : ''}`}
      aria-current={current ? 'true' : undefined}
      aria-label={label}
      onClick={() => onSelect(node.id)}
    >
      {prefix && (
        <span className="move-num" aria-hidden>
          {prefix}
        </span>
      )}
      <span className="move-san num">{san}</span>
      {notableBadge && (
        <span className={`move-badge tone-${badgeTone(notableBadge)}`} title={notableBadge} aria-hidden>
          {badgeAbbr(notableBadge)}
        </span>
      )}
    </button>
  )
}
