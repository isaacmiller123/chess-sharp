// Glicko-2 (Glickman spec). Used for the local puzzle rating and vs-bot rating.
export interface Glicko {
  rating: number
  rd: number
  vol: number
}

export interface Opponent {
  rating: number
  rd: number
  score: number // 1 win, 0.5 draw, 0 loss
}

const SCALE = 173.7178
const RD_MAX = 350
const RD_MIN = 30

export function glicko2Update(p: Glicko, games: Opponent[], tau = 0.5): Glicko {
  // No games this period: only RD grows toward the prior.
  if (games.length === 0) {
    const phi = p.rd / SCALE
    const phiStar = Math.sqrt(phi * phi + p.vol * p.vol)
    return { rating: p.rating, rd: Math.min(phiStar * SCALE, RD_MAX), vol: p.vol }
  }

  const mu = (p.rating - 1500) / SCALE
  const phi = p.rd / SCALE
  const g = (ph: number) => 1 / Math.sqrt(1 + (3 * ph * ph) / (Math.PI * Math.PI))
  const expect = (muj: number, phj: number) => 1 / (1 + Math.exp(-g(phj) * (mu - muj)))

  let vInv = 0
  let deltaSum = 0
  for (const o of games) {
    const muj = (o.rating - 1500) / SCALE
    const phj = o.rd / SCALE
    const gj = g(phj)
    const ej = expect(muj, phj)
    vInv += gj * gj * ej * (1 - ej)
    deltaSum += gj * (o.score - ej)
  }
  const v = 1 / vInv
  const delta = v * deltaSum

  // Volatility via Illinois (regula falsi).
  const a = Math.log(p.vol * p.vol)
  const f = (x: number): number => {
    const ex = Math.exp(x)
    return (
      (ex * (delta * delta - phi * phi - v - ex)) / (2 * Math.pow(phi * phi + v + ex, 2)) -
      (x - a) / (tau * tau)
    )
  }
  let A = a
  let B: number
  if (delta * delta > phi * phi + v) {
    B = Math.log(delta * delta - phi * phi - v)
  } else {
    let k = 1
    while (f(a - k * tau) < 0) k++
    B = a - k * tau
  }
  let fA = f(A)
  let fB = f(B)
  for (let i = 0; i < 100 && Math.abs(B - A) > 1e-6; i++) {
    const C = A + ((A - B) * fA) / (fB - fA)
    const fC = f(C)
    if (fC * fB <= 0) {
      A = B
      fA = fB
    } else {
      fA = fA / 2
    }
    B = C
    fB = fC
  }
  const newVol = Math.exp(A / 2)

  const phiStar = Math.sqrt(phi * phi + newVol * newVol)
  const newPhi = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v)
  const newMu = mu + newPhi * newPhi * deltaSum

  return {
    rating: newMu * SCALE + 1500,
    rd: Math.max(RD_MIN, Math.min(newPhi * SCALE, RD_MAX)),
    vol: newVol
  }
}
