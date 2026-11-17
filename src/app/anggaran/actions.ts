'use server'

import { updateTag } from 'next/cache'
import { budgetsTag } from '@/lib/queries/tags'
import { z } from 'zod'
import {
  SESSION_EXPIRED,
  context,
  fail,
  monthKeyField,
  optionalSen,
  writeFailed,
  type ActionResult,
} from '@/lib/actions'
import { diffBudgets } from '@/lib/ledger/budget-plan'
import { formatMonthKey } from '@/lib/datetime'
import { formatWeek, isMonday } from '@/lib/ledger/carry'
import { excludedSet, sql } from '@/db/query'

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
  const { db, householdId } = ctx

  const ids = Object.keys(submitted)
  if (ids.length === 0) return { ok: true, message: 'Tidak ada yang berubah.' }

  // Both reads fall back to nothing, as they always have: with no allowed ids
  // nothing is written.
  const allowed = await db
    .rows<{ id: string }>(sql`
      SELECT id FROM public.categories
      WHERE household_id = ${householdId}
        AND id = ANY(${sql.param(ids)}::uuid[])
        AND cashflow IN ('spending', 'bills')
        AND archived_at IS NULL`)
    .catch(() => [])
  const existingRows = await db
    .rows<{ category_id: string; amount: unknown }>(sql`
      SELECT category_id, amount FROM public.budgets
      WHERE household_id = ${householdId} AND period = ${period.data}`)
    .catch(() => [])

  const allowedIds = new Set(allowed.map((row) => row.id))
  const wanted: Record<string, bigint | null> = {}
  for (const [categoryId, amount] of Object.entries(submitted)) {
    if (allowedIds.has(categoryId)) wanted[categoryId] = amount
  }

  const existing: Record<string, bigint> = {}
  for (const row of existingRows) {
    existing[row.category_id] = BigInt(String(row.amount ?? '0'))
  }

  const diff = diffBudgets(existing, wanted)
  if (diff.upsert.length === 0 && diff.remove.length === 0) {
    return { ok: true, message: 'Tidak ada yang berubah.' }
  }

  const label = formatMonthKey(period.data)

  for (let at = 0; at < diff.upsert.length; at += CHUNK) {
    const chunk = diff.upsert.slice(at, at + CHUNK)
    let data: { id: string }[]
    try {
      data = await db.rows<{ id: string }>(
        upsertBudgets(
          chunk.map((row) => ({
            household_id: householdId,
            period: period.data,
            category_id: row.categoryId,
            amount: row.amount.toString(),
            source: 'manual',
          })),
        ),
      )
    } catch (error) {
      console.error('[anggaran] gagal menulis sebagian batch anggaran', error)
      return partial(at, diff.upsert.length)
    }
    if (data.length !== chunk.length) return partial(at + data.length, diff.upsert.length)
  }

  for (let at = 0; at < diff.remove.length; at += CHUNK) {
    const chunk = diff.remove.slice(at, at + CHUNK)
    try {
      await db.rows(sql`
        DELETE FROM public.budgets
        WHERE household_id = ${householdId}
          AND period = ${period.data}
          AND category_id = ANY(${sql.param(chunk)}::uuid[])
        RETURNING id`)
    } catch (error) {
      return writeFailed('anggaran', 'Sebagian anggaran gagal dihapus.', error)
    }
  }

  updateTag(budgetsTag(householdId))

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

/** The upsert both actions write with: one row per category and month. */
function upsertBudgets(rows: BudgetWrite[]) {
  const values = sql.join(
    rows.map((r) => sql`(${r.household_id}, ${r.period}, ${r.category_id}, ${r.amount}, ${r.source})`),
    sql`, `,
  )
  return sql`
    INSERT INTO public.budgets (household_id, period, category_id, amount, source) VALUES ${values}
    ON CONFLICT (household_id, period, category_id) DO UPDATE SET ${excludedSet(['amount', 'source'])}
    RETURNING id`
}

interface BudgetWrite {
  household_id: string
  period: string
  category_id: string
  amount: string
  source: string
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
  const { db, householdId } = ctx

  const source = await db
    .rows<{ category_id: string; amount: unknown }>(sql`
      SELECT category_id, amount FROM public.budgets
      WHERE household_id = ${householdId} AND period = ${from.data}`)
    .catch(() => [])

  if (source.length === 0) {
    return fail(`Tidak ada anggaran di ${formatMonthKey(from.data)} untuk disalin.`)
  }

  const target = await db
    .rows<{ category_id: string }>(sql`
      SELECT category_id FROM public.budgets
      WHERE household_id = ${householdId} AND period = ${period.data}`)
    .catch(() => [])

  // Only the gaps. A month somebody has already decided is not overwritten by
  // a convenience button.
  const taken = new Set(target.map((row) => row.category_id))
  const rows = source
    .filter((row) => !taken.has(row.category_id))
    .map((row) => ({
      household_id: householdId,
      period: period.data,
      category_id: row.category_id,
      amount: String(row.amount ?? '0'),
      source: 'manual',
    }))

  if (rows.length === 0) {
    return { ok: true, message: 'Sudah disalin sebelumnya.', applied: 0 }
  }

  try {
    await db.rows(upsertBudgets(rows))
  } catch (error) {
    if ((error as { code?: string }).code === '23505') return { ok: true, message: 'Sudah disalin sebelumnya.' }
    return writeFailed('anggaran', 'Anggarannya gagal disalin.', error)
  }

  updateTag(budgetsTag(householdId))

  return {
    ok: true,
    message: `${rows.length} anggaran disalin dari ${formatMonthKey(from.data)}.`,
    detail: 'Kategori yang sudah punya anggaran tidak ditimpa.',
    applied: rows.length,
  }
}

/**
 * A weekly budget for one category, from one Monday.
 *
 * `seterusnya` sets the standing figure from that week until another standing
 * figure replaces it; `minggu-ini` is an exception for that week alone, after
 * which the standing figure holds again. Hapus (or an emptied field) removes
 * the row of that kind on that Monday, which is how an exception is taken back.
 */
export async function saveWeeklyBudget(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const categoryId = z.uuid().safeParse(String(formData.get('categoryId') ?? ''))
  if (!categoryId.success) return fail('Kategorinya belum dipilih.')
  const weekStart = String(formData.get('weekStart') ?? '')
  if (!isMonday(weekStart)) return fail('Mingguannya belum bisa dibaca.')
  const scope = formData.get('scope')
  if (scope !== 'seterusnya' && scope !== 'minggu-ini') return fail('Pilih berlaku untuk minggu yang mana.')
  const ongoing = scope === 'seterusnya'
  // Hapus submits the same form; it removes whatever the field says.
  const removing = formData.get('hapus') === '1'
  const amount = optionalSen.safeParse(removing ? '' : String(formData.get('amount') ?? ''))
  if (!amount.success) return fail('Angkanya belum bisa dibaca.', amount.error.issues[0]?.message)

  const ctx = await context()
  if (!ctx) return fail(SESSION_EXPIRED)
  const { db, householdId } = ctx

  // Re-read for this household, as saveBudgets does: RLS alone would let a
  // household budget its own Gaji.
  const allowed = await db
    .maybeOne<{ id: string }>(sql`
      SELECT id FROM public.categories
      WHERE household_id = ${householdId}
        AND id = ${categoryId.data}
        AND cashflow IN ('spending', 'bills')
        AND archived_at IS NULL`)
    .catch(() => null)
  if (!allowed) return fail('Kategori ini tidak bisa diberi anggaran.')

  const week = formatWeek(weekStart)

  if (amount.data === null) {
    try {
      const removed = await db.rows(sql`
        DELETE FROM public.weekly_budgets
        WHERE household_id = ${householdId}
          AND category_id = ${categoryId.data}
          AND week_start = ${weekStart}
          AND ongoing = ${ongoing}
        RETURNING id`)
      if (removed.length === 0) return { ok: true, message: 'Tidak ada yang berubah.' }
    } catch (error) {
      return writeFailed('anggaran', 'Anggaran mingguannya gagal dihapus.', error)
    }
    updateTag(budgetsTag(householdId))
    return { ok: true, message: `Anggaran mingguan ${week} dihapus.`, applied: 1 }
  }

  try {
    await db.rows(sql`
      INSERT INTO public.weekly_budgets (household_id, category_id, week_start, amount, ongoing)
      VALUES (${householdId}, ${categoryId.data}, ${weekStart}, ${amount.data.toString()}, ${ongoing})
      ON CONFLICT (household_id, category_id, week_start, ongoing) DO UPDATE SET ${excludedSet(['amount'])}
      RETURNING id`)
  } catch (error) {
    return writeFailed('anggaran', 'Anggaran mingguannya gagal disimpan.', error)
  }

  updateTag(budgetsTag(householdId))
  return {
    ok: true,
    message: ongoing
      ? `Anggaran mingguan disimpan, berlaku mulai ${week}.`
      : `Anggaran khusus ${week} disimpan.`,
    applied: 1,
  }
}
