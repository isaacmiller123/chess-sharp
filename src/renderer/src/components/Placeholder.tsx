import type { ViewKey } from './Layout'

const COPY: Partial<Record<ViewKey, { title: string; body: string }>> = {
  home: {
    title: 'Home dashboard',
    body: 'Your progress at a glance, recent games, and continue-where-you-left-off across play, puzzles, and lessons.'
  },
  play: {
    title: 'Play',
    body: 'Play Stockfish at any Elo, plus grandmaster-style personas (their openings + a style-matched engine).'
  },
  puzzles: {
    title: 'Puzzles',
    body: '4.7M bundled Lichess puzzles with a local Glicko-2 rating and spaced-repetition review.'
  },
  lessons: {
    title: 'Lessons & Famous Games',
    body: 'A curriculum from beginner to ~2000, plus an annotated library of famous games.'
  },
  openings: {
    title: 'Openings',
    body: 'An offline opening explorer with names, ECO codes, and your own repertoire.'
  },
  progress: {
    title: 'Progress',
    body: 'Both ratings (kept distinct), accuracy trends, and your full game history.'
  }
}

export function Placeholder({ view }: { view: ViewKey }) {
  const c = COPY[view] ?? { title: 'Coming soon', body: '' }
  const headingId = `placeholder-${view}`
  return (
    <div className="placeholder">
      <section className="card" role="region" aria-labelledby={headingId}>
        <h2 id={headingId}>{c.title}</h2>
        {c.body && <p className="muted">{c.body}</p>}
        <p className="muted small">
          Under construction in the current build loop — the engine, board, and 4.7M-puzzle database are
          already live.
        </p>
      </section>
    </div>
  )
}
