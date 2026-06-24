import type { ReactNode } from 'react'
import type { TreeNode } from '../state/gameTree'
import { displaySan } from '../chess/notation'

export interface MoveListProps {
  root: TreeNode
  currentId: string
  figurineMode: boolean
  onSelect: (id: string) => void
}

export function MoveList({ root, currentId, figurineMode, onSelect }: MoveListProps) {
  if (root.children.length === 0) {
    return <div className="move-list empty muted small">No moves yet — play on the board to start a line.</div>
  }
  return (
    <div className="move-list">
      <Line node={root} currentId={currentId} figurineMode={figurineMode} onSelect={onSelect} forceNum />
    </div>
  )
}

function Line({
  node,
  currentId,
  figurineMode,
  onSelect,
  forceNum
}: {
  node: TreeNode
  currentId: string
  figurineMode: boolean
  onSelect: (id: string) => void
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
  onSelect
}: {
  node: TreeNode
  forceNum: boolean
  current: boolean
  figurineMode: boolean
  onSelect: (id: string) => void
}) {
  const isWhite = node.ply % 2 === 1
  const num = Math.ceil(node.ply / 2)
  const prefix = isWhite ? `${num}.` : forceNum ? `${num}…` : ''
  const san = node.move ? displaySan(node.move.san, figurineMode) : ''
  return (
    <span className={`move${current ? ' is-current' : ''}`} onClick={() => onSelect(node.id)}>
      {prefix && <span className="move-num">{prefix}</span>}
      <span className="move-san num">{san}</span>
    </span>
  )
}
