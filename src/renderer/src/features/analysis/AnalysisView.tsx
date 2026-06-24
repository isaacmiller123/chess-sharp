import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Role } from 'chessops/types'
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  FlipVertical2,
  Cpu,
  Type as TypeIcon,
  ClipboardCopy
} from 'lucide-react'
import { Board } from '../../board/Board'
import { EvalBar } from '../../board/EvalBar'
import { PromotionPicker } from '../../board/PromotionPicker'
import { EnginePanel } from '../../panels/EnginePanel'
import { MoveList } from '../../panels/MoveList'
import { useGameTree } from '../../state/gameTree'
import { useSettings } from '../../state/settings'
import { useAnalysis } from '../../hooks/useAnalysis'
import {
  applyMove,
  checkColor,
  destsFor,
  isPromotion,
  position,
  turnColor,
  uciToLastMove,
  type Color
} from '../../chess/chess'
import { toWhite } from '../../chess/scores'

const ROLE_FROM_CHAR: Record<string, Role> = { q: 'queen', r: 'rook', b: 'bishop', n: 'knight' }

export function AnalysisView() {
  const { settings } = useSettings()
  const tree = useGameTree()
  const [orientation, setOrientation] = useState<Color>('white')
  const [engineOn, setEngineOn] = useState(true)
  const [multipv, setMultipv] = useState(3)
  const [figurine, setFigurine] = useState(false)
  const [pendingPromo, setPendingPromo] = useState<{ orig: string; dest: string } | null>(null)
  const [nonce, setNonce] = useState(0)
  const [fenInput, setFenInput] = useState('')

  const fen = tree.currentFen
  const dests = useMemo(() => destsFor(fen), [fen])
  const turn = turnColor(fen)
  const check = checkColor(fen)
  const lastMove = tree.current.move ? uciToLastMove(tree.current.move.uci) : undefined

  const { lines, depth } = useAnalysis(fen, engineOn, multipv)
  const best = lines.find((l) => l.multipv === 1) ?? lines[0]
  const score = best ? toWhite({ cp: best.scoreCp, mate: best.mate }, turn) : { cp: 0 }

  const commit = useCallback(
    (orig: string, dest: string, promotion?: Role) => {
      const m = applyMove(fen, orig, dest, promotion)
      if (m) tree.addMove(m)
      else setNonce((n) => n + 1) // illegal: re-sync board to truth
    },
    [fen, tree]
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

  // Keyboard navigation (lichess-style).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
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
      setFenInput('')
    } catch {
      setFenInput(v) // keep; could surface an inline error later
    }
  }

  return (
    <div className="analysis-view">
      <div className="board-area">
        <div className="board-stage">
          <EvalBar score={score} orientation={orientation} />
          <div className={`board-wrap board-${settings.boardTheme}`}>
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
        <div className="panel move-panel">
          <div className="panel-head">
            <span className="panel-title">Moves</span>
          </div>
          <MoveList root={tree.root} currentId={tree.current.id} figurineMode={figurine} onSelect={tree.goTo} />
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
          <button className="btn ghost copy-fen" onClick={() => navigator.clipboard.writeText(fen)}>
            <ClipboardCopy size={14} /> Copy current FEN
          </button>
        </div>
      </aside>
    </div>
  )
}
