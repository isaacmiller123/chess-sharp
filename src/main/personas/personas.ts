// GM-style persona catalog (docs/feature-addendum.md §2b).
//
// IMPORTANT FRAMING (mirrors the spec): these are NOT models that "play as" a
// given grandmaster. No open, redistributable net does that. Each persona is a
// strength-capped Stockfish whose move *selection* is style-weighted toward that
// player's documented tendencies (aggression / risk / attacking vs solid). The
// renderer must frame them honestly: "plays in X's style," never "play as X."
// Real opening books from that player's games are a later add (see feature-addendum
// §2b step 1) — repertoire bias is intentionally omitted here.
//
// Pure data + types, no Electron / DB / engine imports — trivially unit-testable.

/** A persona's behavioral style knobs. All scalars are normalized 0..1. */
export interface PersonaStyle {
  /** Eagerness to choose forcing/attacking moves. 0 = passive, 1 = relentless. */
  aggression: number
  /** Tolerance for sharp, unbalancing, materially-speculative lines. 0 = safe, 1 = wild. */
  risk: number
  /** Leans toward attacks on the king / initiative over material. */
  prefersAttack: boolean
  /** Leans toward solid, low-risk, structurally-sound moves. */
  prefersSolid: boolean
}

/** A selectable grandmaster-style persona. */
export interface Persona {
  /** Stable kebab-case id used by IPC and persisted refs. */
  id: string
  /** Display name (no honorifics). */
  name: string
  /** Human-readable era / active years. */
  era: string
  /** Approximate peak strength; caps the underlying engine via UCI_Elo. */
  peakElo: number
  style: PersonaStyle
  /** One-line characterization for the UI; honest, no "plays as" claims. */
  bio: string
}

/**
 * Nine canonical personas spanning the romantic-attacking to modern-universal
 * spectrum. peakElo values are widely-cited historical/peak-rating approximations
 * (pre-rating-era players are mapped to a comparable modern strength); they are
 * caps for flavor, not precise claims. Stockfish's UCI_Elo floor is 1320 and its
 * ceiling here is 3190, so every value is clamped into that band at selection time.
 */
export const PERSONAS: readonly Persona[] = [
  {
    id: 'morphy',
    name: 'Paul Morphy',
    era: '1850s',
    peakElo: 2690,
    style: { aggression: 0.92, risk: 0.78, prefersAttack: true, prefersSolid: false },
    bio: 'Romantic-era pioneer of rapid development and open-line attacks; punishes slow play with direct king hunts.'
  },
  {
    id: 'anderssen',
    name: 'Adolf Anderssen',
    era: '1850s-1870s',
    peakElo: 2600,
    style: { aggression: 0.97, risk: 0.95, prefersAttack: true, prefersSolid: false },
    bio: 'Archetype of the romantic sacrifice; trades material freely for a swarming kingside assault.'
  },
  {
    id: 'tal',
    name: 'Mikhail Tal',
    era: '1950s-1980s',
    peakElo: 2800,
    style: { aggression: 0.98, risk: 0.98, prefersAttack: true, prefersSolid: false },
    bio: 'The "Magician from Riga"; thrives on intuitive, unclear sacrifices that drag the game into chaos.'
  },
  {
    id: 'alekhine',
    name: 'Alexander Alekhine',
    era: '1910s-1940s',
    peakElo: 2740,
    style: { aggression: 0.85, risk: 0.7, prefersAttack: true, prefersSolid: false },
    bio: 'Combinative World Champion who builds attacking positions through deep, dynamic complications.'
  },
  {
    id: 'kasparov',
    name: 'Garry Kasparov',
    era: '1980s-2000s',
    peakElo: 2851,
    style: { aggression: 0.82, risk: 0.62, prefersAttack: true, prefersSolid: false },
    bio: 'Dominant dynamic attacker; seizes the initiative with deep preparation and relentless pressure.'
  },
  {
    id: 'fischer',
    name: 'Bobby Fischer',
    era: '1960s-1970s',
    peakElo: 2785,
    style: { aggression: 0.68, risk: 0.45, prefersAttack: true, prefersSolid: true },
    bio: 'Crystalline universal style; precise, forcing, and ruthless in converting small edges.'
  },
  {
    id: 'carlsen',
    name: 'Magnus Carlsen',
    era: '2010s-present',
    peakElo: 2882,
    style: { aggression: 0.55, risk: 0.4, prefersAttack: false, prefersSolid: true },
    bio: 'Modern universal player; grinds tiny, risk-free advantages with relentless technique.'
  },
  {
    id: 'capablanca',
    name: 'Jose Raul Capablanca',
    era: '1910s-1930s',
    peakElo: 2725,
    style: { aggression: 0.35, risk: 0.22, prefersAttack: false, prefersSolid: true },
    bio: 'The endgame machine; favors clarity, simplification, and flawless positional technique.'
  },
  {
    id: 'petrosian',
    name: 'Tigran Petrosian',
    era: '1950s-1980s',
    peakElo: 2700,
    style: { aggression: 0.2, risk: 0.12, prefersAttack: false, prefersSolid: true },
    bio: 'Prophylactic "Iron Tigran"; prevents counterplay first and only strikes from total safety.'
  }
] as const

const BY_ID: ReadonlyMap<string, Persona> = new Map(PERSONAS.map((p) => [p.id, p]))

/** All persona ids, in catalog order. */
export function personaIds(): string[] {
  return PERSONAS.map((p) => p.id)
}

/** Look up a persona by id, or undefined if unknown. */
export function getPersona(id: string): Persona | undefined {
  return BY_ID.get(id)
}
