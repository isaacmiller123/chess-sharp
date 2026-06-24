// Figurine notation: swap SAN piece letters for Unicode glyphs. SAN squares are
// lowercase (a-h) and castling uses 'O', so replacing [KQRBN] is unambiguous.
const GLYPH: Record<string, string> = { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘' }

export function figurine(san: string): string {
  return san.replace(/[KQRBN]/g, (c) => GLYPH[c] ?? c)
}

export function displaySan(san: string, figurineMode: boolean): string {
  return figurineMode ? figurine(san) : san
}
