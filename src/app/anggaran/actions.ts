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
import { diffBudgets } from '@/lib/ledger/budget-plan'
import { formatMonthKey } from '@/lib/datetime'

/**
 * Setting what a month is allowed to cost.
 *
 * The whole table is submitted at once and only the differences are written,
 * because a budget is decided as a set: raising one category usually means
 * lowering another, and saving them one at a time would leave a month
 * half-decided if a tab is closed in the middle.
 *
 * Which categories may carry a budget is checked against the database rather
 * than trusted from the form. Nothing in row level security stops a household
 * budgeting its own Gaji, and a budget on an income category would appear on
 * the dashboard as spending that never happens.
 */

const CHUNK = 100

const periodField = monthKeyField.refine(
  (value): value is string => value !== null,
  'Bulannya belum bisa dibaca.',
)

export async function saveBudgets(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const period = periodField.safeParse(formData.get('period') ?? '')
  if (!period.success) return fail('Bulannya belum bisa dibaca.')

  const submitted: Record<string, bigint | null> = {}
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith('b-')) continue
    const categoryId = key.slice(2)
    if (!z.uuid().safeParse(categoryId).success) continue

    const parsed = optionalSen.safeParse(String(value))
    if (!parsed.success) {
      return fail('Ada angka yang belum bisa dibaca.', parsed.error.issues[0]?.message)
    }
    submitted[categoryId] = parsed.data
  }

  const ctx = await context()
  if (!ctx) return fail(SESSION_EXPIRED)
  const { supabase, householdId } = ctx

  const ids = Object.keys(submitted)
  if (ids.length === 0) return { ok: true, message: 'Tidak ada yang berubah.' }

  const { data: allowed } = await supabase
    .from('categories')
    .select('id')
    .eq('household_id', householdId)
    .in('id', ids)
    .in('cashflow', ['spending', 'bills'])
    .is('archived_at', null)

  const allowedIds = new Set((allowed ?? []).map((row) => row.id as string))
  const wanted: Record<string, bigint | null> = {}
  for (const [categoryId, amount] of Object.entries(submitted)) {
    if (allowedIds.has(categoryId)) wanted[categoryId] = amount
  }

  const { data: existingRows } = await supabase
    .from('budgets')
    .select('category_id, amount')
    .eq('household_id', householdId)
    .eq('period', period.data)

  const existing: Record<string, bigint> = {}
  for (const row of existingRows ?? []) {
    existing[row.category_id as string] = BigInt(String(row.amount ?? '0'))
  }

  const diff = diffBudgets(existing, wanted)
  if (diff.upsert.length === 0 && diff.remove.length === 0) {
    return { ok: true, message: 'Tidak ada yang berubah.' }
  }

  const label = formatMonthKey(period.data)

  for (let at = 0; at < diff.upsert.length; at += CHUNK) {
    const chunk = diff.upsert.slice(at, at + CHUNK)
    const { data, error } = await supabase
      .from('budgets')
      .upsert(
        chunk.map((row) => ({
          household_id: householdId,
          period: period.data,
          category_id: row.categoryId,
          amount: row.amount.toString(),
          source: 'manual',
        })),
        { onConflict: 'household_id,period,category_id' },
      )
      .select('id')

    if (error) return partial(at, diff.upsert.length, error.message)
    if ((data?.length ?? 0) !== chunk.length) return partial(at + (data?.length ?? 0), diff.upsert.length)
  }

  for (let at = 0; at < diff.remove.length; at += CHUNK) {
    const chunk = diff.remove.slice(at, at + CHUNK)
    const { error } = await supabase
      .from('budgets')
      .delete()
      .eq('household_id', householdId)
      .eq('period', period.data)
      .in('category_id', chunk)
      .select('id')
    if (error) return fail('Sebagian anggaran gagal dihapus.', error.message)
  }

  revalidatePath('/anggaran')
  revalidatePath('/')

  return {
    ok: true,
    message: `Anggaran ${label} disimpan.`,
    detail: [
      diff.upsert.length > 0 ? `${diff.upsert.length} kategori diubah` : null,
      diff.remove.length > 0 ? `${diff.remove.length} dikosongkan` : null,
    ]
      .filter(Boolean)
      .join(', '),
    applied: diff.upsert.length + diff.remove.length,
  }
}

/** A partly written batch, said as a number rather than as a failure. */
function partial(written: number, total: number, detail?: string): ActionResult {
  return {
    ok: false,
    message: `Baru ${written} dari ${total} anggaran tersimpan.`,
    detail: detail ?? 'Muat ulang halaman untuk melihat mana yang sudah masuk, lalu ulangi.',
    applied: written,
  }
}

export async function copyBudgets(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const period = periodField.safeParse(formData.get('period') ?? '')
  const from = periodField.safeParse(formData.get('from') ?? '')
  if (!period.success || !from.success) return fail('Bulannya belum bisa dibaca.')

  const ctx = await context()
  if (!ctx) return fail(SESSION_EXPIRED)
  const { supabase, householdId } = ctx

  const { data: source } = await supabase
    .from('budgets')
    .select('category_id, amount')
    .eq('household_id', householdId)
    .eq('period', from.data)

  if (!source || source.length === 0) {
    return fail(`Tidak ada anggaran di ${formatMonthKey(from.data)} untuk disalin.`)
  }

  const { data: target } = await supabase
    .from('budgets')
    .select('category_id')
    .eq('household_id', householdId)
    .eq('period', period.data)

  // Only the gaps. A month somebody has already decided is not overwritten by
  // a convenience button.
  const taken = new Set((target ?? []).map((row) => row.category_id as string))
  const rows = source
    .filter((row) => !taken.has(row.category_id as string))
    .map((row) => ({
      household_id: householdId,
      period: period.data,
      category_id: row.category_id as string,
      amount: String(row.amount ?? '0'),
      source: 'manual',
    }))

  if (rows.length === 0) {
    return { ok: true, message: 'Sudah disalin sebelumnya.', applied: 0 }
  }

  const { error } = await supabase
    .from('budgets')
    .upsert(rows, { onConflict: 'household_id,period,category_id' })
    .select('id')

  if (error) {
    if (error.code === '23505') return { ok: true, message: 'Sudah disalin sebelumnya.' }
    return fail('Anggarannya gagal disalin.', error.message)
  }

  revalidatePath('/anggaran')
  revalidatePath('/')

  return {
    ok: true,
    message: `${rows.length} anggaran disalin dari ${formatMonthKey(from.data)}.`,
    detail: 'Kategori yang sudah punya anggaran tidak ditimpa.',
    applied: rows.length,
  }
}
