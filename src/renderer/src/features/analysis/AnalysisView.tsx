import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Role } from 'chessops/types'
import type { Key } from 'chessground/types'
import type { DrawShape } from 'chessground/draw'
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  FlipVertical2,
  Cpu,
  Type as TypeIcon,
  ClipboardCopy,
  BookOpen
} from 'lucide-react'
import type {
  GameReview,
  MoveBadge,
  OpeningInfo,
  ReviewMoveEval,
  ReviewProgress
} from '@shared/types'
import { Board } from '../../board/Board'
import { EvalBar } from '../../board/EvalBar'
import { PromotionPicker } from '../../board/PromotionPicker'
import { pieceSetClass } from '../../board/pieceSets'
import { useSound } from '../../sound'
import { EnginePanel } from '../../panels/EnginePanel'
import { MoveList } from '../../panels/MoveList'
import { CoachPanel } from '../../panels/CoachPanel'
import { ReviewPanel } from './ReviewPanel'
import { SharePanel } from './SharePanel'
import { AnnotationsLayer } from './AnnotationsLayer'
import { useAnnotations } from './annotations'
import type { LoadedGame } from './shareGame'
import { useGameTree } from '../../state/gameTree'
import { useSettings } from '../../state/settings'
import { useAnalysis } from '../../hooks/useAnalysis'
import { treeToPgn } from '../../state/pgn'
import {
  applyMove,
  checkColor,
  destsFor,
  isPromotion,
  position,
  turnColor,
  uciToLastMove,
  type AppliedMove,
  type Color
} from '../../chess/chess'
import { toWhite } from '../../chess/scores'
import './analysis.css'

const ROLE_FROM_CHAR: Record<string, Role> = { q: 'queen', r: 'rook', b: 'bishop', n: 'knight' }

export function AnalysisView() {
  const { settings } = useSettings()
  const { playMove } = useSound()
  const tree = useGameTree()
  const [orientation, setOrientation] = useState<Color>('white')
  const [engineOn, setEngineOn] = useState(true)
  const [multipv, setMultipv] = useState(settings.analysisMultiPV)
  const [figurine, setFigurine] = useState(false)
  const [pendingPromo, setPendingPromo] = useState<{ orig: string; dest: string } | null>(null)
  const [nonce, setNonce] = useState(0)
  const [fenInput, setFenInput] = useState('')

  // Board element (for the annotations overlay to attach right-click drawing).
  const [boardEl, setBoardEl] = useState<HTMLDivElement | null>(null)

  // Per-node user annotations (right-click arrows/circles); persist while
  // navigating the line because they are keyed by the current node id.
  const annotations = useAnnotations(tree.current.id)

  // Queue used to load a pasted game's mainline into the tree across renders
  // (gameTree.addMove advances from the rendered current node, so moves must be
  // applied one render-tick at a time).
  const loadQueue = useRef<{ moves: AppliedMove[]; index: number; expectFen: string } | null>(null)

  // ---- Review state ----
  const [review, setReview] = useState<GameReview | null>(null)
  const [reviewRunning, setReviewRunning] = useState(false)
  const [reviewProgress, setReviewProgress] = useState(0)
  const [reviewError, setReviewError] = useState<string | null>(null)
  const reviewSeq = useRef(0)

  // ---- Opening lookup ----
  const [opening, setOpening] = useState<OpeningInfo | null>(null)

  const fen = tree.currentFen
  const dests = useMemo(() => destsFor(fen), [fen])
  const turn = turnColor(fen)
  const check = checkColor(fen)
  const lastMove = tree.current.move ? uciToLastMove(tree.current.move.uci) : undefined
  const currentPly = tree.current.ply

  const { lines, depth } = useAnalysis(fen, engineOn, multipv)
  const best = lines.find((l) => l.multipv === 1) ?? lines[0]
  const score = best ? toWhite({ cp: best.scoreCp, mate: best.mate }, turn) : { cp: 0 }

  // Engine top-line arrows on the board: best move is a solid green arrow, the
  // 2nd/3rd lines are progressively fainter. Re-derived as the engine streams.
  const engineShapes = useMemo<DrawShape[]>(() => {
    if (!engineOn) return []
    const brushByRank = ['green', 'paleBlue', 'paleGrey'] as const
    const out: DrawShape[] = []
    for (const l of lines) {
      const uci = l.pv?.[0]
      if (!uci || uci.length < 4) continue
      const rank = (l.multipv ?? 1) - 1
      out.push({
        orig: uci.slice(0, 2) as Key,
        dest: uci.slice(2, 4) as Key,
        brush: brushByRank[Math.min(rank, brushByRank.length - 1)]
      })
    }
    return out
  }, [lines, engineOn])

  // Per-ply badge map for the move list (only meaningful once a review exists).
  const badges = useMemo(() => {
    const map = new Map<number, MoveBadge>()
    if (review) for (const m of review.moveEvals) map.set(m.ply, m.badge)
    return map
  }, [review])

  // Review eval for the move that produced the current position (null at root).
  const currentMoveEval: ReviewMoveEval | null = useMemo(() => {
    if (!review) return null
    return review.moveEvals.find((m) => m.ply === currentPly) ?? null
  }, [review, currentPly])

  const commit = useCallback(
    (orig: string, dest: string, promotion?: Role) => {
      const m = applyMove(fen, orig, dest, promotion)
      if (m) {
        tree.addMove(m)
        playMove(m)
      } else setNonce((n) => n + 1) // illegal: re-sync board to truth
    },
    [fen, tree, playMove]
  )

  const onMove = useCallback(
    (orig: string, dest: string) => {
      if (isPromotion(fen, orig, dest)) setPendingPromo({ orig, dest })
      else commit(orig, dest)
    },
    [fen, commit]
  )

  const playUci = useCallback(
    (uci: string) => {
      const promo = uci.length > 4 ? ROLE_FROM_CHAR[uci[4]] : undefined
      commit(uci.slice(0, 2), uci.slice(2, 4), promo)
    },
    [commit]
  )

  // Jump the board to the position AFTER the move at `ply` (from the mainline).
  const seekToPly = useCallback(
    (ply: number) => {
      let n = tree.root
      while (n.children[0] && n.ply < ply) n = n.children[0]
      tree.goTo(n.id)
    },
    [tree]
  )

  // ---- Opening: live lookup as you navigate the mainline ----
  useEffect(() => {
    const openings = window.api?.openings
    if (!openings) return
    let cancelled = false
    openings
      .lookup(fen)
      .then(({ opening: o }) => {
        if (!cancelled) setOpening(o)
      })
      .catch(() => {
        if (!cancelled) setOpening(null)
      })
    return () => {
      cancelled = true
    }
  }, [fen])

  // ---- Review progress subscription (mounts once) ----
  useEffect(() => {
    const reviewApi = window.api?.review
    if (!reviewApi) return
    return reviewApi.onProgress((p: ReviewProgress) => {
      setReviewProgress(p.total > 0 ? Math.min(1, p.ply / p.total) : 0)
    })
  }, [])

  const runReview = useCallback(() => {
    const reviewApi = window.api?.review
    if (!reviewApi) {
      setReviewError('Review is unavailable.')
      return
    }
    const pgn = treeToPgn(tree.root, {})
    const seq = ++reviewSeq.current
    setReviewRunning(true)
    setReviewProgress(0)
    setReviewError(null)
    reviewApi
      .run({ pgn })
      .then(({ review: r }) => {
        if (reviewSeq.current !== seq) return // a newer review superseded this one
        setReview(r)
        setReviewRunning(false)
        setReviewProgress(1)
      })
      .catch(() => {
        if (reviewSeq.current !== seq) return
        setReviewRunning(false)
        setReviewError('Review failed. Please try again.')
      })
  }, [tree.root])

  // Keyboard navigation (lichess-style).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'ArrowLeft') tree.prev()
      else if (e.key === 'ArrowRight') tree.next()
      else if (e.key === 'ArrowUp') tree.first()
      else if (e.key === 'ArrowDown') tree.last()
      else if (e.key === 'f') setOrientation((o) => (o === 'white' ? 'black' : 'white'))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tree])

  const loadFen = () => {
    const v = fenInput.trim()
    if (!v) return
    try {
      position(v) // throws if invalid
      tree.reset(v)
      setReview(null) // a new position invalidates the prior review
      setReviewError(null)
      setFenInput('')
    } catch {
      setFenInput(v) // keep; could surface an inline error later
    }
  }

  // ---- Load a pasted game into the tree (mainline) ----
  const loadGame = useCallback(
    (game: LoadedGame) => {
      tree.reset(game.startFen)
      setReview(null)
      setReviewError(null)
      // Defer move application to the queue effect: addMove must run one move
      // per render so each call sees the freshly-selected current node.
      loadQueue.current =
        game.moves.length > 0 ? { moves: game.moves, index: 0, expectFen: game.startFen } : null
    },
    [tree]
  )

  // Drives the load queue: applies the next move once the board has settled on
  // the previously-added position. Self-terminates when the line is exhausted.
  useEffect(() => {
    const q = loadQueue.current
    if (!q) return
    if (tree.currentFen !== q.expectFen) return // wait for the prior addMove to land
    const m = q.moves[q.index]
    if (!m) {
      loadQueue.current = null
      return
    }
    q.index += 1
    q.expectFen = m.fen
    if (q.index >= q.moves.length) loadQueue.current = null
    tree.addMove(m)
  }, [tree])

  const hasMoves = tree.root.children.length > 0
  const currentPgn = useMemo(() => treeToPgn(tree.root, {}), [tree.root, tree.current.id])

  return (
    <div className="analysis-view">
      <div className="board-area">
        {opening && (
          <div className="opening-strip" title={`${opening.name} (${opening.eco})`}>
            <BookOpen size={14} className="opening-icon" />
            <span className="opening-name">{opening.name}</span>
            <span className="opening-eco num">{opening.eco}</span>
          </div>
        )}
        <div className="board-stage">
          <EvalBar score={score} orientation={orientation} />
          <div
            ref={setBoardEl}
            className={`board-wrap board-${settings.boardTheme} ${pieceSetClass(settings.pieceSet)}`}
          >
            <Board
              fen={fen}
              orientation={orientation}
              turnColor={turn}
              dests={dests}
              lastMove={lastMove}
              check={check}
              shapes={engineShapes}
              showDests={settings.showLegal}
              coordinates={settings.coordinates}
              animation={settings.animation}
              onMove={onMove}
              syncNonce={nonce}
            />
            <AnnotationsLayer boardEl={boardEl} orientation={orientation} store={annotations} />
            {pendingPromo && (
              <PromotionPicker
                color={turn}
                onSelect={(role) => {
                  commit(pendingPromo.orig, pendingPromo.dest, role)
                  setPendingPromo(null)
                }}
                onCancel={() => {
                  setPendingPromo(null)
                  setNonce((n) => n + 1)
                }}
              />
            )}
          </div>
        </div>
        <div className="board-controls">
          <button className="icon-btn" onClick={() => setOrientation((o) => (o === 'white' ? 'black' : 'white'))} title="Flip board (f)">
            <FlipVertical2 size={18} />
          </button>
          <div className="nav-group">
            <button className="icon-btn" onClick={tree.first} disabled={!tree.canPrev} title="First">
              <ChevronsLeft size={18} />
            </button>
            <button className="icon-btn" onClick={tree.prev} disabled={!tree.canPrev} title="Previous (←)">
              <ChevronLeft size={18} />
            </button>
            <button className="icon-btn" onClick={tree.next} disabled={!tree.canNext} title="Next (→)">
              <ChevronRight size={18} />
            </button>
            <button className="icon-btn" onClick={tree.last} disabled={!tree.canNext} title="Last">
              <ChevronsRight size={18} />
            </button>
          </div>
          <button className={`icon-btn ${figurine ? 'active' : ''}`} onClick={() => setFigurine((f) => !f)} title="Figurine / letters">
            <TypeIcon size={18} />
          </button>
          <button className={`icon-btn ${engineOn ? 'active' : ''}`} onClick={() => setEngineOn((v) => !v)} title="Toggle engine">
            <Cpu size={18} />
          </button>
        </div>
      </div>

      <aside className="analysis-sidebar">
        <EnginePanel
          fen={fen}
          lines={lines}
          depth={depth}
          enabled={engineOn}
          multipv={multipv}
          figurineMode={figurine}
          onToggle={() => setEngineOn((v) => !v)}
          onMultipv={setMultipv}
          onPlayUci={playUci}
        />

        <ReviewPanel
          review={review}
          running={reviewRunning}
          progress={reviewProgress}
          canReview={hasMoves}
          error={reviewError}
          currentPly={currentPly}
          onRun={runReview}
          onSeek={seekToPly}
        />

        {review && <CoachPanel moveEval={currentMoveEval} figurineMode={figurine} />}

        <div className="panel move-panel">
          <div className="panel-head">
            <span className="panel-title">Moves</span>
          </div>
          <MoveList
            root={tree.root}
            currentId={tree.current.id}
            figurineMode={figurine}
            onSelect={tree.goTo}
            badges={review ? badges : undefined}
          />
        </div>
        <div className="panel fen-panel">
          <div className="fen-row">
            <input
              className="fen-input num"
              placeholder="Paste FEN to load a position…"
              value={fenInput}
              onChange={(e) => setFenInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && loadFen()}
            />
            <button className="btn" onClick={loadFen}>
              Load
            </button>
          </div>
          <button className="btn ghost copy-fen" onClick={() => navigator.clipboard?.writeText(fen)}>
            <ClipboardCopy size={14} /> Copy current FEN
          </button>
        </div>

        <SharePanel
          pgn={currentPgn}
          fen={fen}
          canClearAnnotations={annotations.hasAny}
          onClearAnnotations={annotations.clear}
          onLoadGame={loadGame}
        />
      </aside>
    </div>
  )
}
