import { parseFen } from 'chessops/fen'
import { Chess } from 'chessops/chess'
import { parseUci } from 'chessops/util'

export function legal(fen) {
  const s = parseFen(fen)
  if (s.isErr) return 'PARSE_ERR'
  const p = Chess.fromSetup(s.unwrap())
  return p.isErr ? 'ILLEGAL:' + JSON.stringify(p.error?.message ?? p.error) : 'ok'
}
export function moveLegal(fen, uci) {
  const s = parseFen(fen)
  if (s.isErr) return 'PARSE_ERR'
  const p = Chess.fromSetup(s.unwrap())
  if (p.isErr) return 'ILLEGAL_POS'
  const pos = p.unwrap()
  const m = parseUci(uci)
  if (!m) return 'BAD_UCI'
  if (!pos.isLegal(m)) return 'ILLEGAL_MOVE'
  pos.play(m)
  return 'ok'
}
const args = process.argv.slice(2)
for (const a of args) {
  const [fen, uci] = a.split('||')
  if (uci) console.log(moveLegal(fen, uci), '|', uci, '|', fen)
  else console.log(legal(fen), '|', fen)
}
