import { useState, type JSX } from 'react'
import {
  Ban,
  Eye,
  FileKey,
  Fingerprint,
  HardDrive,
  Radio,
  RefreshCw,
  Scale,
  ShieldAlert,
  Zap
} from 'lucide-react'
import { DEV_FIXTURE, JUDGE_CONFIG } from '../mock/fixtures'
import { FixturePreviewBadge } from '../mock/FixturePreviewBadge'
import { VerdictViewer } from './VerdictViewer'
import { SelfBanDialog } from './SelfBanDialog'
import './fairplay.css'

/**
 * Fair play (ACCOUNTS-SPEC §8, §9, §0) — the canonical judge and its two
 * tiers, the Tier-2 verdict records with receipts, and a preview of the
 * compliant-client self-ban moment. DEV_FIXTURE surface: everything renders
 * from the JUDGE_CONFIG / VERDICTS fixtures and labels itself as sample data.
 */

/** 80_000 → "80k", 1_200_000 → "1.2M" — compact node budgets for meta lines. */
function fmtNodes(n: number): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000
    return `${Number.isInteger(m) ? m : m.toFixed(1)}M`
  }
  return `${Math.round(n / 1000)}k`
}

export function FairPlayTab(): JSX.Element {
  const [selfBanOpen, setSelfBanOpen] = useState(false)

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
          {DEV_FIXTURE && <FixturePreviewBadge />}
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
              <span className="afair-fact-value afair-mono">{JUDGE_CONFIG.binary}</span>
              <span className="afair-fact-value afair-mono">{JUDGE_CONFIG.binaryHash}</span>
              <span className="afair-fact-sub">
                Single-thread WASM, loaded by content hash on every platform — never the
                platform-tuned engines used for play and analysis.
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
                Tier 1 · {fmtNodes(JUDGE_CONFIG.tier1Nodes)} — Tier 2 ·{' '}
                {fmtNodes(JUDGE_CONFIG.tier2Nodes)} nodes/move
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
              <span className="afair-fact-value num">MultiPV fixed at {JUDGE_CONFIG.multiPv}</span>
              <span className="afair-fact-sub">
                Engine match is scored against a score-equivalence window over these lines —
                never exact-move matching.
              </span>
            </span>
          </li>
          <li className="afair-fact">
            <span className="afair-fact-icon" aria-hidden>
              <HardDrive size={16} />
            </span>
            <span className="afair-fact-body">
              <span className="afair-fact-label">Hash table</span>
              <span className="afair-fact-value num">Pinned at {JUDGE_CONFIG.hashMb} MB</span>
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
                On a judge-dedicated engine instance, never shared with the play or analysis
                pools.
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
              {fmtNodes(JUDGE_CONFIG.tier1Nodes)} nodes/move · seconds on desktop, tens on mobile
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
              A ban obliges ONLY on the deterministic 5σ conviction (A5-21) — a pure function of
              the chain, so every compliant client provably knows the moment the obligation
              exists. The earlier 3σ escalation triggers deeper analysis and nothing else — it
              never bans. Evidence aggregates over a {JUDGE_CONFIG.kWindow}-game window; no
              single game convicts.
            </p>
            <span className="afair-tier-meta num">
              {fmtNodes(JUDGE_CONFIG.tier2Nodes)} nodes/move · runnable by anyone — opponent,
              witness, or a stranger later
            </span>
          </article>
        </div>
      </section>

      {/* ---- Verdict records ---- */}
      <VerdictViewer />

      {/* ---- Self-ban moment preview ---- */}
      <section className="card afair-moment">
        <div className="afair-moment-copy">
          <strong>The self-ban moment</strong>
          <span className="muted small">
            What a compliant client shows when the Tier-2 5σ conviction fires on its own chain —
            the obligation is visible to everyone, so the client says so out loud.
          </span>
        </div>
        <button
          type="button"
          className="btn ghost afair-moment-btn"
          onClick={() => setSelfBanOpen(true)}
        >
          <ShieldAlert size={15} aria-hidden /> Preview the self-ban moment
        </button>
      </section>

      {selfBanOpen && <SelfBanDialog onClose={() => setSelfBanOpen(false)} />}
    </div>
  )
}
