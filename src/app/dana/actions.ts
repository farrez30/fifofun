'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import {
  SESSION_EXPIRED,
  context,
  fail,
  monthKeyField,
  optionalSen,
  type ActionResult,
} from '@/lib/actions'
import { FUND_CASHFLOWS } from '@/lib/ledger/funds'

/**
 * What a pot is aiming at, and how it means to get there.
 *
 * A goal can be stated from either end and the two are the same sentence read
 * in opposite directions: fifty million by March, or four million a month.
 * Only one of them used to be sayable here, which quietly assumed every goal
 * starts with a deadline. Most of them start with what a person can spare.
 *
 * Both ends may be set at once, and that is the useful case rather than a
 * conflict: with a deadline and an intended contribution the panel can say
 * whether the plan makes it, instead of judging a new intention by six months
 * of history that predates it.
 *
 * The update is filtered to the three fund cashflow types. Row level security
 * stops one household writing to another's categories, and nothing in it stops
 * a household putting a savings target on Makan/minum, which would put a figure
 * on the panel that no part of the app knows how to reach.
 */

/** A share of income in basis points, which is what the percent field posts. */
const shareBp = z
  .string()
  .trim()
  .transform((value) => (value === '' ? null : Number(value)))
  .pipe(z.number().int().min(0).max(10_000).nullable())

const schema = z.object({
  categoryId: z.uuid(),
  /** Which end of the goal the form was filled from. */
  mode: z.enum(['tenggat', 'setoran']),
  amount: optionalSen,
  month: monthKeyField,
  monthly: optionalSen,
  share: shareBp,
})

export async function setFundTarget(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = schema.safeParse({
    categoryId: formData.get('categoryId'),
    mode: formData.get('mode') ?? 'tenggat',
    amount: formData.get('amount') ?? '',
    month: formData.get('month') ?? '',
    monthly: formData.get('monthly') ?? '',
    share: formData.get('share') ?? '',
  })
  if (!parsed.success) {
    return fail('Angkanya belum bisa dibaca.', parsed.error.issues[0]?.message)
  }

  const { categoryId, mode, amount, month, monthly, share } = parsed.data
  if (mode === 'setoran' && monthly !== null && share !== null) {
    return fail(
      'Isi salah satu saja.',
      'Setoran bisa ditulis sebagai jumlah per bulan atau sebagai persentase penghasilan, tidak keduanya.',
    )
  }

  const ctx = await context()
  if (!ctx) return fail(SESSION_EXPIRED)

  const patch: Record<string, unknown> = { target_amount: amount === null ? null : amount.toString() }
  if (mode === 'tenggat') {
    // A deadline without a target is a date nothing is measured against.
    patch.target_month = amount === null ? null : month
  } else {
    patch.planned_monthly = monthly === null ? null : monthly.toString()
    patch.planned_share_bp = share
    if (amount === null) patch.target_month = null
  }

  const { data, error } = await ctx.supabase
    .from('categories')
    .update(patch)
    .eq('id', categoryId)
    .eq('household_id', ctx.householdId)
    .in('cashflow', FUND_CASHFLOWS)
    .select('id')

  if (error) return fail('Targetnya gagal disimpan.', error.message)
  if (!data || data.length === 0) return fail('Pos itu tidak bisa diberi target.')

  revalidatePath('/dana')
  revalidatePath('/')

  if (mode === 'setoran') {
    return {
      ok: true,
      message:
        monthly === null && share === null
          ? 'Rencana setorannya dihapus.'
          : 'Rencana setorannya disimpan.',
      detail: 'Perkiraan tercapainya dihitung dari sisa target dibagi setoran itu.',
    }
  }

  return {
    ok: true,
    message: amount === null ? 'Targetnya dihapus.' : 'Targetnya disimpan.',
    detail:
      amount !== null && month === null
        ? 'Tanpa tenggat, yang dihitung adalah perkiraan tercapainya, bukan kurang berapa per bulan.'
        : undefined,
  }
}
