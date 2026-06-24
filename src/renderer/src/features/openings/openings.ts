// Openings explorer — curated dataset + SAN-line resolver.
//
// The list below is a hand-picked set of popular openings. Each entry stores the
// opening name, a short ECO hint (the canonical code for the listed line) and the
// mainline as SAN. ECO codes / names for these mainlines are public reference
// facts. The live opening label shown on the board still comes from
// window.api.openings.lookup(fen) — these hints are only a fallback / sort aid.

import { Chess } from 'chessops/chess'
import { parseFen, makeFen, INITIAL_FEN } from 'chessops/fen'
import { parseSan, makeSan } from 'chessops/san'
import { makeUci } from 'chessops/util'

export interface OpeningEntry {
  /** Stable id for React keys / selection. */
  id: string
  name: string
  /** ECO code for the listed mainline (reference hint, not authoritative). */
  eco: string
  /** Family used to group/filter in the UI. */
  group: string
  /** Mainline as SAN tokens, e.g. ['e4','e5','Nf3','Nc6','Bb5']. */
  line: string[]
}

/** A single resolved ply in an opening line. */
export interface LineMove {
  san: string
  uci: string
  /** FEN of the position AFTER this move. */
  fen: string
}

// ---- Curated openings (≈26 popular lines) ----------------------------------
// SAN strings only — kept terse and verifiable against any board.

export const OPENINGS: OpeningEntry[] = [
  {
    id: 'ruy-lopez',
    name: 'Ruy Lopez',
    eco: 'C60',
    group: "King's Pawn",
    line: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']
  },
  {
    id: 'italian',
    name: 'Italian Game',
    eco: 'C50',
    group: "King's Pawn",
    line: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4']
  },
  {
    id: 'scotch',
    name: 'Scotch Game',
    eco: 'C45',
    group: "King's Pawn",
    line: ['e4', 'e5', 'Nf3', 'Nc6', 'd4']
  },
  {
    id: 'petroff',
    name: 'Petrov Defense',
    eco: 'C42',
    group: "King's Pawn",
    line: ['e4', 'e5', 'Nf3', 'Nf6']
  },
  {
    id: 'vienna',
    name: 'Vienna Game',
    eco: 'C25',
    group: "King's Pawn",
    line: ['e4', 'e5', 'Nc3']
  },
  {
    id: 'kings-gambit',
    name: "King's Gambit",
    eco: 'C30',
    group: "King's Pawn",
    line: ['e4', 'e5', 'f4']
  },
  {
    id: 'sicilian-najdorf',
    name: 'Sicilian Defense: Najdorf',
    eco: 'B90',
    group: 'Sicilian',
    line: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6']
  },
  {
    id: 'sicilian-dragon',
    name: 'Sicilian Defense: Dragon',
    eco: 'B70',
    group: 'Sicilian',
    line: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'g6']
  },
  {
    id: 'sicilian-classical',
    name: 'Sicilian Defense: Classical',
    eco: 'B56',
    group: 'Sicilian',
    line: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'Nc6']
  },
  {
    id: 'french',
    name: 'French Defense',
    eco: 'C00',
    group: "King's Pawn",
    line: ['e4', 'e6', 'd4', 'd5']
  },
  {
    id: 'caro-kann',
    name: 'Caro-Kann Defense',
    eco: 'B10',
    group: "King's Pawn",
    line: ['e4', 'c6', 'd4', 'd5']
  },
  {
    id: 'scandinavian',
    name: 'Scandinavian Defense',
    eco: 'B01',
    group: "King's Pawn",
    line: ['e4', 'd5']
  },
  {
    id: 'pirc',
    name: 'Pirc Defense',
    eco: 'B07',
    group: "King's Pawn",
    line: ['e4', 'd6', 'd4', 'Nf6', 'Nc3', 'g6']
  },
  {
    id: 'queens-gambit-declined',
    name: "Queen's Gambit Declined",
    eco: 'D30',
    group: "Queen's Pawn",
    line: ['d4', 'd5', 'c4', 'e6']
  },
  {
    id: 'queens-gambit-accepted',
    name: "Queen's Gambit Accepted",
    eco: 'D20',
    group: "Queen's Pawn",
    line: ['d4', 'd5', 'c4', 'dxc4']
  },
  {
    id: 'slav',
    name: 'Slav Defense',
    eco: 'D10',
    group: "Queen's Pawn",
    line: ['d4', 'd5', 'c4', 'c6']
  },
  {
    id: 'kings-indian',
    name: "King's Indian Defense",
    eco: 'E60',
    group: 'Indian',
    line: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7']
  },
  {
    id: 'nimzo-indian',
    name: 'Nimzo-Indian Defense',
    eco: 'E20',
    group: 'Indian',
    line: ['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'Bb4']
  },
  {
    id: 'queens-indian',
    name: "Queen's Indian Defense",
    eco: 'E12',
    group: 'Indian',
    line: ['d4', 'Nf6', 'c4', 'e6', 'Nf3', 'b6']
  },
  {
    id: 'gruenfeld',
    name: 'Gruenfeld Defense',
    eco: 'D80',
    group: 'Indian',
    line: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'd5']
  },
  {
    id: 'benoni',
    name: 'Benoni Defense (Modern)',
    eco: 'A60',
    group: "Queen's Pawn",
    line: ['d4', 'Nf6', 'c4', 'c5', 'd5', 'e6']
  },
  {
    id: 'catalan',
    name: 'Catalan Opening',
    eco: 'E00',
    group: "Queen's Pawn",
    line: ['d4', 'Nf6', 'c4', 'e6', 'g3']
  },
  {
    id: 'london',
    name: 'London System',
    eco: 'D02',
    group: "Queen's Pawn",
    line: ['d4', 'd5', 'Bf4']
  },
  {
    id: 'dutch',
    name: 'Dutch Defense',
    eco: 'A80',
    group: "Queen's Pawn",
    line: ['d4', 'f5']
  },
  {
    id: 'english',
    name: 'English Opening',
    eco: 'A10',
    group: 'Flank',
    line: ['c4']
  },
  {
    id: 'reti',
    name: 'Reti Opening',
    eco: 'A04',
    group: 'Flank',
    line: ['Nf3', 'd5', 'c4']
  },
  {
    id: 'bird',
    name: "Bird's Opening",
    eco: 'A02',
    group: 'Flank',
    line: ['f4']
  }
]

/** Distinct groups in dataset order (for filter chips). */
export const OPENING_GROUPS: string[] = OPENINGS.reduce<string[]>((acc, o) => {
  if (!acc.includes(o.group)) acc.push(o.group)
  return acc
}, [])

/**
 * Resolve a SAN line into per-ply { san, uci, fen }. Walks from the initial
 * position; stops defensively on the first illegal/unparseable token (curated
 * data should never trip this, but never throw into the UI).
 */
export function resolveLine(sanLine: string[]): LineMove[] {
  const pos = Chess.fromSetup(parseFen(INITIAL_FEN).unwrap()).unwrap()
  const out: LineMove[] = []
  for (const token of sanLine) {
    const move = parseSan(pos, token)
    if (!move) break
    // Re-derive SAN so display is canonical (e.g. disambiguation/checks).
    const san = makeSan(pos, move)
    const uci = makeUci(move)
    pos.play(move)
    out.push({ san, uci, fen: makeFen(pos.toSetup()) })
  }
  return out
}
