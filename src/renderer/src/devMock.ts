// Browser preview harness — DORMANT in the real app.
//
// installMock() wires a fake `window.api` so the renderer can be driven in a
// plain browser (no Electron/IPC) for interactive testing. It is loaded ONLY
// when the page is opened with `?mock` AND no real preload bridge exists
// (see main.tsx), so it can never run inside the packaged desktop app.
//
// The data is small but realistic — real FENs, legal UCI moves, a working
// curriculum lesson and a streaming engine stub — so the actual product
// components (Board, PuzzlesView, LessonDetail, AnalysisView, …) exercise the
// same code paths a user hits, just sourced from canned data.

import type {
  Api,
  EngineLine,
  Puzzle,
  CurriculumBand,
  LessonContent
} from '../../shared/types'
import { destsFor, INITIAL_FEN } from './chess/chess'

/** Legal first moves from a FEN as UCI strings (for engine PV / opponent replies). */
function legalUcis(fen: string): string[] {
  const out: string[] = []
  for (const [orig, dests] of destsFor(fen)) {
    for (const d of dests) out.push(`${orig}${d}`)
  }
  return out
}

const MOCK_PUZZLES: Puzzle[] = [
  {
    // Black to move plays ...Kh8 (lead-in); White solves with Ra8#.
    id: 'mock-backrank',
    fen: '6k1/5ppp/8/8/8/8/5PPP/R5K1 b - - 0 1',
    moves: ['g8h8', 'a1a8'],
    rating: 900,
    themes: ['mateIn1', 'backRankMate'],
    openingTags: []
  },
  {
    // Black plays a quiet rook move (lead-in); White mates with Qxf7#.
    id: 'mock-scholar',
    fen: 'r1bqkbnr/pppp1Qpp/2n5/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 1',
    moves: ['a8b8', 'f7f8'],
    rating: 1100,
    themes: ['mateIn1'],
    openingTags: []
  }
]

const MOCK_BANDS: CurriculumBand[] = [
  {
    id: 'B0',
    order: 1,
    label: 'Beginner (0–600)',
    ratingFloor: 0,
    ratingRange: [0, 600],
    goal: 'Learn how the pieces move and basic checkmates.',
    units: [
      {
        id: 'B0.rules',
        order: 1,
        title: 'The rules of chess',
        goal: 'How every piece moves and captures.',
        lessons: [
          {
            id: 'B0_600.rules.how_pieces_move',
            title: 'How the pieces move',
            summary: 'Each piece has its own way of moving and capturing.',
            objectives: ['Know how each piece moves', 'Make a legal capture'],
            linkedThemes: ['mateIn1'],
            ratingRange: [0, 600],
            kind: 'concept'
          },
          {
            id: 'B0_600.rules.check_and_mate',
            title: 'Check and checkmate',
            summary: 'Putting the king in check and delivering mate.',
            objectives: ['Recognise check', 'Deliver a back-rank mate'],
            linkedThemes: ['backRankMate'],
            ratingRange: [0, 600],
            kind: 'tactics'
          }
        ]
      }
    ]
  }
]

const MOCK_CONTENT: Record<string, LessonContent> = {
  'B0_600.rules.how_pieces_move': {
    intro:
      'Every piece moves in its own way. The rook moves in straight lines; the bishop diagonally; the queen combines both. The knight jumps in an L-shape and can hop over pieces. The king steps one square; pawns march forward but capture diagonally.',
    examples: [
      {
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        title: 'The starting position',
        explanation:
          'Both armies are lined up. Try opening with a central pawn — drag the e- or d-pawn forward two squares.'
      },
      {
        fen: '8/8/8/3N4/8/8/8/4K2k w - - 0 1',
        title: "Knight's reach",
        explanation:
          'The knight on d5 can jump to eight L-shaped squares. Drag it around to feel the pattern.'
      }
    ],
    keyPoints: [
      'Rooks move in straight lines; bishops on diagonals.',
      'The knight is the only piece that hops over others.',
      'Pawns capture diagonally, never straight ahead.'
    ]
  },
  'B0_600.rules.check_and_mate': {
    intro: 'Checkmate ends the game: the king is attacked and cannot escape.',
    examples: [
      {
        fen: '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1',
        title: 'Back-rank mate',
        explanation: 'White plays Ra8#. The trapped king has no escape on the back rank — try it.'
      }
    ],
    keyPoints: ['Trap the king with no escape squares.', 'A rook or queen on the back rank is lethal.']
  }
}

let handleSeq = 0
const lineSubs = new Set<(l: EngineLine) => void>()

function emitLines(fen: string, handleId: number, multipv: number): void {
  const ucis = legalUcis(fen).slice(0, Math.max(1, multipv))
  // Two depth bursts so the panel/arrows look alive.
  for (const depth of [12, 20]) {
    setTimeout(() => {
      ucis.forEach((uci, i) => {
        for (const cb of lineSubs) {
          cb({
            handleId,
            depth,
            multipv: i + 1,
            scoreCp: 35 - i * 18,
            pv: [uci]
          })
        }
      })
    }, depth * 8)
  }
}

const ok = Promise.resolve({ ok: true as const })

export function installMock(): void {
  // Cast loosely: this is a preview harness, not a typed contract. Components
  // only read the fields exercised below.
  const api = {
    app: {
      ping: async () => ({ ok: true, version: 'mock' }),
      dataVersion: async () => ({ puzzles: 'mock', openings: 'mock', engine: 'mock' })
    },
    settings: {
      get: async () => ({ value: null }),
      set: async () => ok
    },
    engine: {
      analyze: async ({ fen, multipv }: { fen: string; multipv?: number }) => {
        const handleId = ++handleSeq
        emitLines(fen, handleId, multipv ?? 3)
        return { handleId }
      },
      stop: async () => ok,
      play: async ({ fen }: { fen: string }) => {
        const ucis = legalUcis(fen)
        return { bestmove: ucis[0] ?? '0000' }
      },
      status: async () => ({ analysisReady: true, playReady: true, lc0Ready: false }),
      newGame: async () => ok,
      onLine: (cb: (l: EngineLine) => void) => {
        lineSubs.add(cb)
        return () => lineSubs.delete(cb)
      },
      onBestmove: () => () => {}
    },
    puzzles: {
      next: async ({ exclude }: { exclude?: string[] }) => {
        const pool = MOCK_PUZZLES.filter((p) => !(exclude ?? []).includes(p.id))
        return { puzzle: (pool[0] ?? MOCK_PUZZLES[0]) ?? null }
      },
      get: async (id: string) => ({ puzzle: MOCK_PUZZLES.find((p) => p.id === id) ?? null }),
      themes: async () => ({
        themes: [
          { key: 'mateIn1', count: 2 },
          { key: 'backRankMate', count: 1 }
        ]
      }),
      attempt: async () => ({ ratingAfter: 1010, rd: 80, delta: 10 })
    },
    ratings: {
      get: async () => ({ rating: 1000, rd: 80, vol: 0.06 })
    },
    progress: {
      summary: async () => ({
        puzzleRating: 1000,
        puzzleRd: 80,
        vsBotRating: 1000,
        vsBotRd: 80,
        puzzlesSolved: 0,
        puzzlesTried: 0,
        gamesPlayed: 0,
        lastPuzzleAt: null,
        lastGameAt: null
      })
    },
    games: {
      save: async () => ({ gameId: 1 }),
      list: async () => ({ games: [] }),
      get: async () => ({ game: null }),
      reportResult: async () => ({ ratingAfter: 1010, delta: 10 })
    },
    openings: {
      lookup: async (fen: string) => ({
        opening: fen === INITIAL_FEN ? null : { eco: 'A00', name: 'Mock Opening' }
      })
    },
    coach: {
      explainMove: async () => ({ verdict: 'Good', motifs: [], text: 'Mock coaching note.' }),
      positional: async () => ({ terms: [], text: 'Mock positional note.' })
    },
    review: {
      run: async () => ({
        reviewId: 1,
        review: { accuracyWhite: 90, accuracyBlack: 88, moveEvals: [], estEloLow: 1200, estEloHigh: 1500 }
      }),
      get: async () => ({ review: null, moveEvals: [] }),
      onProgress: () => () => {}
    },
    perf: {
      estimate: async () => ({ est: 1300, low: 1200, high: 1500, accuracy: 90 })
    },
    famous: {
      list: async () => ({ games: [] }),
      get: async () => ({ game: null })
    },
    curriculum: {
      tree: async () => ({ bands: MOCK_BANDS }),
      lesson: async (id: string) => {
        for (const b of MOCK_BANDS)
          for (const u of b.units) {
            const l = u.lessons.find((x) => x.id === id)
            if (l) return { lesson: l }
          }
        return { lesson: null }
      },
      lessonContent: async (id: string) => ({ content: MOCK_CONTENT[id] ?? null })
    },
    personas: {
      list: async () => ({ personas: [] }),
      move: async ({ fen }: { fen: string }) => {
        const ucis = legalUcis(fen)
        return { bestmove: ucis[0] ?? '0000' }
      }
    }
  }

  ;(window as unknown as { api: Api }).api = api as unknown as Api
  // eslint-disable-next-line no-console
  console.info('[devMock] window.api installed (preview harness)')
}
