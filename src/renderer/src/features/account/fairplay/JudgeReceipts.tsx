import type { JSX } from 'react'
import { FileCheck2 } from 'lucide-react'
import { PARAMS_A5 } from '@shared/accounts/judge/params'
import type { UiVerdict } from '../mock/types'

/**
 * Receipts always (§8): the accused — or anyone — re-runs the exact judge on
 * the exact transcripts and compares verdict bits against the published record.
 *
 * WIRED (A6 M5, lane L-ui): the FAKE deterministic re-run (fabricated digest +
 * simulated progress) is gone. The receipt names the REAL pinned judge and the
 * REAL node budget from the record, and states the honest truth about
 * reproduction. In-app one-click re-verification is the judge runner's job
 * (M5 L-t1/L-t2 runs the pinned wasm in a worker over the countersigned
 * transcripts) — this component never fabricates verdict bits.
 */

const JUDGE_BINARY = 'stockfish-18-lite-single'

export function JudgeReceipts({ verdict }: { verdict: UiVerdict }): JSX.Element {
  return (
    <div className="afair-receipts">
      <p className="afair-receipts-caption">
        Receipts, not accusations: anyone — the accused included — reproduces these verdict bits
        by running the pinned judge on the exact countersigned transcripts published under{' '}
        {verdict.accused}&rsquo;s key.
      </p>
      <p className="afair-receipts-digest">
        <FileCheck2 size={13} aria-hidden /> {JUDGE_BINARY} · sha256:{PARAMS_A5.judgeWasmSha256} ·{' '}
        {verdict.nodesPerMove.toLocaleString('en-US')} nodes/move · single-thread
      </p>
      <p className="afair-receipts-caption">
        The reproduction is bit-exact by construction — fixed node budget, pinned hash, per-game
        TT reset. One-click in-app re-verification lands with the judge runner.
      </p>
    </div>
  )
}
