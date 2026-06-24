// Per-persona opening book lookup. Built by scripts/build-persona-books.mjs into
// resources/personas/books.json as { personaId: { epd: [uci, ...] } } containing
// ONLY that player's own moves. Transposition-friendly (keyed by EPD).
import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { parseFen, makeFen } from 'chessops/fen'

type Book = Record<string, Record<string, string[]>>

let cache: Book | null = null

function booksPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'personas', 'books.json')
    : path.join(__dirname, '../../resources/personas/books.json')
}

function load(): Book {
  if (cache) return cache
  try {
    cache = JSON.parse(fs.readFileSync(booksPath(), 'utf-8')) as Book
  } catch {
    cache = {}
  }
  return cache
}

function epdOf(fen: string): string | null {
  try {
    return makeFen(parseFen(fen).unwrap(), { epd: true })
  } catch {
    return null
  }
}

/** A repertoire move for this persona in this position, or null if out of book. */
export function bookMove(personaId: string, fen: string): string | null {
  const book = load()[personaId]
  if (!book) return null
  const epd = epdOf(fen)
  if (!epd) return null
  const candidates = book[epd]
  if (!candidates || candidates.length === 0) return null
  return candidates[Math.floor(Math.random() * candidates.length)]
}
