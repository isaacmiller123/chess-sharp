import { useCallback, useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import type {
  CoachEngineEval,
  CoachExplainMoveResult,
  CoachPositionalResult,
  EngineBestmove,
  EngineLine
} from '@shared/types'

/**
 * On-demand local coaching for a single position. Self-contained and guarded:
 * every `window.api` access is optional-chained, and the component degrades to a
 * clear "unavailable" state when the desktop bridge is missing (preview/web).
 *
 * Two actions:
 *  - "Explain this position" -> coach.positional({ fen }) -> { terms, text }.
 *  - "Was that move good?"    -> a best-effort engine read of the position before
 *    the move (and after it) feeds coach.explainMove -> { verdict, motifs, text }.
 *    Only offered when `lastMove` is supplied.
 *
 * Styling: namespaced .coachhint-* classes (defined in play.css / puzzles.css);
 * no shared CSS or other-feature CSS is relied upon.
 */

export interface CoachHintLastMove {
  /** FEN of the position BEFORE the move was played. */
  fenBefore: string
  /** The move that was played, in UCI (e.g. "e2e4", "e7e8q"). */
  played: string
  /** Optional pre-computed engine read of the position before the move. */
  evalBefore?: CoachEngineEval
  /** Optional pre-computed engine read of the position after the move. */
  evalAfter?: CoachEngineEval
  /** Optional engine best reply (UCI) from `fenBefore`, if the view already has it. */
  best?: string
  /** Optional principal variation (UCI) from `fenBefore`, if the view already has it. */
  pv?: string[]
  /** Optional half-move number, forwarded to the coach for phrasing. */
  ply?: number
}

export interface CoachHintProps {
  /** Current position to explain (FEN). Required for "Explain this position". */
  fen: string
  /**
   * The move that led to (or is being judged at) the current position. When
   * present, the "Was that move good?" action is enabled. Omit to offer only
   * positional guidance (e.g. for an unsolved puzzle, to avoid spoilers).
   */
  lastMove?: CoachHintLastMove
  /** Engine depth for the best-effort move read. Kept shallow to stay snappy. */
  analyzeDepth?: number
  /** Optional extra class on the root, for layout in the host panel. */
  className?: string
}

type PositionalState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; result: CoachPositionalResult }
  | { kind: 'error' }

type MoveState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; result: CoachExplainMoveResult }
  | { kind: 'error' }

const DEFAULT_DEPTH = 12

function hasCoach(): boolean {
  return typeof window !== 'undefined' && !!window.api?.coach
}

function hasEngine(): boolean {
  return typeof window !== 'undefined' && !!window.api?.engine
}

interface EngineRead {
  evalAtTurn: CoachEngineEval
  best: string
  pv: string[]
}

/**
 * Best-effort one-shot engine read of `fen`: resolves with the top line's eval
 * (from the side-to-move POV), the best move and PV, or null if unavailable /
 * timed out. Always tears down its listeners and stops the handle.
 */
function readPosition(fen: string, depth: number, timeoutMs = 4000): Promise<EngineRead | null> {
  const engine = window.api?.engine
  if (!engine) return Promise.resolve(null)

  return new Promise<EngineRead | null>((resolve) => {
    let handleId: number | null = null
    let settled = false
    let bestEval: CoachEngineEval = { cp: null, mate: null }
    let bestPv: string[] = []

    let offLine: (() => void) | undefined
    let offBest: (() => void) | undefined
    let timer: ReturnType<typeof setTimeout> | undefined

    const cleanup = (): void => {
      if (timer) clearTimeout(timer)
      offLine?.()
      offBest?.()
      if (handleId !== null) void engine.stop(handleId)
    }

    const finish = (value: EngineRead | null): void => {
      if (settled) return
      settled = true
      cleanup()
      resolve(value)
    }

    offLine = engine.onLine((l: EngineLine) => {
      if (handleId === null || l.handleId !== handleId) return
      // Track the principal variation (multipv 1, or unset).
      if ((l.multipv ?? 1) === 1 && l.pv && l.pv.length > 0) {
        bestPv = l.pv
        bestEval = { cp: l.scoreCp ?? null, mate: l.mate ?? null }
      }
    })

    offBest = engine.onBestmove((bm: EngineBestmove) => {
      if (handleId === null || bm.handleId !== handleId) return
      const best = bm.bestmove || bestPv[0] || ''
      if (!best) {
        finish(null)
        return
      }
      finish({ evalAtTurn: bestEval, best, pv: bestPv.length > 0 ? bestPv : [best] })
    })

    timer = setTimeout(() => finish(null), timeoutMs)

    engine
      .analyze({ fen, multipv: 1, limit: { kind: 'depth', value: depth } })
      .then(({ handleId: id }) => {
        if (settled) {
          void engine.stop(id)
          return
        }
        handleId = id
      })
      .catch(() => finish(null))
  })
}

/** Flip an eval to the opposite side's POV (cp negates; mate count negates). */
function flipEval(e: CoachEngineEval): CoachEngineEval {
  return {
    cp: typeof e.cp === 'number' ? -e.cp : e.cp ?? null,
    mate: typeof e.mate === 'number' ? -e.mate : e.mate ?? null
  }
}

export function CoachHint({
  fen,
  lastMove,
  analyzeDepth = DEFAULT_DEPTH,
  className
}: CoachHintProps): JSX.Element {
  const [positional, setPositional] = useState<PositionalState>({ kind: 'idle' })
  const [move, setMove] = useState<MoveState>({ kind: 'idle' })

  // Cancellation guards so stale async results don't clobber a newer position.
  const posTokenRef = useRef(0)
  const moveTokenRef = useRef(0)

  // Reset both readouts whenever the subject position (or judged move) changes.
  useEffect(() => {
    posTokenRef.current += 1
    moveTokenRef.current += 1
    setPositional({ kind: 'idle' })
    setMove({ kind: 'idle' })
  }, [fen, lastMove?.fenBefore, lastMove?.played])

  const available = hasCoach()

  const explainPosition = useCallback(() => {
    const coach = window.api?.coach
    if (!coach) {
      setPositional({ kind: 'error' })
      return
    }
    const token = ++posTokenRef.current
    setPositional({ kind: 'loading' })
    coach
      .positional({ fen })
      .then((result) => {
        if (posTokenRef.current !== token) return
        setPositional(result ? { kind: 'ready', result } : { kind: 'error' })
      })
      .catch(() => {
        if (posTokenRef.current === token) setPositional({ kind: 'error' })
      })
  }, [fen])

  const judgeMove = useCallback(() => {
    const coach = window.api?.coach
    if (!coach || !lastMove) {
      setMove({ kind: 'error' })
      return
    }
    const token = ++moveTokenRef.current
    setMove({ kind: 'loading' })

    void (async () => {
      try {
        // Start from any evals/PV the host already has; fill gaps via a shallow
        // best-effort engine read. If the engine is missing we still call the
        // coach with whatever we have (the coach is robust to sparse evals).
        let best = lastMove.best ?? ''
        let pv = lastMove.pv ?? []
        let evalBefore = lastMove.evalBefore ?? { cp: null, mate: null }
        let evalAfter = lastMove.evalAfter ?? { cp: null, mate: null }

        const needBefore =
          !best || pv.length === 0 || (lastMove.evalBefore === undefined && hasEngine())
        if (needBefore) {
          const before = await readPosition(lastMove.fenBefore, analyzeDepth)
          if (moveTokenRef.current !== token) return
          if (before) {
            if (!best) best = before.best
            if (pv.length === 0) pv = before.pv
            if (lastMove.evalBefore === undefined) evalBefore = before.evalAtTurn
          }
        }

        if (lastMove.evalAfter === undefined && hasEngine()) {
          // The current `fen` is the position AFTER the played move. Its eval is
          // from the opponent's POV; flip it back to the mover's POV so the
          // before/after comparison is consistent.
          const after = await readPosition(fen, analyzeDepth)
          if (moveTokenRef.current !== token) return
          if (after) evalAfter = flipEval(after.evalAtTurn)
        }

        const result = await coach.explainMove({
          fenBefore: lastMove.fenBefore,
          played: lastMove.played,
          best: best || lastMove.played,
          pv: pv.length > 0 ? pv : [lastMove.played],
          evalBefore,
          evalAfter,
          ply: lastMove.ply
        })
        if (moveTokenRef.current !== token) return
        setMove(result ? { kind: 'ready', result } : { kind: 'error' })
      } catch {
        if (moveTokenRef.current === token) setMove({ kind: 'error' })
      }
    })()
  }, [fen, lastMove, analyzeDepth])

  const rootClass = className ? `coachhint ${className}` : 'coachhint'

  if (!available) {
    return (
      <div className={rootClass}>
        <p className="muted small coachhint-empty">
          Coaching is available in the desktop app.
        </p>
      </div>
    )
  }

  const posBusy = positional.kind === 'loading'
  const moveBusy = move.kind === 'loading'

  return (
    <div className={rootClass}>
      <div className="coachhint-actions">
        <button
          type="button"
          className="btn ghost coachhint-btn"
          onClick={explainPosition}
          disabled={posBusy}
        >
          {posBusy ? 'Thinking…' : 'Explain this position'}
        </button>
        {lastMove && (
          <button
            type="button"
            className="btn ghost coachhint-btn"
            onClick={judgeMove}
            disabled={moveBusy}
          >
            {moveBusy ? 'Thinking…' : 'Was that move good?'}
          </button>
        )}
      </div>

      {positional.kind === 'ready' && (
        <div className="coachhint-result">
          <p className="coachhint-text">{positional.result.text}</p>
          {positional.result.terms.length > 0 && (
            <div className="coachhint-tags">
              {positional.result.terms.map((t) => (
                <span key={t} className="coachhint-tag">
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
      {positional.kind === 'error' && (
        <p className="muted small coachhint-empty">Could not load coaching for this position.</p>
      )}

      {move.kind === 'ready' && (
        <div className="coachhint-result">
          {move.result.verdict && (
            <span className="coachhint-verdict">{move.result.verdict}</span>
          )}
          <p className="coachhint-text">{move.result.text}</p>
          {move.result.motifs.length > 0 && (
            <div className="coachhint-tags">
              {move.result.motifs.map((m) => (
                <span key={m} className="coachhint-tag">
                  {m}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
      {move.kind === 'error' && (
        <p className="muted small coachhint-empty">Could not read that move right now.</p>
      )}

      {positional.kind === 'idle' && move.kind === 'idle' && (
        <p className="muted small coachhint-empty">
          {lastMove
            ? 'Get a plan for this position, or a read on the last move.'
            : 'Get conceptual guidance for this position.'}
        </p>
      )}
    </div>
  )
}

export default CoachHint
