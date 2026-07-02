// Pure helpers for the famous-games library shown inside Analysis: group
// ordering/labels, result presentation, and PGN assembly. No React, no IPC.
import type { FamousGameDetail, FamousGameMeta, FamousGroup } from '@shared/types'

export const GROUP_ORDER: FamousGroup[] = ['romantic', 'classical', 'modern']

export const GROUP_LABEL: Record<FamousGroup, string> = {
  romantic: 'Romantic era',
  classical: 'Classical era',
  modern: 'Modern era'
}

export const GROUP_BLURB: Record<FamousGroup, string> = {
  romantic: 'Open gambits and all-out attacking play.',
  classical: 'Positional principles take hold.',
  modern: 'Deep preparation and dynamic balance.'
}

export interface FamousGroupSection {
  group: FamousGroup
  label: string
  blurb: string
  games: FamousGameMeta[]
}

/** Bucket a flat meta list into the three eras, preserving incoming order. */
export function groupGames(games: FamousGameMeta[]): FamousGroupSection[] {
  return GROUP_ORDER.map((group) => ({
    group,
    label: GROUP_LABEL[group],
    blurb: GROUP_BLURB[group],
    games: games.filter((g) => g.group === group)
  })).filter((s) => s.games.length > 0)
}

/** Short, human label for a result chip. */
export function resultLabel(result: FamousGameMeta['result']): string {
  switch (result) {
    case '1-0':
      return 'White won'
    case '0-1':
      return 'Black won'
    case '1/2-1/2':
      return 'Draw'
    default:
      return 'Unfinished'
  }
}

/** Tone suffix (-> .fg-result-*) for the result chip. */
export function resultTone(result: FamousGameMeta['result']): 'white' | 'black' | 'draw' | 'open' {
  switch (result) {
    case '1-0':
      return 'white'
    case '0-1':
      return 'black'
    case '1/2-1/2':
      return 'draw'
    default:
      return 'open'
  }
}

/**
 * Build a minimal but valid PGN from the detail's SAN moves so it can be parsed
 * into the game tree (parsePgnToGame). Headers carry players/event for context.
 */
export function detailToPgn(detail: FamousGameDetail): string {
  const { game, moves } = detail
  const tag = (k: string, v: string | number): string => `[${k} "${String(v).replace(/"/g, "'")}"]`
  const headers = [
    tag('Event', game.event || '?'),
    tag('White', game.white || '?'),
    tag('Black', game.black || '?'),
    tag('Date', game.year ? `${game.year}.??.??` : '????.??.??'),
    tag('Result', game.result)
  ].join('\n')

  let movetext = ''
  for (const m of moves) {
    if (m.ply % 2 === 1) movetext += `${Math.ceil(m.ply / 2)}. `
    movetext += `${m.san} `
  }

  const body = `${movetext.trim()} ${game.result}`.trim()
  return `${headers}\n\n${body}\n`
}
