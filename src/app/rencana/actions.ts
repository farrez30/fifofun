'use server'

import { updateTag } from 'next/cache'
import { planTag } from '@/lib/queries/tags'
import { z } from 'zod'
import { excludedSet, json, sql } from '@/db/query'
import { SESSION_EXPIRED, context, fail, senField, writeFailed, type ActionResult } from '@/lib/actions'
import {
  LIFESTYLE_TIERS,
  PLAN_BOUNDS,
  SCHOOL_TRACKS,
  childPlansFromJson,
  isKnownFramework,
} from '@/lib/planning/plan'

/**
 * Keeping the simulation.
 *
 * The planner answered fourteen questions and forgot every one of them on
 * reload, which quietly made it a demonstration rather than a tool: nobody
 * enters a household profile, a framework, four children and a hajj
 * contribution twice. One row per household, upserted, so saving again is the
 * same operation as saving the first time.
 *
 * Nothing here is derived. Medians, ratios and the recommended framework are
 * all recomputed from the ledger on every render, and storing them would mean
 * a saved plan slowly disagreeing with the transactions underneath it. What
 * gets written is only what a person decided.
 */

const flag = z.enum(['0', '1']).transform((value) => value === '1')

const count = (min: number, max: number) =>
  z
    .string()
    .trim()
    .regex(/^\d{1,2}$/, 'Jumlahnya belum bisa dibaca.')
    .transform(Number)
    .refine((value) => value >= min && value <= max, `Jumlahnya harus antara ${min} dan ${max}.`)

/** The children list arrives as JSON, because it is the one field with a shape. */
const childPlans = z
  .string()
  .trim()
  .max(2_000, 'Rencana anaknya terlalu panjang.')
  .transform((raw, ctx) => {
    try {
      return childPlansFromJson(JSON.parse(raw))
    } catch {
      ctx.addIssue({ code: 'custom', message: 'Rencana anaknya belum bisa dibaca.' })
      return z.NEVER
    }
  })

const planSchema = z
  .object({
    income: senField,
    adults: count(PLAN_BOUNDS.adults.min, PLAN_BOUNDS.adults.max),
    children: count(PLAN_BOUNDS.children.min, PLAN_BOUNDS.children.max),
    irregularIncome: flag,
    wantsZakat: flag,
    frameworkId: z.string().trim().refine(isKnownFramework, 'Kerangkanya tidak dikenal.'),
    track: z.enum(SCHOOL_TRACKS),
    targetTier: z.enum(LIFESTYLE_TIERS),
    targetSavings: senField,
    childPlans,
    goalTarget: senField,
    goalYears: count(PLAN_BOUNDS.goalYears.min, PLAN_BOUNDS.goalYears.max),
    goalSaved: senField,
    hajjMonthly: senField,
  })
  // The count and the list are two views of the same thing, and the check
  // constraint on the table only knows about the count.
  .refine(
    (values) => values.childPlans.length === values.children,
    'Jumlah anak tidak cocok dengan rencana anaknya.',
  )

function readPlan(formData: FormData) {
  return planSchema.safeParse({
    income: formData.get('income') ?? '',
    adults: formData.get('adults') ?? '',
    children: formData.get('children') ?? '',
    irregularIncome: formData.get('irregularIncome') ?? '0',
    wantsZakat: formData.get('wantsZakat') ?? '0',
    frameworkId: formData.get('frameworkId') ?? '',
    track: formData.get('track') ?? '',
    targetTier: formData.get('targetTier') ?? '',
    targetSavings: formData.get('targetSavings') ?? '',
    childPlans: formData.get('childPlans') ?? '[]',
    goalTarget: formData.get('goalTarget') ?? '',
    goalYears: formData.get('goalYears') ?? '',
    goalSaved: formData.get('goalSaved') ?? '',
    hajjMonthly: formData.get('hajjMonthly') ?? '',
  })
}

export async function savePlan(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = readPlan(formData)
  if (!parsed.success) {
    return fail('Rencananya belum bisa disimpan.', parsed.error.issues[0]?.message)
  }

  const ctx = await context()
  if (!ctx) return fail(SESSION_EXPIRED)

  const values = parsed.data
  let data: { updated_at: string }[]
  try {
    data = await ctx.db.rows<{ updated_at: string }>(sql`
      INSERT INTO public.plans (
        household_id, income, adults, children, irregular_income, wants_zakat, framework_id,
        track, target_tier, target_savings, child_plans, goal_target, goal_years, goal_saved,
        hajj_monthly, updated_at
      ) VALUES (
        ${ctx.householdId}, ${values.income.toString()}, ${values.adults}, ${values.children},
        ${values.irregularIncome}, ${values.wantsZakat}, ${values.frameworkId}, ${values.track},
        ${values.targetTier}, ${values.targetSavings.toString()}, ${json(values.childPlans)},
        ${values.goalTarget.toString()}, ${values.goalYears}, ${values.goalSaved.toString()},
        ${values.hajjMonthly.toString()}, ${new Date().toISOString()}
      )
      ON CONFLICT (household_id) DO UPDATE SET ${excludedSet([
        'income',
        'adults',
        'children',
        'irregular_income',
        'wants_zakat',
        'framework_id',
        'track',
        'target_tier',
        'target_savings',
        'child_plans',
        'goal_target',
        'goal_years',
        'goal_saved',
        'hajj_monthly',
        'updated_at',
      ])}
      RETURNING updated_at`)
  } catch (e) {
    return writeFailed('rencana', 'Rencananya gagal disimpan.', e)
  }
  if (data.length === 0) {
    return fail('Rencananya tidak tersimpan.', 'Coba muat ulang halaman, lalu simpan lagi.')
  }

  updateTag(planTag(ctx.householdId))
  return {
    ok: true,
    message: 'Rencana tersimpan.',
    detail: 'Angkanya akan terisi seperti ini saat halaman dibuka lagi.',
  }
}

export async function resetPlan(): Promise<ActionResult> {
  const ctx = await context()
  if (!ctx) return fail(SESSION_EXPIRED)

  let data: { id: string }[]
  try {
    data = await ctx.db.rows<{ id: string }>(
      sql`DELETE FROM public.plans WHERE household_id = ${ctx.householdId} RETURNING id`,
    )
  } catch (e) {
    return writeFailed('rencana', 'Rencananya gagal dihapus.', e)
  }

  updateTag(planTag(ctx.householdId))
  // Deleting a plan that is not there is the state the caller wanted anyway.
  return {
    ok: true,
    message: data.length > 0 ? 'Rencana tersimpan dihapus.' : 'Belum ada rencana tersimpan.',
    detail: 'Angkanya kembali ke turunan dari riwayatmu.',
  }
}
