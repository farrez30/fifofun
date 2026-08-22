import { z } from 'zod'
import { FRAMEWORKS, type SchoolTrack } from './constants'
import type { ChildPlan } from './children'
import type { LifestyleTier } from './lifestyle'

/**
 * Everything the planner asks a person, in one shape.
 *
 * The simulator used to hold fourteen separate `useState` calls and forget all
 * of them on reload, which made it a toy: nobody sets a household profile, a
 * framework, four children and a hajj contribution twice. This is the shape
 * that gets saved, the shape that comes back, and the shape the form posts, so
 * there is one list of fields rather than three that drift apart.
 *
 * Money stays `bigint` sen here because this module is read on the server and
 * in the client island alike. `planFields` is what crosses the wire: every
 * value as a string, which is the only thing a form can carry anyway.
 */

export const SCHOOL_TRACKS = ['negeri', 'swasta', 'internasional'] as const satisfies readonly SchoolTrack[]
export const LIFESTYLE_TIERS = [
  'hemat',
  'seimbang',
  'nyaman',
  'premium',
] as const satisfies readonly LifestyleTier[]

/** The ranges the database check constraint enforces, kept readable here too. */
export const PLAN_BOUNDS = {
  adults: { min: 1, max: 2 },
  children: { min: 0, max: 4 },
  goalYears: { min: 1, max: 40 },
} as const

export interface PlanValues {
  income: bigint
  adults: number
  children: number
  irregularIncome: boolean
  wantsZakat: boolean
  frameworkId: string
  track: SchoolTrack
  targetTier: LifestyleTier
  targetSavings: bigint
  childPlans: ChildPlan[]
  goalTarget: bigint
  goalYears: number
  goalSaved: bigint
  hajjMonthly: bigint
}

export function isKnownFramework(id: string): boolean {
  return FRAMEWORKS.some((framework) => framework.id === id)
}

const childPlanSchema = z.object({
  birthYear: z.number().int().min(1900).max(2200),
  track: z.enum(SCHOOL_TRACKS),
})

/**
 * Children out of a jsonb column, without trusting it.
 *
 * The column is written by this app and read back by this app, which is
 * exactly the reasoning that lets a bad row through after one deploy that
 * changed a field name. Anything that does not parse is dropped rather than
 * thrown: a malformed child plan should cost that child's row, not the page.
 */
export function childPlansFromJson(raw: unknown): ChildPlan[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => childPlanSchema.safeParse(item))
    .filter((parsed) => parsed.success)
    .map((parsed) => parsed.data)
    .slice(0, PLAN_BOUNDS.children.max)
}

/**
 * The child list resized to a count, keeping the ones already there.
 *
 * Four years apart is the default gap, which is neither advice nor an accident:
 * it is the spacing the children panel scores as comfortable, so a household
 * that never touches the years starts from a plan that is at least coherent.
 */
export function childPlansFor(
  count: number,
  existing: ChildPlan[],
  currentYear: number,
  track: SchoolTrack,
): ChildPlan[] {
  return Array.from(
    { length: count },
    (_, index) => existing[index] ?? { birthYear: currentYear + 1 + index * 4, track },
  )
}

/** The plan a household that has never saved one is looking at. */
export function defaultPlan(income: bigint, frameworkId: string): PlanValues {
  return {
    income,
    adults: 1,
    children: 0,
    irregularIncome: false,
    wantsZakat: false,
    frameworkId,
    track: 'negeri',
    targetTier: 'seimbang',
    targetSavings: (income * 20n) / 100n,
    childPlans: [],
    goalTarget: 500_000_000_00n,
    goalYears: 10,
    goalSaved: 0n,
    hajjMonthly: 1_000_000_00n,
  }
}

/**
 * The plan as form fields.
 *
 * Money goes as plain sen digits and flags as `'0'` or `'1'`, which is what
 * `senField` and the flag schema on the other side read. Nothing here is
 * formatted for a person: these are hidden inputs, and a thousands separator
 * in one of them is a parsing bug waiting for the first household that earns
 * more than a million.
 */
export function planFields(values: PlanValues): Record<string, string> {
  return {
    income: values.income.toString(),
    adults: String(values.adults),
    children: String(values.children),
    irregularIncome: values.irregularIncome ? '1' : '0',
    wantsZakat: values.wantsZakat ? '1' : '0',
    frameworkId: values.frameworkId,
    track: values.track,
    targetTier: values.targetTier,
    targetSavings: values.targetSavings.toString(),
    childPlans: JSON.stringify(values.childPlans),
    goalTarget: values.goalTarget.toString(),
    goalYears: String(values.goalYears),
    goalSaved: values.goalSaved.toString(),
    hajjMonthly: values.hajjMonthly.toString(),
  }
}
