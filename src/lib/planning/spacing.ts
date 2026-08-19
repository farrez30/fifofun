import {
  CHILD_SPACING,
  EDUCATION_STAGES,
  TRACK_MULTIPLIERS,
  type SchoolStage,
  type SchoolTrack,
} from './constants'

/**
 * How far apart to space children.
 *
 * The health side of this question has published answers: BKKBN states three
 * years between births, WHO advises at least twenty-four months before the next
 * conception, and USAID puts the ideal band at three to five years. Those are
 * cited, not derived.
 *
 * The financial side has no published answer, so it is worked out here and
 * labelled as such. The reasoning is short: entry fees are the lumpy part of
 * education, they fall in the year a child turns 4, 6, 12, 15 and 18, and two of
 * them landing in the same calendar year is a materially different problem from
 * the same money spread across two years. A spacing collides whenever it equals
 * the gap between any two of those ages, and the collision set follows from the
 * ages themselves rather than from anyone's opinion.
 *
 * Deriving it matters: change the schooling ages and the recommendation changes
 * with them, instead of a hardcoded list quietly going stale.
 */

export interface StageCollision {
  /** Years from now the clash falls, counted from the elder child's birth. */
  elderAge: number
  youngerAge: number
  elderStage: SchoolStage
  youngerStage: SchoolStage
  /** The two entry fees added together, at today's prices. */
  combinedFee: bigint
}

export type SpacingVerdict = 'ideal' | 'workable' | 'avoid'

export interface SpacingOption {
  years: number
  meetsHealthMinimum: boolean
  withinIdealRange: boolean
  collisions: StageCollision[]
  /** The heaviest single clash, which is what the household has to absorb. */
  worstCollisionFee: bigint
  verdict: SpacingVerdict
  reason: string
}

function entryFeeFor(stage: SchoolStage, track: SchoolTrack): bigint {
  const base = EDUCATION_STAGES.find((s) => s.stage === stage)
  if (!base) throw new Error(`Unknown school stage: ${stage}`)
  return base.entryFee * BigInt(TRACK_MULTIPLIERS[track].value.entry)
}

/**
 * Every spacing at which two entry fees fall in the same calendar year.
 *
 * The elder child reaches an entry age in the same year the younger reaches a
 * smaller one exactly when the spacing equals the difference between the two.
 */
export function collisionsAt(years: number, track: SchoolTrack = 'negeri'): StageCollision[] {
  const collisions: StageCollision[] = []

  for (const elder of EDUCATION_STAGES) {
    for (const younger of EDUCATION_STAGES) {
      if (elder.entryAge - younger.entryAge !== years) continue
      collisions.push({
        elderAge: elder.entryAge,
        youngerAge: younger.entryAge,
        elderStage: elder.stage,
        youngerStage: younger.stage,
        combinedFee: entryFeeFor(elder.stage, track) + entryFeeFor(younger.stage, track),
      })
    }
  }

  return collisions.sort((a, b) => (b.combinedFee > a.combinedFee ? 1 : -1))
}

function describe(option: Omit<SpacingOption, 'reason'>): string {
  const [idealLow, idealHigh] = CHILD_SPACING.idealRangeYears.value
  const minimum = CHILD_SPACING.healthMinimumYears.value

  if (!option.meetsHealthMinimum) {
    return `Under the ${minimum} years BKKBN advises between births. Whatever the schedule of fees looks like, this one is decided on health grounds first.`
  }

  if (option.collisions.length === 0) {
    return option.withinIdealRange
      ? `No entry fees fall in the same year, and ${option.years} years sits inside the ${idealLow} to ${idealHigh} band USAID identifies as ideal for both mother and child. This is the spacing that costs least without asking anything of anyone's health.`
      : `No entry fees fall in the same year. Wider than the ${idealLow} to ${idealHigh} ideal band, which is a matter of preference rather than a problem, though it does stretch the years of dependent children out further.`
  }

  const worst = option.collisions[0]
  const stages = option.collisions
    .map((c) => `${c.elderStage.toUpperCase()} dan ${c.youngerStage.toUpperCase()}`)
    .join(', ')

  return `${option.collisions.length} ${option.collisions.length === 1 ? 'clash' : 'clashes'} where two entry fees land in the same year: ${stages}. The worst of them asks for both fees at once, and the heavier the school track the harder that lands, since entry fees scale faster than annual ones. Shifting by a single year removes ${worst.elderStage.toUpperCase()} and ${worst.youngerStage.toUpperCase()} from the same budget.`
}

/** Every spacing from one year up to a limit, with what each one costs. */
export function analyseSpacing(
  maxYears = 15,
  track: SchoolTrack = 'negeri',
): SpacingOption[] {
  const minimum = CHILD_SPACING.healthMinimumYears.value
  const [idealLow, idealHigh] = CHILD_SPACING.idealRangeYears.value

  return Array.from({ length: maxYears }, (_, index) => {
    const years = index + 1
    const collisions = collisionsAt(years, track)
    const meetsHealthMinimum = years >= minimum
    const withinIdealRange = years >= idealLow && years <= idealHigh

    const verdict: SpacingVerdict =
      !meetsHealthMinimum || collisions.length > 0
        ? 'avoid'
        : withinIdealRange
          ? 'ideal'
          : 'workable'

    const partial: Omit<SpacingOption, 'reason'> = {
      years,
      meetsHealthMinimum,
      withinIdealRange,
      collisions,
      worstCollisionFee: collisions[0]?.combinedFee ?? 0n,
      verdict,
    }

    return { ...partial, reason: describe(partial) }
  })
}

export interface SpacingRecommendation {
  /** Spacings that clear both the health minimum and every fee clash. */
  recommended: number[]
  /** Those that also sit inside the published ideal band. */
  ideal: number[]
  /** Spacings that put two entry fees in one year. */
  collides: number[]
  reason: string
}

/**
 * The recommendation, worked out rather than asserted.
 *
 * Both constraints are applied and whatever survives is the answer. It happens
 * to land on four and five years, which is a pleasant result: it satisfies BKKBN
 * and USAID and avoids every fee clash at the same time. The three-year spacing
 * that most families choose is the one that looks safest on health grounds and
 * is the worst of the short options financially.
 */
export function recommendSpacing(maxYears = 15, track: SchoolTrack = 'negeri'): SpacingRecommendation {
  const options = analyseSpacing(maxYears, track)
  const recommended = options.filter((o) => o.verdict !== 'avoid').map((o) => o.years)
  const ideal = options.filter((o) => o.verdict === 'ideal').map((o) => o.years)
  const collides = options.filter((o) => o.collisions.length > 0).map((o) => o.years)

  const minimum = CHILD_SPACING.healthMinimumYears.value
  const list = (values: number[]) =>
    values.length === 0 ? 'none' : values.join(', ')

  return {
    recommended,
    ideal,
    collides,
    reason:
      ideal.length > 0
        ? `Spacing of ${list(ideal)} years clears the ${minimum}-year health minimum, sits inside the published ideal band, and puts no two entry fees in the same calendar year. Spacings of ${list(collides)} years each collide at least once, and ${minimum > 1 ? `anything under ${minimum} years is ruled out on health grounds before cost is considered` : 'health is the binding constraint at the short end'}.`
        : `No spacing satisfies every constraint at once. The ones without a fee clash are ${list(recommended)} years.`,
  }
}
