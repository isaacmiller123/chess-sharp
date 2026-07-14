// Content-hash pin for the canonical judge WASM (spec §8: "the judge always
// loads the single-thread WASM Stockfish build by content hash").
//
// The judge's trust model is reproducibility, not client residence: a verdict
// is a pure function of countersigned data replayed against a BIT-IDENTICAL
// engine binary on every machine. That binary is pinned here by the sha256 of
// its raw `.wasm` bytes; a loader (server/judge/nodeEngine.ts, and the browser
// judge at A5) MUST verify the file against this hash before trusting any
// output. If the shipped binary ever drifts (e.g. a floated `stockfish` semver
// bump republishes the blob), this check fails LOUDLY — which is the intended
// behaviour for a content-pinned judge.
//
// node-only (server/**). Not imported by src/shared/**.
//
// The pinned values below are the sha256 + byte length of
//   node_modules/stockfish/bin/stockfish-18-lite-single.wasm
// as resolved by the repo lockfile (stockfish@18.0.8). The byte length is an
// independent cross-check — it also equals the `l=7295411` constant the
// Emscripten glue (stockfish-18-lite-single.js) bakes in for its own length
// guard, so a mismatch on either field means the wrong blob.

import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'

/** Base filename of the pinned single-thread judge WASM. */
export const JUDGE_WASM_FILENAME = 'stockfish-18-lite-single.wasm'

/** Package-relative module id used for default resolution. */
export const JUDGE_WASM_MODULE_ID = 'stockfish/bin/stockfish-18-lite-single.wasm'

/** sha256 (hex) of the pinned judge WASM — the spec §8 content-hash pin. */
export const JUDGE_WASM_SHA256 =
  'a8fbc05ec6920b56d7485826dcb02c5ffd2826bcbf751cf973046f237a9096f1'

/** Byte length of the pinned judge WASM (independent cross-check). */
export const JUDGE_WASM_BYTES = 7295411

export interface WasmHash {
  /** sha256 of the file, lowercase hex. */
  sha256: string
  /** file length in bytes. */
  bytes: number
}

export interface WasmHashVerdict extends WasmHash {
  /** true iff both sha256 AND byte length match the pinned values. */
  ok: boolean
  /** the pinned sha256 compared against. */
  expectedSha256: string
  /** the pinned byte length compared against. */
  expectedBytes: number
}

/**
 * Resolve the shipped judge WASM path. Best-effort: resolves the `stockfish`
 * package relative to THIS module (cwd-independent). Callers that bundle this
 * file (e.g. the on-the-fly esbuild test harness) should pass an explicit path
 * instead, since package resolution from a bundle temp dir will not find the
 * dependency.
 */
export function defaultWasmPath(): string {
  const require = createRequire(import.meta.url)
  return require.resolve(JUDGE_WASM_MODULE_ID)
}

/**
 * Compute the sha256 + byte length of a WASM file. Pure function of the file
 * bytes. Defaults to the resolved shipped judge WASM when no path is given.
 */
export function computeWasmHash(wasmPath: string = defaultWasmPath()): WasmHash {
  const buf = readFileSync(wasmPath)
  const sha256 = createHash('sha256').update(buf).digest('hex')
  return { sha256, bytes: buf.byteLength }
}

/**
 * Verify a WASM file against the pinned content hash. Returns the measured
 * hash/length alongside the pinned expectations and an `ok` flag; never throws
 * on mismatch (callers decide how loud to be). Defaults to the shipped WASM.
 */
export function verifyWasmHash(wasmPath: string = defaultWasmPath()): WasmHashVerdict {
  const { sha256, bytes } = computeWasmHash(wasmPath)
  return {
    ok: sha256 === JUDGE_WASM_SHA256 && bytes === JUDGE_WASM_BYTES,
    sha256,
    bytes,
    expectedSha256: JUDGE_WASM_SHA256,
    expectedBytes: JUDGE_WASM_BYTES,
  }
}

/**
 * Verify and throw with a precise message on mismatch. Use at judge-load time
 * so an un-pinned binary can never silently produce verdicts.
 */
export function assertWasmHash(wasmPath: string = defaultWasmPath()): void {
  const v = verifyWasmHash(wasmPath)
  if (!v.ok) {
    throw new Error(
      `judge WASM content-hash mismatch at ${wasmPath}: ` +
        `got sha256=${v.sha256} (${v.bytes} bytes), ` +
        `expected sha256=${v.expectedSha256} (${v.expectedBytes} bytes)`,
    )
  }
}
