// Build resources/openings/openings.json from the lichess-org/chess-openings TSVs.
//
// Each source row is `eco<TAB>name<TAB>pgn` where pgn is numbered SAN movetext.
// We replay the mainline with chessops to reach the final position, compute its
// EPD (first 4 FEN fields: placement, side, castling, ep) and build a map
//   epd -> { eco, name }
// keeping the LONGEST line when several openings reach the same EPD (a later /
// longer transposition overwrites a shorter one). The resulting JSON is small
// and CC0-licensed, so it is committed to the repo.
//
// Run once:  node scripts/build-openings.mjs

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { parsePgn } from 'chessops/pgn'
import { parseSan } from 'chessops/san'
import { makeFen } from 'chessops/fen'
import { Chess } from 'chessops/chess'

const VOLUMES = ['a', 'b', 'c', 'd', 'e']
const BASE = 'https://raw.githubusercontent.com/lichess-org/chess-openings/master'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_FILE = join(__dirname, '..', 'resources', 'openings', 'openings.json')

async function fetchTsv(vol) {
  const url = `${BASE}/${vol}.tsv`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`fetch ${url} -> ${res.status} ${res.statusText}`)
  return res.text()
}

async function main() {
  /** @type {Map<string, { eco: string, name: string, plies: number }>} */
  const byEpd = new Map()
  let rows = 0
  let skipped = 0

  for (const vol of VOLUMES) {
    const tsv = await fetchTsv(vol)
    const lines = tsv.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (!line) continue
      const [eco, name, pgn] = line.split('\t')
      if (eco === 'eco' || !eco || !name || !pgn) continue // header / malformed
      rows++

      const games = parsePgn(pgn)
      if (games.length === 0) {
        skipped++
        continue
      }
      const pos = Chess.default()
      let plies = 0
      let bad = false
      for (const node of games[0].moves.mainline()) {
        const move = parseSan(pos, node.san)
        if (!move) {
          bad = true
          break
        }
        pos.play(move)
        plies++
      }
      if (bad || plies === 0) {
        skipped++
        continue
      }
      const epd = makeFen(pos.toSetup(), { epd: true })

      // Keep the longest line for a given EPD (later/longer overwrites).
      const prev = byEpd.get(epd)
      if (!prev || plies >= prev.plies) {
        byEpd.set(epd, { eco, name, plies })
      }
    }
    console.log(`  ${vol}.tsv processed`)
  }

  /** @type {Record<string, { eco: string, name: string }>} */
  const out = {}
  for (const [epd, { eco, name }] of byEpd) {
    out[epd] = { eco, name }
  }

  mkdirSync(dirname(OUT_FILE), { recursive: true })
  writeFileSync(OUT_FILE, JSON.stringify(out), 'utf-8')

  console.log(`rows read:     ${rows}`)
  console.log(`rows skipped:  ${skipped}`)
  console.log(`unique EPDs:   ${Object.keys(out).length}`)
  console.log(`written to:    ${OUT_FILE}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
