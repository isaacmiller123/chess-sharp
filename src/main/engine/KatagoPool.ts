import fs from 'node:fs'
import { GtpClient } from './gtp'
import {
  katagoAvailable,
  katagoDir,
  katagoNetInstalled,
  katagoNetPath,
  resolveKatagoConfigPath,
  resolveKatagoPath,
  type KatagoNetId
} from '../datasets/katago'
import type { PlayGoRequest } from '../../shared/types'

// Lazy pool of KataGo GTP processes for the Go bots (docs/GAMES-PLATFORM-SPEC.md
// §Bots: go → KataGo GTP ipc) — one persistent engine per LEVEL, because a
// level's whole personality (net + visit budget + move-choice temperature, or a
// Human-SL rank profile) is fixed at spawn via -override-config. Nets are tiny
// (b6c96 ~15MB RSS) and a user typically plays one level at a time, so keeping
// a couple resident is cheap; a dead process is dropped from the map and the
// next request respawns it (MaiaPool discipline).
//
// Two ladders (task spec, backed by KataGo's own strength research):
//   standard — g170 nets weakened by LOW VISITS + a hot chosenMoveTemperature
//     (probability-proportional sampling of the search's move distribution):
//     L1..L3 on b6c96 at 2/8/24 visits, L4 b10c128@64, L5 b10c128@320.
//   human (flagship, when the optional Human-SL b18 net is installed) — the
//     same 5 levels map to humanSLProfile ranks 15k/9k/4k/1k/3d: genmove then
//     IS a human-move model of that rank (humanSLChosenMoveProp=1 plays the
//     profile's predicted-move distribution directly; low visits keep it fast
//     — the profile, not the search, carries the strength).
//
// Both ladders disable resignation (a kernel game ends by passes + scoring,
// never mid-game) and pondering (no background CPU burn between moves).

interface StandardLevel {
  net: KatagoNetId
  visits: number
  temperature: number
}

/** Level 1..5 → standard ladder config (index = level - 1). */
const STANDARD_LEVELS: readonly StandardLevel[] = [
  { net: 'b6c96', visits: 2, temperature: 1.1 },
  { net: 'b6c96', visits: 8, temperature: 0.8 },
  { net: 'b6c96', visits: 24, temperature: 0.5 },
  { net: 'b10c128', visits: 64, temperature: 0.3 },
  { net: 'b10c128', visits: 320, temperature: 0.12 }
]

/** Level 1..5 → Human-SL rank profile (index = level - 1). The renderer's
 *  describe() strings (games/bots.ts KATAGO_HUMAN_HINTS) mirror these ranks —
 *  keep the two lists in sync. */
const HUMAN_PROFILES = ['rank_15k', 'rank_9k', 'rank_4k', 'rank_1k', 'rank_3d'] as const

function clampLevel(level: number): number {
  return Math.max(1, Math.min(5, Math.round(level)))
}

/** The level's standard net, degrading to whichever standard net IS on disk
 *  (katagoAvailable guarantees at least one). */
function resolveStandardNet(preferred: KatagoNetId): KatagoNetId {
  if (katagoNetInstalled(preferred)) return preferred
  return katagoNetInstalled('b10c128') ? 'b10c128' : 'b6c96'
}

export class KatagoPool {
  private engines = new Map<string, GtpClient>()

  /** True when levels play the Human-SL rank ladder (optional net installed). */
  humanStyle(): boolean {
    return katagoNetInstalled('b18-human')
  }

  private spawnConfig(level: number): { key: string; args: string[] } {
    const l = clampLevel(level)
    const cfg = resolveKatagoConfigPath()
    const common = 'allowResignation=false,ponderingEnabled=false,numSearchThreads=2'
    if (this.humanStyle()) {
      // Human ladder: the b18 Human-SL net drives move CHOICE via the rank
      // profile; a small standard net + tiny visit budget backs value/safety.
      const profile = HUMAN_PROFILES[l - 1]
      const net = resolveStandardNet('b6c96')
      return {
        key: `human-${l}`,
        args: [
          'gtp',
          '-config',
          cfg,
          '-model',
          katagoNetPath(net),
          '-human-model',
          katagoNetPath('b18-human'),
          '-override-config',
          `humanSLProfile=${profile},humanSLChosenMoveProp=1.0,maxVisits=8,${common}`
        ]
      }
    }
    const spec = STANDARD_LEVELS[l - 1]
    const net = resolveStandardNet(spec.net)
    return {
      key: `std-${l}-${net}`,
      args: [
        'gtp',
        '-config',
        cfg,
        '-model',
        katagoNetPath(net),
        '-override-config',
        `maxVisits=${spec.visits},chosenMoveTemperature=${spec.temperature},` +
          `chosenMoveTemperatureEarly=${Math.max(spec.temperature, 0.5)},${common}`
      ]
    }
  }

  private async get(level: number): Promise<GtpClient> {
    const { key, args } = this.spawnConfig(level)
    const existing = this.engines.get(key)
    if (existing) return existing
    // cwd = the dataset dir so the config's relative logDir (gtp_logs) resolves
    // into the per-user datasets folder, exactly like scripts/verify-katago.mjs.
    // (The dir may not exist yet in the dev brew-fallback case — create it.)
    fs.mkdirSync(katagoDir(), { recursive: true })
    const eng = new GtpClient(resolveKatagoPath(), args, katagoDir())
    await eng.start(60000) // first spawn loads the net (Metal warm-up on mac)
    this.engines.set(key, eng)
    return eng
  }

  /**
   * One bot move: replay the game (boardsize/komi/moves — GTP is stateful, and
   * replaying from scratch keeps this pool stateless across concurrent games),
   * then genmove for the side to move. Returns a codec vertex or 'pass'.
   * On ANY failure the level's engine is killed and dropped so the next request
   * respawns cleanly instead of writing to a wedged process forever.
   */
  async play(req: PlayGoRequest): Promise<string> {
    if (!katagoAvailable()) {
      throw new Error('KataGo is not installed — download the Go engine in Settings → Datasets.')
    }
    const { key } = this.spawnConfig(req.level)
    const eng = await this.get(req.level)
    try {
      await eng.boardsize(req.size)
      await eng.clearBoard()
      await eng.komi(req.komi)
      for (let i = 0; i < req.moves.length; i++) {
        // players[0] = black in the go spec: even indices are black moves.
        await eng.play(i % 2 === 0 ? 'black' : 'white', req.moves[i])
      }
      const color = req.moves.length % 2 === 0 ? 'black' : 'white'
      const move = await eng.genmove(color, 120000)
      // Resignation is disabled by config; translate defensively anyway — the
      // kernel codec is vertices|pass only.
      return move === 'resign' ? 'pass' : move
    } catch (err) {
      eng.kill()
      if (this.engines.get(key) === eng) this.engines.delete(key)
      throw err instanceof Error ? err : new Error(String(err))
    }
  }

  killAll(): void {
    for (const eng of this.engines.values()) eng.kill()
    this.engines.clear()
  }
}
