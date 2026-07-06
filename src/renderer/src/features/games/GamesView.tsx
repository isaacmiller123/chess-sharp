import { lazy, Suspense, useState, type JSX } from 'react'
import { ChevronRight, FlaskConical } from 'lucide-react'
import { Board } from '../../board/Board'
import { pieceSetClass } from '../../board/pieceSets'
import { useSettings } from '../../state/settings'
import { CATALOG, type CatalogEntry } from './catalog'
import { ArtThumb } from './ArtThumb'
import { GamePage } from './GamePage'
import './games.css'
// The Lab hero card is styled by the editor's stylesheet (vl-hero) — imported
// eagerly so the hero renders styled before the lazy EditorView chunk loads.
import './editor/editor.css'

// Variant Lab (features/games/editor) — code-split: the builder + ffish tooling
// only load when the user opens the Lab.
const EditorView = lazy(() => import('./editor/EditorView'))

/**
 * Games library — the storefront. Card grid over the game catalog: playable
 * chess variants render a live mini board with a characteristic position;
 * coming-soon games get vector art placeholders with a P2 pill. Clicking a
 * card opens the per-game page (Play / Manual). The Variant Lab hero at the
 * bottom opens the custom-variant editor ('custom-editor' catalog card's
 * real home).
 */
export default function GamesView({
  onOpenSettings
}: {
  /** Deep link to the Settings view (bot engine install prompts). */
  onOpenSettings?: () => void
}): JSX.Element {
  const { settings } = useSettings()
  const [selected, setSelected] = useState<CatalogEntry | null>(null)
  const [labOpen, setLabOpen] = useState(false)

  if (labOpen) {
    return (
      <Suspense
        fallback={
          <div className="view-loading" role="status">
            <span className="view-spinner" aria-hidden />
          </div>
        }
      >
        <EditorView onExit={() => setLabOpen(false)} />
      </Suspense>
    )
  }

  if (selected) {
    return <GamePage entry={selected} onBack={() => setSelected(null)} onOpenSettings={onOpenSettings} />
  }

  const boardCls = `board-wrap board-${settings.boardTheme} ${pieceSetClass(settings.pieceSet)}`

  const card = (entry: CatalogEntry): JSX.Element => (
    <button
      key={entry.kind}
      type="button"
      className={`game-card${entry.status === 'coming' ? ' is-coming' : ''}`}
      onClick={() => (entry.kind === 'custom-editor' ? setLabOpen(true) : setSelected(entry))}
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
          <span className="games-section-sub">Full rules, over the board</span>
        </h2>
        <div className="games-grid">{CATALOG.filter((e) => e.status === 'playable').map(card)}</div>
      </section>

      <section aria-labelledby="games-lab">
        <h2 id="games-lab" className="games-section-title">
          Make your own
          <span className="games-section-sub">The Variant Lab — real Fairy-Stockfish rules</span>
        </h2>
        <button type="button" className="vl-hero" onClick={() => setLabOpen(true)}>
          <span className="vl-hero-icon">
            <FlaskConical size={26} aria-hidden />
          </span>
          <span className="vl-hero-body">
            <span className="vl-hero-title">Variant Lab</span>
            <span className="vl-hero-sub">
              Thirty pawns against the world. Queens that jump like knights. Captures that explode.
              Paint a start position, flip the rules, and play it over the board — instantly.
            </span>
          </span>
          <span className="vl-hero-cta">
            Open the Lab <ChevronRight size={16} aria-hidden />
          </span>
        </button>
      </section>

      <section aria-labelledby="games-soon">
        <h2 id="games-soon" className="games-section-title">
          Coming soon
          <span className="games-section-sub">Landing later in P2</span>
        </h2>
        <div className="games-grid">
          {CATALOG.filter((e) => e.status === 'coming' && e.kind !== 'custom-editor').map(card)}
        </div>
      </section>
    </div>
  )
}
