import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Role } from 'chessops/types'
import type { Key } from 'chessground/types'
import type { CurriculumLesson, Puzzle } from '../../../../shared/types'
import {
  applyMove,
  checkColor,
  destsFor,
  turnColor,
  uciToLastMove,
  INITIAL_FEN,
  type Color
} from '../../chess/chess'

const ROLE_FROM_CHAR: Record<string, Role> = { q: 'queen', r: 'rook', b: 'bishop', n: 'knight' }

const EXCLUDE_CAP = 60
const LEADIN_MS = 360
const AUTO_REPLY_MS = 340

export type DrillPhase = 'idle' | 'loading' | 'leadin' | 'solving' | 'solved' | 'failed' | 'empty' | 'error'

export interface DrillStats {
  /** Puzzles solved on the first attempt. */
  solved: number
  /** Puzzles where the wrong move was played. */
  failed: number
  /** Total puzzles seen (solved + failed + skipped). */
  seen: number
}

export interface LessonDrill {
  apiReady: boolean
  phase: DrillPhase
  puzzle: Puzzle | null
  // Board state
  fen: string
  orientation: Color
  turn: Color
  check: Color | undefined
  dests: Map<Key, Key[]>
  lastMove: [Key, Key] | undefined
  nonce: number
  // Feedback
  correctSan: string | null
  // Tally
  stats: DrillStats
  // Actions
  start: () => void
  onUserMove: (orig: Key, dest: Key) => void
  next: () => void
  skip: () => void
  retry: () => void
}

function promoRole(uci: string): Role | undefined {
  return uci.length > 4 ? ROLE_FROM_CHAR[uci[4]] : undefined
}

/**
 * In-lesson puzzle drill. Pulls puzzles whose theme is one of the lesson's
 * linkedThemes within its ratingRange and validates the user's solution exactly
 * like the puzzle trainer (position after moves[0]; solution from moves[1]),
 * recording each attempt via window.api.puzzles.attempt. Self-contained: holds
 * its own board + tally state and never touches the lesson's reading view.
 */
export function useLessonDrill(lesson: CurriculumLesson): LessonDrill {
  const apiReady = typeof window !== 'undefined' && !!window.api?.puzzles

  const [phase, setPhase] = useState<DrillPhase>('idle')
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null)
  const [fen, setFen] = useState<string>(INITIAL_FEN)
  const [orientation, setOrientation] = useState<Color>('white')
  const [lastMove, setLastMove] = useState<[Key, Key] | undefined>(undefined)
  const [nonce, setNonce] = useState(0)
  const [correctSan, setCorrectSan] = useState<string | null>(null)
  const [stats, setStats] = useState<DrillStats>({ solved: 0, failed: 0, seen: 0 })

  // solutionIdx points at the NEXT expected move in puzzle.moves (user's move).
  const solutionIdxRef = useRef(1)
  const excludeRef = useRef<string[]>([])
  const themeCursorRef = useRef(0)
  const loadTokenRef = useRef(0)
  const startMsRef = useRef(0)
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  const [ratingLo, ratingHi] = lesson.ratingRange
  const themes = lesson.linkedThemes

  // Reset everything when the lesson changes; never leave a timer running.
  useEffect(() => {
    setPhase('idle')
    setPuzzle(null)
    setFen(INITIAL_FEN)
    setOrientation('white')
    setLastMove(undefined)
    setCorrectSan(null)
    setStats({ solved: 0, failed: 0, seen: 0 })
    solutionIdxRef.current = 1
    excludeRef.current = []
    themeCursorRef.current = 0
    loadTokenRef.current++
  }, [lesson.id])

  const clearTimers = useCallback(() => {
    for (const t of timersRef.current) clearTimeout(t)
    timersRef.current = []
  }, [])

  useEffect(() => () => clearTimers(), [clearTimers])

  const schedule = useCallback((fn: () => void, ms: number) => {
    const t = setTimeout(() => {
      timersRef.current = timersRef.current.filter((x) => x !== t)
      fn()
    }, ms)
    timersRef.current.push(t)
  }, [])

  // ---- Derived board state ----
  const dests = useMemo(() => {
    if (phase !== 'solving') return new Map<Key, Key[]>()
    return destsFor(fen)
  }, [fen, phase])
  const turn = useMemo(() => turnColor(fen), [fen])
  const check = useMemo(() => checkColor(fen), [fen])

  // ---- Lead-in: animate puzzle.moves[0], then hand control to the solver ----
  const startLeadIn = useCallback(
    (p: Puzzle, token: number) => {
      clearTimers()
      setCorrectSan(null)
      solutionIdxRef.current = 1

      const m0 = p.moves[0]
      if (!m0 || m0.length < 4) {
        loadNextRef.current()
        return
      }
      const shown = applyMove(p.fen, m0.slice(0, 2), m0.slice(2, 4), promoRole(m0))
      if (!shown) {
        loadNextRef.current()
        return
      }

      // Show the pre-leadin position first so chessground animates moves[0].
      setFen(p.fen)
      setLastMove(undefined)
      setOrientation(turnColor(shown.fen))
      setPhase('leadin')

      schedule(() => {
        if (loadTokenRef.current !== token) return
        setFen(shown.fen)
        setLastMove(uciToLastMove(shown.uci))
        startMsRef.current = performance.now()
        setPhase('solving')
      }, LEADIN_MS)
    },
    [clearTimers, schedule]
  )
  const startLeadInRef = useRef(startLeadIn)
  startLeadInRef.current = startLeadIn

  // ---- Attempt recording (does not gate the UI on the result) ----
  const recordAttempt = useCallback((solved: boolean, p: Puzzle, ms: number) => {
    const api = window.api?.puzzles
    if (!api) return
    void api.attempt({ puzzleId: p.id, puzzleRating: p.rating, solved, ms }).catch(() => {
      /* attempt failed; tally stays local */
    })
  }, [])

  // ---- Load next puzzle: round-robin across the lesson's themes ----
  const loadNext = useCallback(() => {
    clearTimers()
    const token = ++loadTokenRef.current
    setPhase('loading')
    setCorrectSan(null)

    const api = window.api?.puzzles
    if (!api) {
      setPuzzle(null)
      setPhase('empty')
      return
    }

    const lo = Math.round(ratingLo)
    const hi = Math.round(ratingHi)
    // Rotate the starting theme so repeated drills vary, then fall back to the
    // rest of the list (and finally an untyped query) before declaring empty.
    const order =
      themes.length > 0
        ? themes.map((_, i) => themes[(themeCursorRef.current + i) % themes.length])
        : []
    if (themes.length > 0) themeCursorRef.current = (themeCursorRef.current + 1) % themes.length

    const attempts: Array<string | undefined> = order.length > 0 ? [...order, undefined] : [undefined]

    const tryAt = (i: number): void => {
      if (loadTokenRef.current !== token) return
      if (i >= attempts.length) {
        setPuzzle(null)
        setPhase('empty')
        return
      }
      void api
        .next({ theme: attempts[i], ratingLo: lo, ratingHi: hi, exclude: excludeRef.current })
        .then((r) => {
          if (loadTokenRef.current !== token) return
          const found = r?.puzzle
          if (!found) {
            tryAt(i + 1)
            return
          }
          excludeRef.current.push(found.id)
          if (excludeRef.current.length > EXCLUDE_CAP) excludeRef.current.shift()
          setPuzzle(found)
          startLeadInRef.current(found, token)
        })
        .catch(() => {
          if (loadTokenRef.current !== token) return
          setPhase('error')
        })
    }

    tryAt(0)
  }, [clearTimers, ratingLo, ratingHi, themes])
  const loadNextRef = useRef(loadNext)
  loadNextRef.current = loadNext

  // ---- Actions ----
  const start = useCallback(() => {
    if (!apiReady) return
    loadNextRef.current()
  }, [apiReady])

  const next = useCallback(() => {
    // 'seen' is already counted when the puzzle was solved/failed; just advance.
    loadNextRef.current()
  }, [])

  // Skip = advance without crediting solved/failed; still counts as seen.
  const skip = useCallback(() => {
    if (phase === 'solving' || phase === 'leadin' || phase === 'loading') {
      setStats((s) => ({ ...s, seen: s.seen + 1 }))
    }
    loadNextRef.current()
  }, [phase])

  const retry = useCallback(() => {
    if (!puzzle) return
    const token = ++loadTokenRef.current
    startLeadInRef.current(puzzle, token)
  }, [puzzle])

  // ---- User move (validate exactly like the puzzle trainer) ----
  const onUserMove = useCallback(
    (orig: Key, dest: Key) => {
      if (phase !== 'solving' || !puzzle) return
      const idx = solutionIdxRef.current
      const expected = puzzle.moves[idx]
      if (!expected) return

      const candidate = `${orig}${dest}`
      const isPromo = expected.length === 5
      const matches = expected === candidate || (isPromo && expected.slice(0, 4) === candidate)

      if (!matches) {
        // Distinguish an illegal own-move (snap back) from a legal-but-wrong move.
        const played = applyMove(fen, orig, dest)
        if (!played) {
          setNonce((n) => n + 1)
          return
        }
        const right = applyMove(fen, expected.slice(0, 2), expected.slice(2, 4), promoRole(expected))
        setCorrectSan(right?.san ?? null)
        setLastMove(uciToLastMove(expected))
        setNonce((n) => n + 1)
        setPhase('failed')
        recordAttempt(false, puzzle, Math.round(performance.now() - startMsRef.current))
        setStats((s) => ({ solved: s.solved, failed: s.failed + 1, seen: s.seen + 1 }))
        return
      }

      // Correct user move.
      const userMove = applyMove(fen, expected.slice(0, 2), expected.slice(2, 4), promoRole(expected))
      if (!userMove) {
        setNonce((n) => n + 1)
        return
      }
      setFen(userMove.fen)
      setLastMove(uciToLastMove(userMove.uci))
      const nextIdx = idx + 1
      solutionIdxRef.current = nextIdx

      if (nextIdx >= puzzle.moves.length) {
        setPhase('solved')
        recordAttempt(true, puzzle, Math.round(performance.now() - startMsRef.current))
        setStats((s) => ({ solved: s.solved + 1, failed: s.failed, seen: s.seen + 1 }))
        return
      }

      // Auto-reply (opponent move).
      const replyUci = puzzle.moves[nextIdx]
      const replyFromFen = userMove.fen
      schedule(() => {
        const reply = applyMove(
          replyFromFen,
          replyUci.slice(0, 2),
          replyUci.slice(2, 4),
          promoRole(replyUci)
        )
        if (!reply) {
          loadNextRef.current()
          return
        }
        setFen(reply.fen)
        setLastMove(uciToLastMove(reply.uci))
        solutionIdxRef.current = nextIdx + 1
      }, AUTO_REPLY_MS)
    },
    [phase, puzzle, fen, recordAttempt, schedule]
  )

  return {
    apiReady,
    phase,
    puzzle,
    fen,
    orientation,
    turn,
    check,
    dests,
    lastMove,
    nonce,
    correctSan,
    stats,
    start,
    onUserMove,
    next,
    skip,
    retry
  }
}
