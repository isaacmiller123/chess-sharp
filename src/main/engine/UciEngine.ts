import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { EventEmitter } from 'node:events'

export interface InfoLine {
  depth?: number
  seldepth?: number
  multipv?: number
  scoreCp?: number
  mate?: number
  nodes?: number
  nps?: number
  timeMs?: number
  pv?: string[]
}

export interface BestMove {
  bestmove: string
  ponder?: string
}

export type GoLimit =
  | { kind: 'depth'; value: number }
  | { kind: 'movetime'; value: number }
  | { kind: 'nodes'; value: number }
  | { kind: 'infinite' }

function goArgs(l: GoLimit): string {
  switch (l.kind) {
    case 'depth':
      return `depth ${l.value}`
    case 'movetime':
      return `movetime ${l.value}`
    case 'nodes':
      return `nodes ${l.value}`
    case 'infinite':
      return 'infinite'
  }
}

function parseInfo(line: string): InfoLine | null {
  const t = line.split(/\s+/)
  const info: InfoLine = {}
  for (let i = 1; i < t.length; i++) {
    switch (t[i]) {
      case 'depth':
        info.depth = Number(t[++i])
        break
      case 'seldepth':
        info.seldepth = Number(t[++i])
        break
      case 'multipv':
        info.multipv = Number(t[++i])
        break
      case 'nodes':
        info.nodes = Number(t[++i])
        break
      case 'nps':
        info.nps = Number(t[++i])
        break
      case 'time':
        info.timeMs = Number(t[++i])
        break
      case 'score':
        if (t[i + 1] === 'cp') {
          info.scoreCp = Number(t[i + 2])
          i += 2
        } else if (t[i + 1] === 'mate') {
          info.mate = Number(t[i + 2])
          i += 2
        }
        break
      case 'pv':
        info.pv = t.slice(i + 1)
        i = t.length
        break
      default:
        break
    }
  }
  return info.depth !== undefined || info.pv ? info : null
}

/**
 * Thin, hand-rolled UCI wrapper over a spawned engine binary (architecture §6.3).
 * Pure Node — no Electron import — so it can be unit/smoke-tested headlessly.
 * Emits 'info' (InfoLine) and 'bestmove' (BestMove). One search at a time.
 */
export class UciEngine extends EventEmitter {
  private proc: ChildProcessWithoutNullStreams | null = null
  private buf = ''
  private searching = false
  private waiter: { token: string; resolve: () => void } | null = null

  constructor(private readonly exePath: string) {
    super()
  }

  async start(): Promise<void> {
    const proc = spawn(this.exePath, [], { stdio: ['pipe', 'pipe', 'pipe'] })
    proc.stdout.setEncoding('utf-8')
    proc.stdout.on('data', (chunk: string) => this.onData(chunk))
    proc.on('exit', () => {
      this.searching = false
      this.emit('exit')
    })
    this.proc = proc
    await this.expect('uci', 'uciok')
    await this.isready()
  }

  private onData(chunk: string): void {
    this.buf += chunk
    let nl: number
    while ((nl = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, nl).trim()
      this.buf = this.buf.slice(nl + 1)
      if (line) this.onLine(line)
    }
  }

  private onLine(line: string): void {
    if (line.startsWith('info ')) {
      const info = parseInfo(line)
      if (info) this.emit('info', info)
    } else if (line.startsWith('bestmove')) {
      this.searching = false
      const p = line.split(/\s+/)
      this.emit('bestmove', { bestmove: p[1], ponder: p[3] } as BestMove)
    }
    if (this.waiter && line.startsWith(this.waiter.token)) {
      const w = this.waiter
      this.waiter = null
      w.resolve()
    }
  }

  private write(cmd: string): void {
    this.proc?.stdin.write(cmd + '\n')
  }

  private expect(cmd: string, token: string): Promise<void> {
    return new Promise((resolve) => {
      this.waiter = { token, resolve }
      this.write(cmd)
    })
  }

  isready(): Promise<void> {
    return this.expect('isready', 'readyok')
  }

  setOption(name: string, value: string | number | boolean): void {
    this.write(`setoption name ${name} value ${value}`)
  }

  async newGame(): Promise<void> {
    this.write('ucinewgame')
    await this.isready()
  }

  /** Fire-and-forget search; results stream via 'info' / 'bestmove'. */
  async search(fen: string, limit: GoLimit, multipv = 1): Promise<void> {
    if (this.searching) await this.stop()
    this.setOption('MultiPV', multipv)
    this.write(`position fen ${fen}`)
    this.searching = true
    this.write(`go ${goArgs(limit)}`)
  }

  /** Search and resolve with the engine's chosen move. */
  bestMove(fen: string, limit: GoLimit): Promise<BestMove> {
    return new Promise((resolve) => {
      this.once('bestmove', (bm: BestMove) => resolve(bm))
      void this.search(fen, limit, 1)
    })
  }

  stop(): Promise<void> {
    if (!this.searching) return Promise.resolve()
    return new Promise((resolve) => {
      this.once('bestmove', () => resolve())
      this.write('stop')
    })
  }

  /** Graceful quit, then hard kill as a Windows-safe fallback. */
  async quit(): Promise<void> {
    if (!this.proc) return
    this.write('quit')
    await new Promise((r) => setTimeout(r, 150))
    this.kill()
  }

  kill(): void {
    if (this.proc && !this.proc.killed) this.proc.kill()
    this.proc = null
  }
}
