import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import zlib from 'node:zlib'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import {
  datasetsDir,
  importedEnginePath,
  importedPuzzlesPath,
  engineInstalled,
  puzzlesInstalled
} from './paths'

// Runtime dataset importer. Downloads the heavy, redistributable datasets that
// are kept out of the repo/installer, straight from the project's public GitHub
// release, into the writable per-user datasets folder. Streamed + verified, so a
// half-finished download never corrupts an install (write to *.part, then rename).

const RELEASE_BASE =
  'https://github.com/isaacmiller123/chess-sharp/releases/download/datasets-v1'

export interface DatasetItem {
  key: 'engine' | 'puzzles'
  label: string
  url: string
  /** Size of the downloaded artifact (compressed, for the .zst). */
  bytes: number
  /** sha256 of the downloaded artifact (compressed bytes for the .zst). */
  sha256: string
  /** Transparent decompression applied while writing to disk. */
  compressed?: 'zstd'
  /** Final on-disk size after decompression (for display). */
  installedBytes: number
}

export const DATASET_ITEMS: DatasetItem[] = [
  {
    key: 'engine',
    label: 'Stockfish 18 engine',
    url: `${RELEASE_BASE}/stockfish-sf18-win-x64.exe`,
    bytes: 114007552,
    sha256: 'c86215fa1977d53b82ed854540a4c7b025be4cd042276c85ba3de53fb9118911',
    installedBytes: 114007552
  },
  {
    key: 'puzzles',
    label: 'Lichess puzzle database',
    url: `${RELEASE_BASE}/puzzles.sqlite.zst`,
    bytes: 705175215,
    sha256: 'ecc7719bad6fe9edc45cd8d28acc0bf2549a98783f6b3901fa373e8b45bef4b4',
    compressed: 'zstd',
    installedBytes: 2148864000
  }
]

export interface DatasetStatus {
  engine: boolean
  puzzles: boolean
  complete: boolean
}

export function datasetStatus(): DatasetStatus {
  const engine = engineInstalled()
  const puzzles = puzzlesInstalled()
  return { engine, puzzles, complete: engine && puzzles }
}

export interface DatasetProgress {
  key: 'engine' | 'puzzles' | 'all'
  phase: 'download' | 'verify' | 'done' | 'error' | 'cancelled'
  received: number
  total: number
  itemIndex: number
  itemCount: number
  message?: string
}

export type ProgressFn = (p: DatasetProgress) => void

let importing = false
let cancelFlag = false

function destFor(key: 'engine' | 'puzzles'): string {
  return key === 'engine' ? importedEnginePath() : importedPuzzlesPath()
}

async function downloadItem(
  it: DatasetItem,
  itemIndex: number,
  itemCount: number,
  onProgress: ProgressFn
): Promise<void> {
  const dest = destFor(it.key)
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  const tmp = `${dest}.part`
  if (fs.existsSync(tmp)) fs.rmSync(tmp, { force: true })

  const res = await fetch(it.url, { redirect: 'follow' })
  if (!res.ok || !res.body) throw new Error(`${it.label}: download failed (HTTP ${res.status})`)
  const total = Number(res.headers.get('content-length')) || it.bytes

  let received = 0
  const hash = crypto.createHash('sha256')
  // Meter sits on the COMPRESSED byte stream: hashes the artifact, reports
  // download progress, and is the cancellation point.
  const meter = new Transform({
    transform(chunk, _enc, cb) {
      if (cancelFlag) return cb(new Error('cancelled'))
      received += chunk.length
      hash.update(chunk)
      onProgress({ key: it.key, phase: 'download', received, total, itemIndex, itemCount })
      cb(null, chunk)
    }
  })

  const source = Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0])
  const out = fs.createWriteStream(tmp)
  try {
    if (it.compressed === 'zstd') {
      await pipeline(source, meter, zlib.createZstdDecompress(), out)
    } else {
      await pipeline(source, meter, out)
    }
  } catch (err) {
    fs.rmSync(tmp, { force: true })
    throw err
  }

  onProgress({ key: it.key, phase: 'verify', received: total, total, itemIndex, itemCount })
  const digest = hash.digest('hex')
  if (it.sha256 && digest !== it.sha256) {
    fs.rmSync(tmp, { force: true })
    throw new Error(`${it.label}: checksum mismatch (download corrupted, please retry)`)
  }

  // Atomic publish: only a fully-downloaded, verified file ever appears at dest.
  fs.rmSync(dest, { force: true })
  fs.renameSync(tmp, dest)
}

export async function runImport(
  onProgress: ProgressFn
): Promise<{ ok: boolean; status: DatasetStatus; error?: string }> {
  if (importing) throw new Error('datasets: an import is already running')
  importing = true
  cancelFlag = false
  try {
    fs.mkdirSync(datasetsDir(), { recursive: true })
    // Only fetch what's missing, so a retry resumes the remaining items.
    const items = DATASET_ITEMS.filter((it) =>
      it.key === 'engine' ? !engineInstalled() : !puzzlesInstalled()
    )
    for (let i = 0; i < items.length; i++) {
      if (cancelFlag) {
        onProgress({
          key: 'all',
          phase: 'cancelled',
          received: 0,
          total: 0,
          itemIndex: i,
          itemCount: items.length
        })
        return { ok: false, status: datasetStatus(), error: 'cancelled' }
      }
      await downloadItem(items[i], i, items.length, onProgress)
    }
    onProgress({
      key: 'all',
      phase: 'done',
      received: 0,
      total: 0,
      itemIndex: items.length,
      itemCount: items.length
    })
    return { ok: true, status: datasetStatus() }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    onProgress({
      key: 'all',
      phase: cancelFlag ? 'cancelled' : 'error',
      received: 0,
      total: 0,
      itemIndex: 0,
      itemCount: 0,
      message
    })
    return { ok: false, status: datasetStatus(), error: message }
  } finally {
    importing = false
  }
}

export function cancelImport(): void {
  cancelFlag = true
}
