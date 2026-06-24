import { getAppDb } from './database'

export interface GameRow {
  id: number
  created_at: number
  white_name: string | null
  black_name: string | null
  user_color: string | null
  result: string | null
  opponent_kind: string | null
  opponent_label: string | null
  opponent_elo: number | null
  source: string | null
  pgn: string
  accuracy_white: number | null
  accuracy_black: number | null
  est_elo_low: number | null
  est_elo_high: number | null
  reviewed: number
}

export interface SaveGameInput {
  pgn: string
  whiteName?: string
  blackName?: string
  userColor?: 'white' | 'black'
  result?: string
  opponentKind?: string
  opponentLabel?: string
  opponentElo?: number
  source?: string
}

export function saveGame(g: SaveGameInput): number {
  const r = getAppDb()
    .prepare(
      `INSERT INTO game
        (created_at,white_name,black_name,user_color,result,opponent_kind,opponent_label,opponent_elo,source,pgn)
       VALUES (?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      Date.now(),
      g.whiteName ?? null,
      g.blackName ?? null,
      g.userColor ?? null,
      g.result ?? '*',
      g.opponentKind ?? null,
      g.opponentLabel ?? null,
      g.opponentElo ?? null,
      g.source ?? 'play',
      g.pgn
    )
  return Number(r.lastInsertRowid)
}

export function listGames(limit = 25, offset = 0): GameRow[] {
  return getAppDb()
    .prepare('SELECT * FROM game ORDER BY created_at DESC LIMIT ? OFFSET ?')
    .all(limit, offset) as unknown as GameRow[]
}

export function getGame(id: number): GameRow | null {
  return (getAppDb().prepare('SELECT * FROM game WHERE id=?').get(id) as GameRow | undefined) ?? null
}
