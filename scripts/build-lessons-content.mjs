// Validate authored lesson content: every example FEN must be a legal position
// (chessops). Invalid examples are dropped (intro + keyPoints are kept).
// Output: resources/curriculum/lessons-content.json  { [lessonId]: {intro, examples[], keyPoints[]} }
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Chess } from 'chessops/chess'
import { parseFen } from 'chessops/fen'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/tmp/lesson-content-raw.json'), 'utf-8'))

function legal(fen) {
  try {
    const setup = parseFen(fen).unwrap()
    Chess.fromSetup(setup).unwrap()
    return true
  } catch {
    return false
  }
}

let kept = 0
let dropped = 0
const out = {}
for (const [id, c] of Object.entries(raw)) {
  const examples = (c.examples || []).filter((e) => {
    const ok = e && typeof e.fen === 'string' && legal(e.fen)
    if (ok) kept++
    else dropped++
    return ok
  })
  out[id] = { intro: c.intro || '', examples, keyPoints: c.keyPoints || [] }
}

const OUT_DIR = path.join(ROOT, 'resources', 'curriculum')
fs.mkdirSync(OUT_DIR, { recursive: true })
fs.writeFileSync(path.join(OUT_DIR, 'lessons-content.json'), JSON.stringify(out))
console.log(`lessons: ${Object.keys(out).length} | examples kept: ${kept} | dropped(illegal): ${dropped}`)
