'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { FUND_CASHFLOWS } from '@/lib/ledger/funds'
import { createClient } from '@/lib/supabase/server'

/**
 * Setting what a pot is aiming at, and by when.
 *
 * The target is the one figure in this feature a person decides; everything
 * else is read back out of the ledger. It is written through PostgREST on the
 * user's own token, so row level security decides whether the row may be
 * touched, exactly as the import and the review queue do.
 *
 * The update is also filtered to the three fund cashflow types. Row level
 * security stops one household writing to another's categories, and nothing in
 * it stops a household putting a savings target on Makan/minum, which would put
 * a figure on the panel that no part of the app knows how to reach.
 */

/** A hundred trillion rupiah, past which the figure is a typing accident. */
const MAX_RUPIAH = 100_000_000_000_000

const schema = z.object({
  categoryId: z.uuid(),
  /** Rupiah as typed, not sen. Empty or zero clears the target. */
  amount: z.coerce.number().int().min(0).max(MAX_RUPIAH),
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Bulannya harus YYYY-MM')
    .or(z.literal(''))
    .transform((value) => (value === '' ? null : value)),
})

export interface ActionResult {
  ok: boolean
  message: string
  detail?: string
}

export async function setFundTarget(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = schema.safeParse({
    categoryId: formData.get('categoryId'),
    amount: formData.get('amount') || 0,
    month: formData.get('month') ?? '',
  })
  if (!parsed.success) {
    return { ok: false, message: 'Angkanya belum bisa dibaca.', detail: parsed.error.message }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, message: 'Sesi kamu sudah berakhir. Masuk lagi lalu ulangi.' }

  const { amount, month, categoryId } = parsed.data
  const target = amount === 0 ? null : BigInt(amount) * 100n

  const { data, error } = await supabase
    .from('categories')
    .update({
      target_amount: target === null ? null : target.toString(),
      // A deadline without a target is a date nothing is measured against.
      target_month: target === null ? null : month,
    })
    .eq('id', categoryId)
    .in('cashflow', FUND_CASHFLOWS)
    .select('id')

  if (error) return { ok: false, message: 'Targetnya gagal disimpan.', detail: error.message }
  if (!data || data.length === 0) {
    return { ok: false, message: 'Pos itu tidak bisa diberi target.' }
  }

  revalidatePath('/dana')
  return {
    ok: true,
    message: target === null ? 'Targetnya dihapus.' : 'Targetnya disimpan.',
  }
}
