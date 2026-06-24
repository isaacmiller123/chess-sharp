import { UserAvatar, EngineAvatar } from '../../components/Avatar'

export interface PlayerChipProps {
  kind: 'user' | 'engine'
  name: string
  /** Sub-label, e.g. the engine's Elo or a persona's peak Elo. */
  sub?: string
  /** Optional secondary line shown above the sub, e.g. "in the style of …". */
  styleLine?: string
  /** User avatar data URL (ignored for the engine chip). */
  avatar?: string | null
  /** Engine chip shows a subtle thinking indicator when true. */
  thinking?: boolean
}

export function PlayerChip({
  kind,
  name,
  sub,
  styleLine,
  avatar = null,
  thinking = false
}: PlayerChipProps) {
  return (
    <div className="player-chip">
      {kind === 'user' ? <UserAvatar src={avatar} name={name} size={30} /> : <EngineAvatar size={30} />}
      <div className="chip-meta">
        <span className="chip-name">{name}</span>
        {styleLine && <span className="chip-style muted small">{styleLine}</span>}
        {sub && <span className="chip-sub muted small">{sub}</span>}
      </div>
      {kind === 'engine' && thinking && (
        <span className="chip-thinking" aria-live="polite">
          <span className="chip-dot" />
          thinking
        </span>
      )}
    </div>
  )
}
