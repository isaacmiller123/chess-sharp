import { useState, type JSX } from 'react'
import {
  Eye,
  FileKey,
  Fingerprint,
  HardDrive,
  Radio,
  RefreshCw,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Zap,
  Ban
} from 'lucide-react'
import { PARAMS_A5, PARAMS_A5_DIGEST } from '@shared/accounts/judge/params'
import { useAccountsUi } from '../mock/store'
import { VerdictViewer } from './VerdictViewer'
import { SelfBanDialog } from './SelfBanDialog'
import './fairplay.css'

/**
 * Fair play (ACCOUNTS-SPEC §8, §9, §0) — the canonical judge and its two
 * tiers, the Tier-2 verdict records with receipts, and this client's own
 * self-ban standing. WIRED (A6 M5, lane L-ui):
 *
 *  - The judge card is LIVE. Every value is the REAL pinned rule set from
 *    PARAMS_A5 (`@shared/accounts/judge/params`) — the same constants the
 *    browser judge (`src/web/engines/judge.ts`) verifies the wasm against and
 *    every verdict record embeds (PARAMS_A5_DIGEST). Nothing here is authored.
 *  - The self-ban standing is a pure fold over THIS account's signed chain
 *    (mock/store → derive.ts deriveStanding): 'good' or an active self-ban with
 *    the real record id + witnessed-zone expiry. No fabricated conviction.
 *  - Verdict records are honest-empty until the judge runner (M5 L-t1/L-t2)
 *    publishes/adopts them over the live overlay — see VerdictViewer.
 */

const JUDGE_BINARY = 'stockfish-18-lite-single'

/** 80_000 → "80k", 1_200_000 → "1.2M" — compact node budgets for meta lines. */
function fmtNodes(n: number): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000
    return `${Number.isInteger(m) ? m : m.toFixed(1)}M`
  }
  return `${Math.round(n / 1000)}k`
}

/** Micro-units → σ (zThresholdMicro 5_000_000 → 5). Trailing-zero-free. */
function fmtSigma(micro: number): string {
  return `${Number((micro / 1_000_000).toFixed(2))}`
}

export function FairPlayTab(): JSX.Element {
  const { account } = useAccountsUi()
  const [recordOpen, setRecordOpen] = useState(false)

  // Real standing from the signed chain fold — never a fixture. A 'self-ban'
  // standing carries the public record id and the witnessed-zone expiry.
  const standing = account?.standing
  const selfBan = standing && standing.state === 'self-ban' ? standing : null
  const banEnds = selfBan
    ? new Date(selfBan.expiresWts).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })
    : null

  const zConvict = fmtSigma(PARAMS_A5.zThresholdMicro)
  const zEscalate = fmtSigma(PARAMS_A5.zEscalateMicro)

  return (
    <div className="afair-root">
      {/* ---- The judge: one pinned build, one config, one promise ---- */}
      <section className="card afair-judge" aria-labelledby="afair-judge-title">
        <header className="afair-judge-head">
          <span className="afair-judge-icon" aria-hidden>
            <Scale size={18} />
          </span>
          <div className="afair-judge-titles">
            <h2 id="afair-judge-title">The canonical judge</h2>
            <p className="afair-judge-sub">
              Same transcript → same verdict bits on a gaming rig or a phone, today or in ten
              years — trusted because reproducible, not because client-resident.
            </p>
          </div>
          <span className="afair-judge-pill">
            <Fingerprint size={12} aria-hidden /> Bit-deterministic
          </span>
        </header>

        <ul className="afair-judge-facts">
          <li className="afair-fact">
            <span className="afair-fact-icon" aria-hidden>
              <FileKey size={16} />
            </span>
            <span className="afair-fact-body">
              <span className="afair-fact-label">Engine build</span>
              <span className="afair-fact-value afair-mono">{JUDGE_BINARY}</span>
              <span className="afair-fact-value afair-mono">sha256:{PARAMS_A5.judgeWasmSha256}</span>
              <span className="afair-fact-value afair-mono">rules · {PARAMS_A5_DIGEST.slice(0, 16)}…</span>
              <span className="afair-fact-sub">
                Single-thread WASM, fetched and verified against this exact content hash on every
                platform before it can run — never the platform-tuned engines used for play and
                analysis.
              </span>
            </span>
          </li>
          <li className="afair-fact">
            <span className="afair-fact-icon" aria-hidden>
              <Zap size={16} />
            </span>
            <span className="afair-fact-body">
              <span className="afair-fact-label">Search budget</span>
              <span className="afair-fact-value num">
                Tier 1 · {fmtNodes(PARAMS_A5.t1Nodes)} — Tier 2 · {fmtNodes(PARAMS_A5.t2Nodes)}{' '}
                nodes/move
              </span>
              <span className="afair-fact-sub">
                Fixed node counts, never depth or time — wall clocks and thermal throttling
                cannot change a verdict.
              </span>
            </span>
          </li>
          <li className="afair-fact">
            <span className="afair-fact-icon" aria-hidden>
              <Eye size={16} />
            </span>
            <span className="afair-fact-body">
              <span className="afair-fact-label">Candidate lines</span>
              <span className="afair-fact-value num">
                Tier 1 · MultiPV {PARAMS_A5.t1MultiPv} — Tier 2 · MultiPV {PARAMS_A5.t2MultiPv}
              </span>
              <span className="afair-fact-sub">
                Engine match is scored against a ±{PARAMS_A5.scoreEquivCp} cp score-equivalence
                window over these lines — never exact-move matching.
              </span>
            </span>
          </li>
          <li className="afair-fact">
            <span className="afair-fact-icon" aria-hidden>
              <HardDrive size={16} />
            </span>
            <span className="afair-fact-body">
              <span className="afair-fact-label">Hash table</span>
              <span className="afair-fact-value num">Pinned at {PARAMS_A5.hashMb} MB</span>
              <span className="afair-fact-sub">
                Small enough to allocate on the weakest supported device — the same table size
                everywhere.
              </span>
            </span>
          </li>
          <li className="afair-fact">
            <span className="afair-fact-icon" aria-hidden>
              <RefreshCw size={16} />
            </span>
            <span className="afair-fact-body">
              <span className="afair-fact-label">Before every judged game</span>
              <span className="afair-fact-value afair-mono">ucinewgame + TT clear</span>
              <span className="afair-fact-sub">
                Reset {PARAMS_A5.ttReset}, on a judge-dedicated engine instance, never shared with
                the play or analysis pools.
              </span>
            </span>
          </li>
          <li className="afair-fact">
            <span className="afair-fact-icon" aria-hidden>
              <Fingerprint size={16} />
            </span>
            <span className="afair-fact-body">
              <span className="afair-fact-label">Determinism gate</span>
              <span className="afair-fact-value">Replay-stable</span>
              <span className="afair-fact-sub">
                The same transcript replayed after arbitrary prior engine use must yield
                identical bits — verified before the judge ships.
              </span>
            </span>
          </li>
        </ul>

        {/* ---- Tier explainer strip ---- */}
        <div className="afair-tiers">
          <article className="afair-tier">
            <header className="afair-tier-head">
              <span className="afair-tier-icon" aria-hidden>
                <Radio size={15} />
              </span>
              <span className="afair-tier-name">Tier 1</span>
              <span className="afair-tier-badge">every rated game</span>
            </header>
            <p className="afair-tier-copy">
              Runs in the background on both clients and the witness, on every rated game. Its
              output feeds the private trust signal — nothing else. Tier 1 never bans.
            </p>
            <span className="afair-tier-meta num">
              {fmtNodes(PARAMS_A5.t1Nodes)} nodes/move · seconds on desktop, tens on mobile
            </span>
          </article>
          <article className="afair-tier is-t2">
            <header className="afair-tier-head">
              <span className="afair-tier-icon" aria-hidden>
                <Ban size={15} />
              </span>
              <span className="afair-tier-name">Tier 2</span>
              <span className="afair-tier-badge">the only anticheat ban trigger</span>
            </header>
            <p className="afair-tier-copy">
              A ban obliges ONLY on the deterministic {zConvict}σ conviction (A5-21) — a pure
              function of the chain, so every compliant client provably knows the moment the
              obligation exists. The earlier {zEscalate}σ escalation triggers deeper analysis and
              nothing else — it never bans. Evidence aggregates over a {PARAMS_A5.reganK}-game
              window; no single game convicts.
            </p>
            <span className="afair-tier-meta num">
              {fmtNodes(PARAMS_A5.t2Nodes)} nodes/move · runnable by anyone — opponent, witness, or
              a stranger later
            </span>
          </article>
        </div>
      </section>

      {/* ---- Verdict records (honest-empty until the judge runner publishes) ---- */}
      <VerdictViewer />

      {/* ---- This account's fair-play standing (real chain fold) ---- */}
      <section className="card afair-moment">
        <div className="afair-moment-copy">
          <strong>Your fair-play standing</strong>
          {selfBan ? (
            <span className="muted small">
              A deterministic Tier-2 {zConvict}σ conviction is recorded on your chain — the
              witnessed zone reopens {banEnds}. The record is public and citable by anyone who
              replays your chain.
            </span>
          ) : (
            <span className="muted small">
              No Tier-2 conviction on your chain. If the deterministic {zConvict}σ conviction ever
              fires, a compliant client appends a signed self-ban before any further
              witnessed-lane event — the obligation is a pure function of the public chain,
              visible to everyone.
            </span>
          )}
        </div>
        {selfBan ? (
          <button
            type="button"
            className="btn ghost afair-moment-btn"
            onClick={() => setRecordOpen(true)}
          >
            <ShieldAlert size={15} aria-hidden /> View the self-ban record
          </button>
        ) : (
          <span className="afair-chip is-clean">
            <ShieldCheck size={12} aria-hidden /> Clear
          </span>
        )}
      </section>

      {selfBan && recordOpen && (
        <SelfBanDialog
          record={selfBan.record}
          expiresWts={selfBan.expiresWts}
          onClose={() => setRecordOpen(false)}
        />
      )}
    </div>
  )
}
