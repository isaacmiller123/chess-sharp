import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  FlipVertical2,
  Library,
  Sparkles
} from 'lucide-react'
import type {
  FamousGameDetail,
  FamousGameMeta,
  GameReview,
  MoveBadge,
  ReviewProgress,
  ReviewSideSummary
} from '@shared/types'
import { Board } from '../../board/Board'
import { pieceSetClass } from '../../board/pieceSets'
import { useSettings } from '../../state/settings'
import { INITIAL_FEN, uciToLastMove, type Color } from '../../chess/chess'
import {
  detailToPgn,
  fenAtCursor,
  groupGames,
  resultLabel,
  resultTone
} from './famousData'
import { famousBadgeAbbr, famousBadgeTone, isNotableFamousBadge } from './famousBadges'
import './famous.css'

type Loadable<T> = { status: 'idle' | 'loading' | 'ready' | 'error'; data: T | null }

export default function FamousView() {
  const { settings } = useSettings()

  // ---- Library list ----
  const [list, setList] = useState<Loadable<FamousGameMeta[]>>({ status: 'loading', data: null })

  // ---- Selected game + viewer ----
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<Loadable<FamousGameDetail>>({ status: 'idle', data: null })
  const [cursor, setCursor] = useState(0) // 0 = start position, i = after move i
  const [orientation, setOrientation] = useState<Color>('white')

  // ---- Inline review state ----
  const [review, setReview] = useState<GameReview | null>(null)
  const [reviewRunning, setReviewRunning] = useState(false)
  const [reviewProgress, setReviewProgress] = useState(0)
  const [reviewError, setReviewError] = useState<string | null>(null)
  const reviewSeq = useRef(0)

  const moveListRef = useRef<HTMLDivElement>(null)

  // ---- Load the library once ----
  useEffect(() => {
    const api = window.api?.famous
    if (!api) {
      setList({ status: 'error', data: null })
      return
    }
    let cancelled = false
    setList({ status: 'loading', data: null })
    api
      .list()
      .then((r) => {
        if (!cancelled) setList({ status: 'ready', data: r.games })
      })
      .catch(() => {
        if (!cancelled) setList({ status: 'error', data: null })
      })
    return () => {
      cancelled = true
    }
  }, [])

  // ---- Load the selected game's detail ----
  useEffect(() => {
    if (!selectedId) return
    const api = window.api?.famous
    if (!api) {
      setDetail({ status: 'error', data: null })
      return
    }
    let cancelled = false
    setDetail({ status: 'loading', data: null })
    setCursor(0)
    setReview(null)
    setReviewError(null)
    api
      .get(selectedId)
      .then((r) => {
        if (cancelled) return
        if (r.game) setDetail({ status: 'ready', data: r.game })
        else setDetail({ status: 'error', data: null })
      })
      .catch(() => {
        if (!cancelled) setDetail({ status: 'error', data: null })
      })
    return () => {
      cancelled = true
    }
  }, [selectedId])

  // ---- Review progress subscription (mounts once) ----
  useEffect(() => {
    const api = window.api?.review
    if (!api) return
    return api.onProgress((p: ReviewProgress) => {
      setReviewProgress(p.total > 0 ? Math.min(1, p.ply / p.total) : 0)
    })
  }, [])

  const moves = detail.data?.moves ?? []
  const meta = detail.data?.game ?? null
  const total = moves.length

  const fen = useMemo(() => fenAtCursor(moves, cursor, INITIAL_FEN), [moves, cursor])
  const lastMove = cursor > 0 && moves[cursor - 1] ? uciToLastMove(moves[cursor - 1].uci) : undefined

  const canPrev = cursor > 0
  const canNext = cursor < total

  const first = useCallback(() => setCursor(0), [])
  const prev = useCallback(() => setCursor((c) => Math.max(0, c - 1)), [])
  const next = useCallback(() => setCursor((c) => Math.min(total, c + 1)), [total])
  const last = useCallback(() => setCursor(total), [total])

  // Per-ply badge map (only meaningful once a review exists).
  const badges = useMemo(() => {
    const map = new Map<number, MoveBadge>()
    if (review) for (const m of review.moveEvals) map.set(m.ply, m.badge)
    return map
  }, [review])

  // ---- Keyboard navigation (skip while typing) ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!detail.data) return
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'ArrowLeft') prev()
      else if (e.key === 'ArrowRight') next()
      else if (e.key === 'ArrowUp') first()
      else if (e.key === 'ArrowDown') last()
      else if (e.key === 'f') setOrientation((o) => (o === 'white' ? 'black' : 'white'))
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [detail.data, first, prev, next, last])

  // Keep the active move visible as we step through the game.
  useEffect(() => {
    const el = moveListRef.current?.querySelector('.fg-move.is-current')
    el?.scrollIntoView({ block: 'nearest' })
  }, [cursor, review])

  const runReview = useCallback(() => {
    const api = window.api?.review
    if (!api || !detail.data) {
      setReviewError('Analysis is unavailable.')
      return
    }
    const pgn = detailToPgn(detail.data)
    const seq = ++reviewSeq.current
    setReviewRunning(true)
    setReviewProgress(0)
    setReviewError(null)
    api
      .run({ pgn })
      .then(({ review: r }) => {
        if (reviewSeq.current !== seq) return // superseded
        setReview(r)
        setReviewRunning(false)
        setReviewProgress(1)
      })
      .catch(() => {
        if (reviewSeq.current !== seq) return
        setReviewRunning(false)
        setReviewError('Analysis failed. Please try again.')
      })
  }, [detail.data])

  const sections = useMemo(() => groupGames(list.data ?? []), [list.data])

  return (
    <div className="famous-view">
      <aside className="famous-library">
        <div className="panel famous-library-panel">
          <div className="panel-head">
            <span className="panel-title">Famous games</span>
            {list.status === 'ready' && (
              <span className="muted small num">{list.data?.length ?? 0}</span>
            )}
          </div>

          <div className="famous-list">
            {list.status === 'loading' && <ListSkeleton />}

            {list.status === 'error' && (
              <div className="famous-empty">Could not load the games library.</div>
            )}

            {list.status === 'ready' && (list.data?.length ?? 0) === 0 && (
              <div className="famous-empty">No famous games are available yet.</div>
            )}

            {list.status === 'ready' &&
              sections.map((section) => (
                <section className="famous-section" key={section.group}>
                  <header className="famous-section-head">
                    <span className="famous-section-label">{section.label}</span>
                    <span className="famous-section-blurb muted small">{section.blurb}</span>
                  </header>
                  <ul className="famous-cards">
                    {section.games.map((g) => (
                      <li key={g.id}>
                        <button
                          className={`card famous-card ${g.id === selectedId ? 'is-active' : ''}`}
                          onClick={() => setSelectedId(g.id)}
                        >
                          <div className="famous-card-top">
                            <span className="famous-card-players">
                              {g.white} <span className="famous-vs muted">vs</span> {g.black}
                            </span>
                            <span className={`fg-result-chip fg-result-${resultTone(g.result)}`}>
                              {g.result}
                            </span>
                          </div>
                          <div className="famous-card-meta muted small">
                            <span className="famous-card-event">{g.event}</span>
                            <span className="famous-card-dot">·</span>
                            <span className="num">{g.year}</span>
                            {g.eco && (
                              <>
                                <span className="famous-card-dot">·</span>
                                <span className="num">{g.eco}</span>
                              </>
                            )}
                          </div>
                          {g.significance && (
                            <div className="famous-card-sig small">{g.significance}</div>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
          </div>
        </div>
      </aside>

      <section className="famous-viewer">
        {!detail.data && detail.status !== 'loading' && (
          <div className="famous-placeholder">
            <span className="famous-placeholder-icon">
              <Library size={28} />
            </span>
            <p className="famous-placeholder-title">Select a game</p>
            <p className="muted small">
              {detail.status === 'error'
                ? 'That game could not be loaded.'
                : 'Pick a game from the library to replay it move by move.'}
            </p>
          </div>
        )}

        {detail.status === 'loading' && (
          <div className="famous-placeholder">
            <span className="famous-placeholder-icon">
              <Library size={28} />
            </span>
            <p className="muted small">Loading game…</p>
          </div>
        )}

        {detail.data && meta && (
          <div className="famous-stage">
            <div className="board-area">
              <header className="famous-header">
                <div className="famous-header-line">
                  <span className="famous-header-players">
                    {meta.white} <span className="famous-vs muted">vs</span> {meta.black}
                  </span>
                  <span className={`fg-result-chip fg-result-${resultTone(meta.result)}`}>
                    {resultLabel(meta.result)}
                  </span>
                </div>
                <div className="famous-header-meta muted small">
                  <span>{meta.event}</span>
                  <span className="famous-card-dot">·</span>
                  <span className="num">{meta.year}</span>
                  {meta.eco && (
                    <>
                      <span className="famous-card-dot">·</span>
                      <span className="num">{meta.eco}</span>
                    </>
                  )}
                </div>
              </header>

              <div className="board-stage">
                <div className={`board-wrap board-${settings.boardTheme} ${pieceSetClass(settings.pieceSet)}`}>
                  <Board
                    fen={fen}
                    orientation={orientation}
                    turnColor="white"
                    dests={new Map()}
                    lastMove={lastMove}
                    viewOnly
                    coordinates={settings.coordinates}
                    animation={settings.animation}
                  />
                </div>
              </div>

              <div className="board-controls">
                <button
                  className="icon-btn"
                  onClick={() => setOrientation((o) => (o === 'white' ? 'black' : 'white'))}
                  title="Flip board (f)"
                >
                  <FlipVertical2 size={18} />
                </button>
                <div className="nav-group">
                  <button className="icon-btn" onClick={first} disabled={!canPrev} title="First">
                    <ChevronsLeft size={18} />
                  </button>
                  <button className="icon-btn" onClick={prev} disabled={!canPrev} title="Previous (left arrow)">
                    <ChevronLeft size={18} />
                  </button>
                  <button className="icon-btn" onClick={next} disabled={!canNext} title="Next (right arrow)">
                    <ChevronRight size={18} />
                  </button>
                  <button className="icon-btn" onClick={last} disabled={!canNext} title="Last">
                    <ChevronsRight size={18} />
                  </button>
                </div>
                <span className="famous-ply muted small num">
                  {cursor} / {total}
                </span>
              </div>
            </div>

            <aside className="famous-sidebar">
              <div className="panel famous-review-panel">
                <div className="panel-head">
                  <span className="panel-title">Analysis</span>
                  {review && <span className="muted small num">depth {review.depth}</span>}
                </div>
                <div className="famous-review-body">
                  {!review && !reviewRunning && (
                    <>
                      <p className="muted small famous-review-intro">
                        Run the engine over every move for accuracy and per-move classifications.
                      </p>
                      <button className="btn famous-analyze" onClick={runReview}>
                        <Sparkles size={15} /> Analyze this game
                      </button>
                      {reviewError && <p className="famous-review-error small">{reviewError}</p>}
                    </>
                  )}

                  {reviewRunning && (
                    <div className="famous-progress">
                      <div className="famous-progress-head small">
                        <span>Analyzing…</span>
                        <span className="num">{Math.round(reviewProgress * 100)}%</span>
                      </div>
                      <div className="famous-bar">
                        <span
                          className="famous-bar-fill"
                          style={{ width: `${Math.round(reviewProgress * 100)}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {review && !reviewRunning && (
                    <>
                      <div className="famous-accuracy-grid">
                        <SideAccuracy label={meta.white} side={review.white} />
                        <SideAccuracy label={meta.black} side={review.black} />
                      </div>
                      <button className="btn ghost famous-rerun" onClick={runReview}>
                        Re-run analysis
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="panel famous-moves-panel">
                <div className="panel-head">
                  <span className="panel-title">Moves</span>
                  {total > 0 && <span className="muted small num">{total} ply</span>}
                </div>
                <div className="famous-moves" ref={moveListRef}>
                  {total === 0 ? (
                    <div className="famous-moves-empty muted small">No moves in this game.</div>
                  ) : (
                    moves.map((m) => {
                      const isWhite = m.ply % 2 === 1
                      const num = Math.ceil(m.ply / 2)
                      const badge = badges.get(m.ply)
                      return (
                        <span className="famous-move-slot" key={m.ply}>
                          {isWhite && <span className="move-num">{num}.</span>}
                          <button
                            className={`move fg-move ${m.ply === cursor ? 'is-current' : ''}`}
                            onClick={() => setCursor(m.ply)}
                          >
                            <span className="move-san num">{m.san}</span>
                            {badge && isNotableFamousBadge(badge) && (
                              <span
                                className={`fg-badge fg-tone-${famousBadgeTone(badge)}`}
                                title={badge}
                              >
                                {famousBadgeAbbr(badge)}
                              </span>
                            )}
                          </button>
                        </span>
                      )
                    })
                  )}
                </div>
              </div>
            </aside>
          </div>
        )}
      </section>
    </div>
  )
}

function SideAccuracy({ label, side }: { label: string; side: ReviewSideSummary }) {
  return (
    <div className="famous-side">
      <div className="famous-side-head small muted" title={label}>
        {label}
      </div>
      <div className="famous-side-acc num">{side.accuracy.toFixed(1)}%</div>
      <div className="famous-side-cap small muted">accuracy</div>
      <div className="famous-side-counts small num">
        <span className="fg-tone-inaccuracy" title="Inaccuracies">
          {side.inaccuracies} ?!
        </span>
        <span className="fg-tone-mistake" title="Mistakes">
          {side.mistakes} ?
        </span>
        <span className="fg-tone-blunder" title="Blunders">
          {side.blunders} ??
        </span>
      </div>
    </div>
  )
}

function ListSkeleton() {
  return (
    <div className="famous-skeleton" aria-hidden>
      {Array.from({ length: 4 }).map((_, i) => (
        <div className="famous-skel-card" key={i} />
      ))}
    </div>
  )
}
