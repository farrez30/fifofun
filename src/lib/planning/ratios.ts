import { RATIOS, type RatioThreshold } from './constants'

/**
 * Financial health ratios.
 *
 * The ratios themselves are arithmetic and uncontroversial. The value this
 * module adds is the third column: for every ratio that is off, how much would
 * have to change to bring it back. A verdict tells someone they have a problem;
 * a delta tells them what to do about it, and it is the same delta the gap
 * analysis solves against.
 */

export interface FinancialSnapshot {
  monthlyIncome: bigint
  /** Instalments: mortgage, vehicle, personal loans, paylater. */
  monthlyDebtService: bigint
  /** Everything set aside: emergency fund, investment, extra principal. */
  monthlySavings: bigint
  /** Everything spent, including the instalments above. */
  monthlyExpenses: bigint
  /** Cash and anything convertible to cash within a month. */
  liquidAssets: bigint
  /** Liquid assets plus property, vehicles, gold, investments. */
  totalAssets: bigint
  /** Outstanding principal on everything owed. */
  totalDebt: bigint
}

export type Verdict = 'healthy' | 'warning' | 'danger'

export interface RatioTarget {
  /** Which snapshot field to move. */
  field: keyof FinancialSnapshot
  direction: 'increase' | 'decrease'
  /** How much, in sen, to reach the healthy threshold. */
  amount: bigint
}

export interface RatioResult {
  threshold: RatioThreshold
  /** Null when the inputs cannot produce a ratio, such as zero income. */
  value: number | null
  verdict: Verdict | null
  /** What the number means, in words. */
  reading: string
  /** What to do about it, or null when it is already healthy. */
  advice: string | null
  /** The smallest single change that would reach healthy. */
  target: RatioTarget | null
}

/**
 * Divides two sen amounts into a float.
 *
 * Going through bigint first and only then to Number keeps the result exact to
 * six decimal places even when the amounts are large enough that converting
 * them individually would lose precision.
 *
 * It rounds to nearest rather than truncating. Truncation is not merely less
 * precise, it is biased: it always moves towards zero, which flatters a debt
 * ratio and penalises a savings one, in both cases in the direction that makes
 * the household look different from how it really is.
 */
const SCALE = 1_000_000n

function divide(numerator: bigint, denominator: bigint): number | null {
  if (denominator === 0n) return null

  const scaled = numerator * SCALE
  const negative = scaled < 0n !== denominator < 0n
  const top = scaled < 0n ? -scaled : scaled
  const bottom = denominator < 0n ? -denominator : denominator
  const quotient = (top + bottom / 2n) / bottom

  return Number(negative ? -quotient : quotient) / Number(SCALE)
}

function verdictFor(threshold: RatioThreshold, value: number): Verdict {
  if (threshold.direction === 'lower-better') {
    if (value <= threshold.healthy) return 'healthy'
    return value <= threshold.warning ? 'warning' : 'danger'
  }
  if (value >= threshold.healthy) return 'healthy'
  return value >= threshold.warning ? 'warning' : 'danger'
}

/** Rounds up, so a target always reaches the threshold rather than landing just short. */
function ceilShare(amount: bigint, share: number): bigint {
  const basisPoints = BigInt(Math.round(share * 10_000))
  const product = amount * basisPoints
  return product % 10_000n === 0n ? product / 10_000n : product / 10_000n + 1n
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1).replace('.', ',')}%`
}

function formatMonths(value: number): string {
  return `${value.toFixed(1).replace('.', ',')} bulan`
}

function display(threshold: RatioThreshold, value: number): string {
  return threshold.unit === 'months' ? formatMonths(value) : formatPercent(value)
}

/**
 * Each ratio knows how to compute itself and, separately, what would fix it.
 * Keeping the fix next to the formula is what stops the two drifting apart.
 */
interface RatioSpec {
  compute: (s: FinancialSnapshot) => number | null
  reading: (value: number, threshold: RatioThreshold) => string
  advice: (verdict: Verdict, s: FinancialSnapshot) => string | null
  target: (s: FinancialSnapshot, threshold: RatioThreshold) => RatioTarget | null
}

const SPECS: Record<string, RatioSpec> = {
  'debt-service': {
    compute: (s) => divide(s.monthlyDebtService, s.monthlyIncome),
    reading: (value, t) =>
      `${display(t, value)} of income goes to instalments. OJK puts the ceiling at 30%.`,
    advice: (verdict) =>
      verdict === 'healthy'
        ? null
        : 'Instalments are the hardest cost to cut quickly, so the realistic move is to stop adding new ones and pay down the highest-rate balance first. Refinancing helps only if the new rate genuinely beats the old one after fees.',
    target: (s, t) => {
      const ceiling = ceilShare(s.monthlyIncome, t.healthy)
      if (s.monthlyDebtService <= ceiling) return null
      return {
        field: 'monthlyDebtService',
        direction: 'decrease',
        amount: s.monthlyDebtService - ceiling,
      }
    },
  },

  'debt-to-asset': {
    compute: (s) => divide(s.totalDebt, s.totalAssets),
    reading: (value, t) => `Debt is ${display(t, value)} of everything owned.`,
    advice: (verdict) =>
      verdict === 'healthy'
        ? null
        : 'Above half, a fall in asset prices can leave the household underwater. Either the principal comes down or the asset base grows, and paying down principal is the only one of those under direct control.',
    target: (s, t) => {
      const ceiling = ceilShare(s.totalAssets, t.healthy)
      if (s.totalDebt <= ceiling) return null
      return { field: 'totalDebt', direction: 'decrease', amount: s.totalDebt - ceiling }
    },
  },

  savings: {
    compute: (s) => divide(s.monthlySavings, s.monthlyIncome),
    reading: (value, t) =>
      `${display(t, value)} of income is being set aside. OJK puts the floor at 10%.`,
    advice: (verdict) =>
      verdict === 'healthy'
        ? null
        : 'Saving what is left at the end of the month reliably produces nothing left. Move the transfer to payday and treat it as a bill.',
    target: (s, t) => {
      const floor = ceilShare(s.monthlyIncome, t.healthy)
      if (s.monthlySavings >= floor) return null
      return { field: 'monthlySavings', direction: 'increase', amount: floor - s.monthlySavings }
    },
  },

  liquidity: {
    compute: (s) => divide(s.liquidAssets, s.monthlyExpenses),
    reading: (value, t) => `Liquid savings would cover ${display(t, value)} of expenses.`,
    advice: (verdict) =>
      verdict === 'healthy'
        ? null
        : 'This is the ratio that decides whether a bad month becomes debt. Fill it before investing anything, and keep it somewhere boring and reachable within a day.',
    target: (s, t) => {
      const floor = s.monthlyExpenses * BigInt(Math.ceil(t.healthy))
      if (s.liquidAssets >= floor) return null
      return { field: 'liquidAssets', direction: 'increase', amount: floor - s.liquidAssets }
    },
  },

  solvency: {
    compute: (s) => divide(s.totalAssets - s.totalDebt, s.totalAssets),
    reading: (value, t) => `${display(t, value)} of assets are genuinely owned rather than owed.`,
    advice: (verdict) =>
      verdict === 'healthy'
        ? null
        : 'Net worth is thin relative to what is owned. It improves either by paying down debt or by the assets appreciating, and only the first is something to plan around.',
    target: (s, t) => {
      const minimumNetWorth = ceilShare(s.totalAssets, t.healthy)
      const netWorth = s.totalAssets - s.totalDebt
      if (netWorth >= minimumNetWorth) return null
      return { field: 'totalDebt', direction: 'decrease', amount: minimumNetWorth - netWorth }
    },
  },
}

export interface HealthReport {
  results: RatioResult[]
  /**
   * A headline out of 100. It is a presentation device, not a measurement: the
   * bands each ratio falls into are the real finding, and the score exists so a
   * dashboard has something to show at a glance.
   */
  score: number
  /** The ratio in the worst shape, which is where attention belongs first. */
  weakest: RatioResult | null
  counts: Record<Verdict, number>
}

const VERDICT_POINTS: Record<Verdict, number> = { healthy: 100, warning: 60, danger: 20 }

export function assessRatios(snapshot: FinancialSnapshot): HealthReport {
  const results: RatioResult[] = RATIOS.map((threshold) => {
    const spec = SPECS[threshold.id]
    const value = spec.compute(snapshot)

    if (value === null) {
      return {
        threshold,
        value: null,
        verdict: null,
        reading: 'Not enough information to work this out yet.',
        advice: null,
        target: null,
      }
    }

    const verdict = verdictFor(threshold, value)
    return {
      threshold,
      value,
      verdict,
      reading: spec.reading(value, threshold),
      advice: spec.advice(verdict, snapshot),
      target: verdict === 'healthy' ? null : spec.target(snapshot, threshold),
    }
  })

  const scored = results.filter((r): r is RatioResult & { verdict: Verdict } => r.verdict !== null)
  const counts: Record<Verdict, number> = { healthy: 0, warning: 0, danger: 0 }
  for (const result of scored) counts[result.verdict] += 1

  const score =
    scored.length === 0
      ? 0
      : Math.round(
          scored.reduce((sum, r) => sum + VERDICT_POINTS[r.verdict], 0) / scored.length,
        )

  // Danger before warning, and within a band the one furthest from its threshold.
  const ranked = [...scored].sort((a, b) => {
    const byVerdict = VERDICT_POINTS[a.verdict] - VERDICT_POINTS[b.verdict]
    if (byVerdict !== 0) return byVerdict
    const distance = (r: RatioResult & { verdict: Verdict }) =>
      Math.abs((r.value ?? 0) - r.threshold.healthy)
    return distance(b) - distance(a)
  })

  const weakest = ranked[0]?.verdict === 'healthy' ? null : (ranked[0] ?? null)
  return { results, score, weakest, counts }
}
