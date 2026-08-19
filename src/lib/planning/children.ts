import {
  BIRTH_COSTS,
  CHILD_MONTHLY_BASELINE,
  EDUCATION_STAGES,
  INFLATION,
  TRACK_MULTIPLIERS,
  type SchoolStage,
  type SchoolTrack,
} from './constants'
import { futureValue, presentValue } from './goals'

/**
 * What a child costs, year by year.
 *
 * A single total is the wrong answer to this question. Nobody pays for a child
 * in one go, and the number that decides whether a plan survives is not the sum
 * but the worst single year, which is why the output here is a timeline and the
 * headline figure is the peak rather than the total.
 *
 * Two inflation rates run side by side and they are not interchangeable.
 * Education entry fees compound near 10 percent a year while everything else
 * tracks general inflation near 3,5. Over eighteen years that difference turns a
 * Rp19jt university year into roughly Rp106jt rather than Rp35jt, and using one
 * rate for both is the single easiest way to build a plan that quietly fails.
 */

export interface ChildPlan {
  /** Shown in the timeline; falls back to the ordinal position. */
  label?: string
  birthYear: number
  track: SchoolTrack
  /** Real quotes from real schools, which always beat the defaults. */
  overrides?: Partial<Record<SchoolStage, { annual?: bigint; entryFee?: bigint }>>
  /** Whether delivery was, or is expected to be, caesarean. */
  delivery?: 'normal' | 'caesar' | 'bpjs'
  /** Age at which the household stops carrying the child's living costs. */
  supportUntilAge?: number
}

export interface StageWindow {
  stage: SchoolStage
  label: string
  startYear: number
  endYear: number
  /** Entry fee in the money of the year it falls due. */
  entryFee: bigint
}

export interface ChildYearCost {
  year: number
  age: number
  stage: SchoolStage | null
  /** One-off entry fee, inflated to this year. Zero except at a stage boundary. */
  entryFee: bigint
  /** Tuition and school running costs for this year. */
  schooling: bigint
  /** Food, clothing, healthcare and the rest, over and above the household. */
  living: bigint
  total: bigint
}

export interface ChildProjection {
  plan: ChildPlan
  label: string
  /** Delivery and antenatal care, in the money of the birth year. */
  birthCost: bigint
  stages: StageWindow[]
  years: ChildYearCost[]
  /** Everything added up as it will actually be billed. */
  totalNominal: bigint
  /** The same total expressed in the money of the year the projection starts. */
  totalPresentValue: bigint
  /** The most expensive single year, which is what a plan has to survive. */
  peakYear: ChildYearCost | null
}

function costsFor(stage: SchoolStage, plan: ChildPlan): { annual: bigint; entryFee: bigint } {
  const base = EDUCATION_STAGES.find((s) => s.stage === stage)
  if (!base) throw new Error(`Unknown school stage: ${stage}`)

  const multiplier = TRACK_MULTIPLIERS[plan.track].value
  const override = plan.overrides?.[stage]

  return {
    annual: override?.annual ?? base.annual * BigInt(multiplier.annual),
    entryFee: override?.entryFee ?? base.entryFee * BigInt(multiplier.entry),
  }
}

function birthCostFor(plan: ChildPlan): bigint {
  const delivery =
    plan.delivery === 'caesar'
      ? BIRTH_COSTS.caesar.value
      : plan.delivery === 'bpjs'
        ? BIRTH_COSTS.bpjsCovered.value
        : BIRTH_COSTS.normal.value
  return delivery + BIRTH_COSTS.antenatal.value
}

/** Projects one child from a given year forward. Costs already past are skipped. */
export function projectChild(
  plan: ChildPlan,
  fromYear: number,
  index = 0,
): ChildProjection {
  const label = plan.label ?? `Anak ${index + 1}`
  const supportUntil = plan.supportUntilAge ?? 22
  const educationRate = INFLATION.education.default.value
  const generalRate = INFLATION.general.value

  const stages: StageWindow[] = EDUCATION_STAGES.map((stage) => {
    const startYear = plan.birthYear + stage.entryAge
    return {
      stage: stage.stage,
      label: stage.label,
      startYear,
      endYear: startYear + stage.durationYears - 1,
      entryFee: futureValue(
        costsFor(stage.stage, plan).entryFee,
        educationRate,
        Math.max(0, startYear - fromYear),
      ),
    }
  })

  const lastYear = plan.birthYear + supportUntil
  const years: ChildYearCost[] = []

  for (let year = Math.max(fromYear, plan.birthYear); year <= lastYear; year += 1) {
    const age = year - plan.birthYear
    const yearsAhead = Math.max(0, year - fromYear)
    const window = stages.find((s) => year >= s.startYear && year <= s.endYear)

    const entryFee = window && window.startYear === year ? window.entryFee : 0n
    const schooling = window
      ? futureValue(costsFor(window.stage, plan).annual, educationRate, yearsAhead)
      : 0n
    const living = futureValue(CHILD_MONTHLY_BASELINE.value * 12n, generalRate, yearsAhead)

    years.push({
      year,
      age,
      stage: window?.stage ?? null,
      entryFee,
      schooling,
      living,
      total: entryFee + schooling + living,
    })
  }

  const totalNominal = years.reduce((sum, year) => sum + year.total, 0n)
  const totalPresentValue = years.reduce(
    (sum, year) => sum + presentValue(year.total, generalRate, Math.max(0, year.year - fromYear)),
    0n,
  )

  const peakYear = years.reduce<ChildYearCost | null>(
    (worst, year) => (worst === null || year.total > worst.total ? year : worst),
    null,
  )

  return {
    plan,
    label,
    birthCost:
      plan.birthYear >= fromYear
        ? futureValue(birthCostFor(plan), INFLATION.medical.value, plan.birthYear - fromYear)
        : 0n,
    stages,
    years,
    totalNominal,
    totalPresentValue,
    peakYear,
  }
}

// --- Several children at once ------------------------------------------

export interface CombinedYear {
  year: number
  /** What each child costs this year, keyed by label. */
  byChild: Record<string, bigint>
  /** Entry fees falling due this year, which is what makes a year hurt. */
  entryFees: { child: string; stage: SchoolStage; amount: bigint }[]
  total: bigint
}

export interface CrunchYear extends CombinedYear {
  /** How many entry fees land together. Two or more is the thing to avoid. */
  collisions: number
}

export interface FamilyProjection {
  children: ChildProjection[]
  years: CombinedYear[]
  /** Years where more than one entry fee falls due at once. */
  crunchYears: CrunchYear[]
  totalNominal: bigint
  peakYear: CombinedYear | null
  /** Monthly cost averaged across the whole projection, for a sanity check. */
  averageMonthly: bigint
}

/**
 * Puts several children on one timeline.
 *
 * The collision count is the point of the whole exercise. Entry fees are lumpy
 * and large, and two arriving in the same calendar year is a different problem
 * from the same money spread over two years, even though the total is identical.
 */
export function projectFamily(plans: ChildPlan[], fromYear: number): FamilyProjection {
  const children = plans.map((plan, index) => projectChild(plan, fromYear, index))

  const allYears = new Set<number>()
  for (const child of children) for (const year of child.years) allYears.add(year.year)

  const years: CombinedYear[] = [...allYears]
    .sort((a, b) => a - b)
    .map((year) => {
      const byChild: Record<string, bigint> = {}
      const entryFees: CombinedYear['entryFees'] = []

      for (const child of children) {
        const entry = child.years.find((y) => y.year === year)
        if (!entry) continue
        const birth = child.plan.birthYear === year ? child.birthCost : 0n
        byChild[child.label] = entry.total + birth
        if (entry.entryFee > 0n && entry.stage) {
          entryFees.push({ child: child.label, stage: entry.stage, amount: entry.entryFee })
        }
      }

      return {
        year,
        byChild,
        entryFees,
        total: Object.values(byChild).reduce((sum, amount) => sum + amount, 0n),
      }
    })

  const crunchYears: CrunchYear[] = years
    .filter((year) => year.entryFees.length > 1)
    .map((year) => ({ ...year, collisions: year.entryFees.length }))

  const totalNominal = years.reduce((sum, year) => sum + year.total, 0n)
  const peakYear = years.reduce<CombinedYear | null>(
    (worst, year) => (worst === null || year.total > worst.total ? year : worst),
    null,
  )

  return {
    children,
    years,
    crunchYears,
    totalNominal,
    peakYear,
    averageMonthly: years.length > 0 ? totalNominal / BigInt(years.length * 12) : 0n,
  }
}
