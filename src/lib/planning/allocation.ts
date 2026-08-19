import {
  EMERGENCY_FUND,
  EQUIVALENCE_SCALE,
  FRAMEWORKS,
  type AllocationBucket,
  type AllocationFramework,
} from './constants'

/**
 * Turns an income into a recommended allocation, and says why.
 *
 * Every figure here is traceable to a published framework rather than invented,
 * and each bucket carries the reasoning that produced it, because a number a
 * user cannot interrogate is a number they will not trust or follow.
 */

/** Multiplies a sen amount by a fraction without leaving integer arithmetic. */
export function applyShare(amount: bigint, share: number): bigint {
  // Basis points give four decimal places of precision, which is finer than any
  // published allocation percentage.
  const basisPoints = BigInt(Math.round(share * 10_000))
  return (amount * basisPoints) / 10_000n
}

export interface AllocatedBucket extends AllocationBucket {
  /** The recommended amount for this bucket. */
  amount: bigint
  /** Lower bound where the framework states a floor. */
  minAmount: bigint | null
  /** Upper bound where the framework states a ceiling. */
  maxAmount: bigint | null
  /** Plain-language reason, shown next to the figure. */
  rationale: string
}

export interface Allocation {
  framework: AllocationFramework
  income: bigint
  buckets: AllocatedBucket[]
  /** Any rounding remainder, so the parts always add back to the whole. */
  unallocated: bigint
}

export function getFramework(id: string): AllocationFramework {
  const framework = FRAMEWORKS.find((f) => f.id === id)
  if (!framework) throw new Error(`Unknown allocation framework: ${id}`)
  return framework
}

function rationaleFor(bucket: AllocationBucket, framework: AllocationFramework): string {
  const percent = `${Math.round(bucket.share * 100)}%`
  if (bucket.bound === 'min') {
    return `${framework.name} treats ${percent} as a floor for ${bucket.label.toLowerCase()}: ${bucket.description}. Going below it is the compromise to avoid.`
  }
  if (bucket.bound === 'max') {
    return `${framework.name} treats ${percent} as a ceiling for ${bucket.label.toLowerCase()}: ${bucket.description}. Staying under it is what keeps the rest of the plan viable.`
  }
  return `${framework.name} targets ${percent} for ${bucket.label.toLowerCase()}: ${bucket.description}.`
}

/** Allocates take-home income across a framework's buckets. */
export function allocateIncome(income: bigint, frameworkId: string): Allocation {
  if (income < 0n) throw new Error('Income cannot be negative')
  const framework = getFramework(frameworkId)

  const buckets: AllocatedBucket[] = framework.buckets.map((bucket) => {
    const amount = applyShare(income, bucket.share)
    return {
      ...bucket,
      amount,
      minAmount: bucket.bound === 'min' ? amount : null,
      maxAmount: bucket.bound === 'max' ? amount : null,
      rationale: rationaleFor(bucket, framework),
    }
  })

  const allocated = buckets.reduce((sum, bucket) => sum + bucket.amount, 0n)
  return { framework, income, buckets, unallocated: income - allocated }
}

// --- Choosing a framework ----------------------------------------------

export interface HouseholdProfile {
  adults: number
  children: number
  /** Monthly instalments as a share of income, if any. */
  debtServiceRatio?: number
  /** Income that varies month to month, such as freelance or commission. */
  irregularIncome?: boolean
  /** Whether zakat should be a first-class bucket rather than an afterthought. */
  wantsZakatBucket?: boolean
}

export interface FrameworkRecommendation {
  framework: AllocationFramework
  reason: string
  alternatives: AllocationFramework[]
}

/**
 * Picks a framework to start from. The ordering is deliberate: irregular income
 * and heavy debt constrain the choice more than household size does, because a
 * framework with fixed percentages simply stops working under either.
 */
export function recommendFramework(profile: HouseholdProfile): FrameworkRecommendation {
  const pick = (id: string, reason: string): FrameworkRecommendation => ({
    framework: getFramework(id),
    reason,
    alternatives: FRAMEWORKS.filter((f) => f.id !== id),
  })

  if (profile.irregularIncome) {
    return pick(
      'qm-1234',
      'Income varies month to month, so floors and ceilings hold up better than fixed percentages. Apply them to a trailing six-month average rather than to whatever arrived this month.',
    )
  }
  if ((profile.debtServiceRatio ?? 0) > 0.2) {
    return pick(
      '40-30-20-10',
      'Instalments already take a substantial share of income, and this framework is the one that budgets for them explicitly rather than folding them into general needs.',
    )
  }
  if (profile.wantsZakatBucket) {
    return pick(
      'zapfin',
      'Zakat is treated as a bucket in its own right, and sinking funds are kept separate from long-term investing, which suits planning around recurring religious and family obligations.',
    )
  }
  if (profile.children > 0) {
    return pick(
      'ojk-10-20-30-40',
      'With children in the household, the future bucket has to cover education alongside the emergency fund and insurance, which this split sizes explicitly.',
    )
  }
  if (profile.adults === 1) {
    return pick(
      '50-30-20',
      'A single earner with no dependants and no instalments has the fewest constraints, so the simplest framework is the one most likely to be followed.',
    )
  }
  return pick(
    'ojk-10-20-30-40',
    'A general-purpose Indonesian default, published by the financial regulator.',
  )
}

// --- Household scaling -------------------------------------------------

export type ScalingMethod = 'oecd-modified' | 'naive-double' | 'square-root'

export interface HouseholdScaling {
  method: ScalingMethod
  multiplier: number
  explanation: string
}

/**
 * How much more a household costs than one person living alone.
 *
 * The naive answer for a couple is two. The honest one is about one and a half,
 * because rent, electricity, internet and much else are shared. Both are offered
 * so the difference is visible rather than asserted.
 */
export function householdScaling(
  adults: number,
  children: number,
  method: ScalingMethod = 'oecd-modified',
): HouseholdScaling {
  if (adults < 1) throw new Error('A household needs at least one adult')

  if (method === 'naive-double') {
    const multiplier = adults + children
    return {
      method,
      multiplier,
      explanation: `Counts every person as a full extra household. Simple, but it ignores that housing, utilities and internet are shared, so it overstates the cost of living together.`,
    }
  }

  if (method === 'square-root') {
    const multiplier = Math.sqrt(adults + children)
    return {
      method,
      multiplier: Number(multiplier.toFixed(3)),
      explanation: `The square root of household size, used in recent OECD work. Assumes economies of scale grow with every additional member.`,
    }
  }

  const multiplier =
    EQUIVALENCE_SCALE.firstAdult.value +
    EQUIVALENCE_SCALE.additionalAdult.value * (adults - 1) +
    EQUIVALENCE_SCALE.perChild.value * children

  return {
    method,
    multiplier: Number(multiplier.toFixed(3)),
    explanation: `OECD-modified scale: the first adult counts as 1, each further adult as 0,5 and each child as 0,3. A couple therefore costs about 1,5 times one person rather than 2, which is the real financial case for sharing a household.`,
  }
}

export interface MarriageComparison {
  separateTotal: bigint
  togetherCost: bigint
  saving: bigint
  savingPercent: number
  naiveEstimate: bigint
}

/**
 * Compares two people living apart against the same two sharing a household.
 * Reported as a saving rather than a doubling, because that is what the
 * equivalence scale actually says.
 */
export function marriageComparison(
  eachMonthlyCost: bigint,
  children = 0,
): MarriageComparison {
  const separateTotal = eachMonthlyCost * 2n
  const scaling = householdScaling(2, children)
  const togetherCost = applyShare(eachMonthlyCost, scaling.multiplier)
  const saving = separateTotal - togetherCost

  return {
    separateTotal,
    togetherCost,
    saving,
    savingPercent:
      separateTotal > 0n ? Number((saving * 1000n) / separateTotal) / 10 : 0,
    naiveEstimate: separateTotal,
  }
}

// --- Emergency fund ----------------------------------------------------

export interface EmergencyFundTarget {
  months: number
  amount: bigint
  rule: string
  rationale: string
}

/** Months of expenses to hold, based on how many people depend on the income. */
export function emergencyFundMonths(profile: HouseholdProfile): number {
  if (profile.irregularIncome) return 12
  if (profile.children >= 2) return 12
  if (profile.children === 1) return 9
  if (profile.adults >= 2) return 6
  return 4
}

export function emergencyFundTarget(
  monthlyExpenses: bigint,
  profile: HouseholdProfile,
): EmergencyFundTarget {
  const months = emergencyFundMonths(profile)
  const rule = EMERGENCY_FUND.rules.find((r) => r.months === months)

  const because = profile.irregularIncome
    ? 'income that varies month to month means a bad stretch can last longer than a salaried gap'
    : profile.children > 0
      ? `${profile.children} ${profile.children === 1 ? 'child depends' : 'children depend'} on this income`
      : profile.adults >= 2
        ? 'two adults share the household, so a single income shock affects both'
        : 'a single earner with no dependants can recover faster'

  return {
    months,
    amount: monthlyExpenses * BigInt(months),
    rule: rule?.label ?? 'Custom',
    rationale: `${months} months of expenses, because ${because}. OJK sets three months as the absolute floor regardless of circumstances.`,
  }
}
