import { app, type WebContents } from 'electron'
import { z } from 'zod'
import { handle } from './util'
import { StockfishPool } from '../engine/StockfishPool'
import type { BestMove, InfoLine, UciEngine } from '../engine/UciEngine'

const pool = new StockfishPool()

const limitSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('depth'), value: z.number().int().positive() }),
  z.object({ kind: z.literal('movetime'), value: z.number().int().positive() }),
  z.object({ kind: z.literal('nodes'), value: z.number().int().positive() }),
  z.object({ kind: z.literal('infinite') })
])

const analyzeSchema = z
  .object({
    fen: z.string().min(1),
    multipv: z.number().int().min(1).max(10).default(3),
    limit: limitSchema
  })
  .strict()

const playSchema = z
  .object({
    fen: z.string().min(1),
    level: z.object({
      uciElo: z.number().int().min(1320).max(3190).optional(),
      skill: z.number().int().min(0).max(20).optional()
    }),
    limit: limitSchema
  })
  .strict()

let nextHandle = 1
// One analysis engine -> one active streaming subscription at a time.
let active: {
  handleId: number
  eng: UciEngine
  onInfo: (i: InfoLine) => void
  onBest: (b: BestMove) => void
} | null = null

function clearActive(): void {
  if (active) {
    active.eng.off('info', active.onInfo)
    active.eng.off('bestmove', active.onBest)
    active = null
  }
}

export function registerEngine(): void {
  handle('engine:status', z.object({}).strict(), () => ({
    analysisReady: pool.hasAnalysis(),
    playReady: pool.hasPlay(),
    lc0Ready: false
  }))

  handle(
    'engine:newGame',
    z.object({ instance: z.enum(['analysis', 'play']) }).strict(),
    async ({ instance }) => {
      const eng = instance === 'analysis' ? await pool.getAnalysis() : await pool.getPlay()
      await eng.newGame()
      return { ok: true }
    }
  )

  handle('engine:analyze', analyzeSchema, async ({ fen, multipv, limit }, e) => {
    const eng = await pool.getAnalysis()
    clearActive()
    const handleId = nextHandle++
    const sender: WebContents = e.sender
    const onInfo = (info: InfoLine): void => {
      if (!sender.isDestroyed()) sender.send('engine:line', { handleId, ...info })
    }
    const onBest = (bm: BestMove): void => {
      if (!sender.isDestroyed()) sender.send('engine:bestmove', { handleId, ...bm })
      clearActive()
    }
    active = { handleId, eng, onInfo, onBest }
    eng.on('info', onInfo)
    eng.once('bestmove', onBest)
    await eng.search(fen, limit, multipv)
    return { handleId }
  })

  handle('engine:stop', z.object({ handleId: z.number() }).strict(), async () => {
    if (active) {
      await active.eng.stop()
      clearActive()
    }
    return { ok: true }
  })

  handle('engine:play', playSchema, async ({ fen, level, limit }) => {
    const eng = await pool.getPlay()
    eng.setOption('MultiPV', 1)
    if (level.uciElo !== undefined) {
      eng.setOption('UCI_LimitStrength', true)
      eng.setOption('UCI_Elo', level.uciElo)
    } else if (level.skill !== undefined) {
      eng.setOption('UCI_LimitStrength', false)
      eng.setOption('Skill Level', level.skill)
    }
    return eng.bestMove(fen, limit)
  })

  // Windows-safe lifecycle: kill all engine children when the app quits.
  app.on('will-quit', () => pool.killAll())
}
