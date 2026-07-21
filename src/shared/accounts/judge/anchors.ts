// A5 J3 — estElo anchors REFIT AT THE JUDGE'S OWN CONFIG (spec §8 Tier-1: the
// shipped depth-12 MultiPV-2 fit does not transfer; the judge path needs
// anchors fitted at its fixed-node config). Consumed ONLY by the judge path —
// analysis/play keeps the shipped depth-12 fit (src/main/analysis/estElo.ts).
//
// Provenance (fully reproducible):
//   corpus  scripts/data/judge-elo-corpus.jsonl — 176 games / 352 rows, played
//           at known strengths by scripts/gen-judge-corpus.mjs (shared
//           game-generation machinery with the shipped corpus) and analyzed
//           through the REAL judge core: judgeGame() over the pinned-WASM Node
//           adapter at judgeConfigForTier(1) = 200_000 nodes, MultiPV 4,
//           Hash 16, ucinewgame + TT clear per judged game.
//   fit     scripts/fit-elo-model.mjs --corpus scripts/data/judge-elo-corpus.jsonl
//           --out scripts/data/judge-elo-fit.json   (2026-07-21; 282 train /
//           70 holdout rows). Holdout MAE 296.4 Elo with-opponent / 331.8
//           without (shipped depth-12 baseline: ≈275 / ≈325).
//   suite   scripts/test-judge-fit.mjs asserts this module round-trips
//           scripts/data/judge-elo-fit.json exactly.
//
// Every value is an INTEGER (milli-/micro-units) per the accounts
// integers-only convention. The params digest below is the PARAMS_A5_DIGEST
// the corpus was judged under — a LITERAL, not a live import, so a later
// params change can never silently re-tag this fitted artifact (the suite
// compares it against the current digest and fails loudly on drift).
//
// [A5-CALIBRATED] provisional-until-J6: the J6 calibration run re-pins these
// from a larger corpus; this set is the first REAL judge-config fit.

import type { Tier1Anchors } from './tier1'

/** PARAMS_A5_DIGEST at fit time (rule set the whole corpus was judged under). */
export const JUDGE_ANCHORS_PARAMS_DIGEST = 'kkHGACUeDBJMna7_bCYZS3FD9TuRU5vv8GW4KCM4shU'

/** One calibration knot: feature in milli-units → Elo (both integers). */
export type JudgeFitKnot = {
  /** feature × 1000 (accuracy percent, or log(1+acpl)). */
  featMilli: number
  elo: number
}

/**
 * The full judge-config estElo fit (scripts/data/judge-elo-fit.json) in
 * integer form — the judge-path equivalent of the constants estElo.ts inlines
 * from the shipped depth-12 fit. Model shape is fit-elo-model.mjs's:
 * PAV-monotonized per-band calibration curves inverted to feature→Elo, blend
 * slopes summing to 1, bounded short-game shrink, structural opponent slope.
 */
export type JudgeEloFit = {
  v: 1
  /** judge config the corpus was analyzed at. */
  nodes: number
  multiPv: number
  hashMb: number
  /** PARAMS_A5_DIGEST at fit time. */
  params: string
  /** fit metadata: date + corpus/split sizes. */
  fitDate: string
  corpusRows: number
  trainRows: number
  holdoutRows: number
  /** holdout MAE × 10 (integer deci-Elo): with-opp / no-opp / acc-only. */
  maeHoldoutWithOppDeci: number
  maeHoldoutNoOppDeci: number
  maeHoldoutAccOnlyDeci: number
  /** accuracy(percent)×1000 → Elo, ascending (increasing curve). */
  accKnots: readonly JudgeFitKnot[]
  /** log(1+acpl)×1000 → Elo, band-ascending = featMilli descending. */
  acplKnots: readonly JudgeFitKnot[]
  /** blend/shrink/opponent coefficients, micro-units (×1_000_000). */
  coef: {
    a0Micro: number
    a1Micro: number
    c0Micro: number
    bShrinkMicro: number
    gOppMicro: number
  }
  shrink: { center: number; fullMoves: number; minMoves: number }
  clamp: { floor: number; ceil: number }
}

export const JUDGE_ELO_FIT: JudgeEloFit = {
  v: 1,
  nodes: 200_000,
  multiPv: 4,
  hashMb: 16,
  params: JUDGE_ANCHORS_PARAMS_DIGEST,
  fitDate: '2026-07-21',
  corpusRows: 352,
  trainRows: 282,
  holdoutRows: 70,
  maeHoldoutWithOppDeci: 2964,
  maeHoldoutNoOppDeci: 3318,
  maeHoldoutAccOnlyDeci: 4542,
  accKnots: [
    { featMilli: 65_524, elo: 400 },
    { featMilli: 75_717, elo: 600 },
    { featMilli: 80_287, elo: 903 },
    { featMilli: 82_300, elo: 1259 },
    { featMilli: 85_550, elo: 1691 },
    { featMilli: 88_374, elo: 2100 },
    { featMilli: 89_913, elo: 2300 },
    { featMilli: 90_867, elo: 2500 },
    { featMilli: 93_190, elo: 2700 },
  ],
  acplKnots: [
    { featMilli: 4960, elo: 400 },
    { featMilli: 4588, elo: 600 },
    { featMilli: 4354, elo: 903 },
    { featMilli: 4099, elo: 1259 },
    { featMilli: 3931, elo: 1500 },
    { featMilli: 3759, elo: 1783 },
    { featMilli: 3608, elo: 2100 },
    { featMilli: 3312, elo: 2395 },
    { featMilli: 2939, elo: 2700 },
  ],
  coef: {
    a0Micro: 11_400_000,
    a1Micro: 100_000,
    c0Micro: -86_200_000,
    bShrinkMicro: -320_000,
    gOppMicro: -125_700,
  },
  shrink: { center: 1500, fullMoves: 30, minMoves: 6 },
  clamp: { floor: 250, ceil: 3000 },
}

/**
 * The J2 Tier1Anchors set fitted at the judge config — the elo→expected-ACPL
 * curve is the judge fit's PAV-monotonized log(1+acpl)→Elo calibration knots
 * inverted via acpl = e^la − 1 (the same construction tier1.ts documents for
 * its provisional set, now from judge-config data). sigmaAcplMicro is the
 * measured residual std of per-game ACPL (micro-cp) about this curve over all
 * 352 corpus rows, evaluated with tier1.ts expectedAcplMicro's floor-division
 * interpolation. THIS set (not TIER1_ANCHORS_PROVISIONAL) is what may feed T.
 */
export const TIER1_ANCHORS_JUDGE: Tier1Anchors = {
  v: 1,
  nodes: 200_000,
  multiPv: 4,
  acplByElo: [
    { elo: 400, acplMicro: 141_593_796 },
    { elo: 600, acplMicro: 97_297_638 },
    { elo: 903, acplMicro: 76_788_997 },
    { elo: 1259, acplMicro: 59_279_977 },
    { elo: 1500, acplMicro: 49_957_910 },
    { elo: 1783, acplMicro: 41_905_499 },
    { elo: 2100, acplMicro: 35_892_195 },
    { elo: 2395, acplMicro: 26_439_951 },
    { elo: 2700, acplMicro: 17_896_940 },
  ],
  sigmaAcplMicro: 21_902_355,
  fit:
    'J3 judge-config refit 2026-07-21 — corpus scripts/data/judge-elo-corpus.jsonl ' +
    '(176 games / 352 rows, judged at 200000 nodes MultiPV 4 Hash 16, params ' +
    'kkHGACUeDBJMna7_bCYZS3FD9TuRU5vv8GW4KCM4shU), fit scripts/data/judge-elo-fit.json ' +
    '(holdout MAE 296.4 with-opp / 331.8 no-opp)',
}
