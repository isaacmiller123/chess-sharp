import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Role } from 'chessops/types'
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  FlipVertical2,
  RotateCcw,
  Search,
  BookOpen,
  X
} from 'lucide-react'
import { Board } from '../../board/Board'
import { PromotionPicker } from '../../board/PromotionPicker'
import { pieceSetClass } from '../../board/pieceSets'
import { useSound } from '../../sound'
import { useSettings } from '../../state/settings'
import {
  INITIAL_FEN,
  applyMove,
  checkColor,
  destsFor,
  isPromotion,
  turnColor,
  uciToLastMove,
  type Color
} from '../../chess/chess'
import { OPENINGS, OPENING_GROUPS, resolveLine, type LineMove, type OpeningEntry } from './openings'
import type { OpeningInfo } from '../../../../shared/types'
import './openings.css'

const ALL_GROUPS = 'All'

/** Format a SAN line into numbered move pairs, e.g. "1. e4 e5 2. Nf3". */
function formatLine(line: string[]): string {
  const parts: string[] = []
  for (let i = 0; i < line.length; i += 2) {
    const num = i / 2 + 1
    const white = line[i]
    const black = line[i + 1]
    parts.push(black ? `${num}. ${white} ${black}` : `${num}. ${white}`)
  }
  return parts.join(' ')
}

export default function OpeningsView() {
  const { settings } = useSettings()
  const { playMove } = useSound()

  // Linear move history (each entry = a played ply). cursor is the number of
  // plies currently shown: 0 = starting position, history.length = end of line.
  const [history, setHistory] = useState<LineMove[]>([])
  const [cursor, setCursor] = useState(0)
  const [activeId, setActiveId] = useState<string | null>(null)

  const [orientation, setOrientation] = useState<Color>('white')
  const [pendingPromo, setPendingPromo] = useState<{ orig: string; dest: string } | null>(null)
  const [nonce, setNonce] = useState(0)

  const [query, setQuery] = useState('')
  const [group, setGroup] = useState<string>(ALL_GROUPS)
  const [opening, setOpening] = useState<OpeningInfo | null>(null)

  const fen = cursor === 0 ? INITIAL_FEN : history[cursor - 1].fen
  const dests = useMemo(() => destsFor(fen), [fen])
  const turn = turnColor(fen)
  const check = checkColor(fen)
  const lastMove = cursor > 0 ? uciToLastMove(history[cursor - 1].uci) : undefined

  const canPrev = cursor > 0
  const canNext = cursor < history.length

  // ---- Live opening lookup (debounced) ----
  useEffect(() => {
    const api = window.api?.openings
    if (!api) return
    let cancelled = false
    const t = setTimeout(() => {
      api
        .lookup(fen)
        .then((r) => {
          if (!cancelled) setOpening(r.opening)
        })
        .catch(() => {
          if (!cancelled) setOpening(null)
        })
    }, 120)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [fen])

  // ---- Board interaction ----
  const commit = useCallback(
    (orig: string, dest: string, promotion?: Role) => {
      const m = applyMove(fen, orig, dest, promotion)
      if (!m) {
        setNonce((n) => n + 1) // illegal: re-sync board to truth
        return
      }
      setHistory((prev) => [...prev.slice(0, cursor), m])
      setCursor((c) => c + 1)
      setActiveId(null) // diverged from any curated line
      playMove(m)
    },
    [fen, cursor, playMove]
  )

  const onMove = useCallback(
    (orig: string, dest: string) => {
      if (isPromotion(fen, orig, dest)) setPendingPromo({ orig, dest })
      else commit(orig, dest)
    },
    [fen, commit]
  )

  // ---- Navigation ----
  const first = useCallback(() => setCursor(0), [])
  const prev = useCallback(() => setCursor((c) => Math.max(0, c - 1)), [])
  const next = useCallback(() => setCursor((c) => Math.min(history.length, c + 1)), [history.length])
  const last = useCallback(() => setCursor(history.length), [history.length])

  const reset = useCallback(() => {
    setHistory([])
    setCursor(0)
    setActiveId(null)
    setNonce((n) => n + 1)
  }, [])

  const playOpening = useCallback((entry: OpeningEntry) => {
    const moves = resolveLine(entry.line)
    setHistory(moves)
    setCursor(moves.length)
    setActiveId(entry.id)
  }, [])

  // ---- Keyboard nav (skip while typing in the search box) ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      if (e.key === 'ArrowLeft') prev()
      else if (e.key === 'ArrowRight') next()
      else if (e.key === 'ArrowUp') first()
      else if (e.key === 'ArrowDown') last()
      else if (e.key === 'f') setOrientation((o) => (o === 'white' ? 'black' : 'white'))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [first, prev, next, last])

  // ---- Filtered opening list ----
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return OPENINGS.filter((o) => {
      if (group !== ALL_GROUPS && o.group !== group) return false
      if (!q) return true
      return (
        o.name.toLowerCase().includes(q) ||
        o.eco.toLowerCase().includes(q) ||
        o.group.toLowerCase().includes(q) ||
        o.line.join(' ').toLowerCase().includes(q)
      )
    })
  }, [query, group])

  // Jump a clicked move in the line preview to the right cursor.
  const moveListRef = useRef<HTMLDivElement>(null)

  const liveName = opening?.name ?? null
  const liveEco = opening?.eco ?? null

  return (
    <div className="openings-view">
      <div className="board-area">
        <div className="board-stage">
          <div className={`board-wrap board-${settings.boardTheme} ${pieceSetClass(settings.pieceSet)}`}>
            <Board
              fen={fen}
              orientation={orientation}
              turnColor={turn}
              dests={dests}
              lastMove={lastMove}
              check={check}
              showDests={settings.showLegal}
              coordinates={settings.coordinates}
              animation={settings.animation}
              onMove={onMove}
              syncNonce={nonce}
            />
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
          <button className="icon-btn" onClick={reset} disabled={history.length === 0} title="Reset to start">
            <RotateCcw size={18} />
          </button>
        </div>

        <div className="opening-banner">
          <span className="opening-banner-icon">
            <BookOpen size={18} />
          </span>
          <div className="opening-banner-text">
            {liveName ? (
              <>
                <span className="opening-banner-name">{liveName}</span>
                {liveEco && <span className="eval-chip opening-eco">{liveEco}</span>}
              </>
            ) : (
              <span className="opening-banner-name muted">
                {cursor === 0 ? 'Play a move or pick an opening' : 'Out of book'}
              </span>
            )}
          </div>
        </div>
      </div>

      <aside className="openings-sidebar">
        <div className="panel openings-explorer">
          <div className="panel-head">
            <span className="panel-title">Openings</span>
            <span className="muted small">{filtered.length}</span>
          </div>

          <div className="explorer-search">
            <Search size={15} className="explorer-search-icon" />
            <input
              className="explorer-search-input"
              type="text"
              placeholder="Search name, ECO, or moves…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button className="explorer-search-clear" onClick={() => setQuery('')} title="Clear search">
                <X size={14} />
              </button>
            )}
          </div>

          <div className="explorer-groups">
            <button
              className={`seg ${group === ALL_GROUPS ? 'on' : ''}`}
              onClick={() => setGroup(ALL_GROUPS)}
            >
              {ALL_GROUPS}
            </button>
            {OPENING_GROUPS.map((g) => (
              <button key={g} className={`seg ${group === g ? 'on' : ''}`} onClick={() => setGroup(g)}>
                {g}
              </button>
            ))}
          </div>

          <ul className="explorer-list">
            {filtered.length === 0 && <li className="explorer-empty">No openings match your search.</li>}
            {filtered.map((o) => (
              <li key={o.id}>
                <button
                  className={`explorer-item ${activeId === o.id ? 'is-active' : ''}`}
                  onClick={() => playOpening(o)}
                  title={formatLine(o.line)}
                >
                  <span className="explorer-item-main">
                    <span className="explorer-item-name">{o.name}</span>
                    <span className="explorer-item-line">{formatLine(o.line)}</span>
                  </span>
                  <span className="eval-chip explorer-item-eco">{o.eco}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">Line</span>
            {history.length > 0 && <span className="muted small">{history.length} ply</span>}
          </div>
          <div className="opening-moves" ref={moveListRef}>
            {history.length === 0 ? (
              <div className="opening-moves-empty">No moves yet.</div>
            ) : (
              history.map((m, i) => {
                const ply = i + 1
                const isWhite = i % 2 === 0
                return (
                  <span key={i} className="opening-move-slot">
                    {isWhite && <span className="move-num">{Math.floor(i / 2) + 1}.</span>}
                    <button
                      className={`move opening-move ${ply === cursor ? 'is-current' : ''}`}
                      onClick={() => setCursor(ply)}
                    >
                      <span className="move-san">{m.san}</span>
                    </button>
                  </span>
                )
              })
            )}
          </div>
        </div>
      </aside>
    </div>
  )
}
