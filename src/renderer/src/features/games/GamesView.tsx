import { useState, type JSX } from 'react'
import { Board } from '../../board/Board'
import { pieceSetClass } from '../../board/pieceSets'
import { useSettings } from '../../state/settings'
import { CHESS_VARIANTS, COMING_SOON, type CatalogEntry } from './catalog'
import { ArtThumb } from './ArtThumb'
import { GamePage } from './GamePage'
import './games.css'

/**
 * Games library — the storefront. Card grid over the game catalog: playable
 * chess variants render a live mini board with a characteristic position;
 * coming-soon games get vector art placeholders with a P2 pill. Clicking a
 * card opens the per-game page (Play / Manual).
 */
export default function GamesView(): JSX.Element {
  const { settings } = useSettings()
  const [selected, setSelected] = useState<CatalogEntry | null>(null)

  if (selected) {
    return <GamePage entry={selected} onBack={() => setSelected(null)} />
  }

  const boardCls = `board-wrap board-${settings.boardTheme} ${pieceSetClass(settings.pieceSet)}`

  const card = (entry: CatalogEntry): JSX.Element => (
    <button
      key={entry.kind}
      type="button"
      className={`game-card${entry.status === 'coming' ? ' is-coming' : ''}`}
      onClick={() => setSelected(entry)}
    >
      <span className="game-card-thumb" aria-hidden>
        {entry.thumbFen ? (
          <span className={`${boardCls} game-card-board`}>
            <Board
              fen={entry.thumbFen}
              orientation="white"
              turnColor="white"
              dests={new Map()}
              viewOnly
              coordinates={false}
              animation={false}
            />
          </span>
        ) : (
          <ArtThumb kind={entry.kind} />
        )}
        {entry.status === 'coming' && <span className="pill-p2 game-card-pill">P2</span>}
      </span>
      <span className="game-card-title">{entry.title}</span>
      <span className="game-card-tagline">{entry.tagline}</span>
    </button>
  )

  return (
    <div className="games-view">
      <p className="games-intro">
        One library, many boards. Every game ships with local play, five bot levels, online
        matches and an illustrated manual.
      </p>

      <section aria-labelledby="games-now">
        <h2 id="games-now" className="games-section-title">
          Play now
          <span className="games-section-sub">Chess variants — full rules, over the board</span>
        </h2>
        <div className="games-grid">{CHESS_VARIANTS.map(card)}</div>
      </section>

      <section aria-labelledby="games-soon">
        <h2 id="games-soon" className="games-section-title">
          Coming soon
          <span className="games-section-sub">Landing in P2 — xiangqi to hex</span>
        </h2>
        <div className="games-grid">{COMING_SOON.map(card)}</div>
      </section>
    </div>
  )
}
