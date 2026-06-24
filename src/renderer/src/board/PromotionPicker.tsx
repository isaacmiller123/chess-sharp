import type { Role } from 'chessops/types'
import type { Color } from '../chess/chess'

const GLYPH: Record<Color, Record<'queen' | 'rook' | 'bishop' | 'knight', string>> = {
  white: { queen: '♕', rook: '♖', bishop: '♗', knight: '♘' },
  black: { queen: '♛', rook: '♜', bishop: '♝', knight: '♞' }
}

const ROLES: Array<'queen' | 'rook' | 'bishop' | 'knight'> = ['queen', 'rook', 'bishop', 'knight']

export function PromotionPicker({
  color,
  onSelect,
  onCancel
}: {
  color: Color
  onSelect: (role: Role) => void
  onCancel: () => void
}) {
  return (
    <div className="promo-overlay" onClick={onCancel}>
      <div className="promo-card" onClick={(e) => e.stopPropagation()}>
        {ROLES.map((r) => (
          <button key={r} className="promo-choice" onClick={() => onSelect(r)} aria-label={`Promote to ${r}`}>
            <span className="promo-glyph">{GLYPH[color][r]}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
