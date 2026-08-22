'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { SESSION_EXPIRED, context, fail, senField, type ActionResult } from '@/lib/actions'
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
  const { data, error } = await ctx.supabase
    .from('plans')
    .upsert(
      {
        household_id: ctx.householdId,
        income: values.income.toString(),
        adults: values.adults,
        children: values.children,
        irregular_income: values.irregularIncome,
        wants_zakat: values.wantsZakat,
        framework_id: values.frameworkId,
        track: values.track,
        target_tier: values.targetTier,
        target_savings: values.targetSavings.toString(),
        child_plans: values.childPlans,
        goal_target: values.goalTarget.toString(),
        goal_years: values.goalYears,
        goal_saved: values.goalSaved.toString(),
        hajj_monthly: values.hajjMonthly.toString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'household_id' },
    )
    .select('updated_at')

  if (error) return fail('Rencananya gagal disimpan.', error.message)
  if (!data || data.length === 0) {
    return fail('Rencananya tidak tersimpan.', 'Coba muat ulang halaman, lalu simpan lagi.')
  }

  revalidatePath('/rencana')
  return {
    ok: true,
    message: 'Rencana tersimpan.',
    detail: 'Angkanya akan terisi seperti ini saat halaman dibuka lagi.',
  }
}

export async function resetPlan(): Promise<ActionResult> {
  const ctx = await context()
  if (!ctx) return fail(SESSION_EXPIRED)

  const { data, error } = await ctx.supabase
    .from('plans')
    .delete()
    .eq('household_id', ctx.householdId)
    .select('id')

  if (error) return fail('Rencananya gagal dihapus.', error.message)

  revalidatePath('/rencana')
  // Deleting a plan that is not there is the state the caller wanted anyway.
  return {
    ok: true,
    message: data && data.length > 0 ? 'Rencana tersimpan dihapus.' : 'Belum ada rencana tersimpan.',
    detail: 'Angkanya kembali ke turunan dari riwayatmu.',
  }
}
