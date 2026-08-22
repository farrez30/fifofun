'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import {
  SESSION_EXPIRED,
  context,
  fail,
  hhmmField,
  isoDateField,
  optionalUuid,
  positiveSen,
  type ActionResult,
} from '@/lib/actions'
import { toJakartaInstant } from '@/lib/datetime'
import { directionOf, DIRECTION_LABELS } from '@/lib/ledger/direction'
import { isBankFact, planSplit, SPLIT_MAX, SPLIT_MIN } from '@/lib/ledger/edit'
import { describeProblem, sidesFor, withinDateBounds } from '@/lib/ledger/manual'
import { validateEntry, type CashflowType, type EntrySource } from '@/lib/ledger/types'
import { formatIdr } from '@/lib/money'

/**
 * Changing one transaction after the fact.
 *
 * Two rules decide everything. What the bank said about a row cannot be
 * touched here: the amount, the date and the accounts of a statement line are
 * what the import reconciles the printed balance against, and a row that can
 * be edited into anything makes that check meaningless. What somebody decided
 * about the row, which is its category, its note and whether it was money held
 * for another person, can always be changed, because that is what the review
 * queue is for and this is the same decision made later.
 *
 * Splitting is how a bank fact gets divided without being edited. The parent
 * is hidden and its parts, adding up to it exactly, take its place. Nothing is
 * ever deleted here either: a removed row is a `deleted_at`, so a month that
 * has already been read stays the number it was.
 */

const MAX_DESCRIPTION = 140
const MAX_NOTE = 500

const editSchema = z.object({
  id: z.uuid(),
  categoryId: optionalUuid,
  description: z.string().trim().min(1, 'Keterangannya belum diisi.').max(MAX_DESCRIPTION),
  note: z.string().trim().max(MAX_NOTE),
  passThrough: z.enum(['0', '1']).transform((value) => value === '1'),
  amount: positiveSen.optional(),
  date: isoDateField.optional(),
  time: hhmmField.optional(),
  accountId: optionalUuid,
  fromAccountId: optionalUuid,
  toAccountId: optionalUuid,
})

interface Existing {
  id: string
  amount: bigint
  cashflow: CashflowType
  source: EntrySource
  description: string
  isPassThrough: boolean
  importBatchId: string | null
}

const ROW_COLUMNS =
  'id, occurred_at, amount, cashflow, source, description, from_account_id, to_account_id, is_pass_through, import_batch_id, deleted_at'

function toExisting(row: Record<string, unknown>): Existing {
  return {
    id: row.id as string,
    amount: BigInt(String(row.amount ?? '0')),
    cashflow: row.cashflow as CashflowType,
    source: row.source as EntrySource,
    description: row.description as string,
    isPassThrough: Boolean(row.is_pass_through),
    importBatchId: (row.import_batch_id as string | null) ?? null,
  }
}

export async function updateEntry(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = editSchema.safeParse({
    id: formData.get('id'),
    categoryId: formData.get('categoryId') ?? '',
    description: formData.get('description') ?? '',
    note: formData.get('note') ?? '',
    passThrough: formData.get('passThrough') ?? '0',
    ...(formData.get('amount') === null ? {} : { amount: formData.get('amount') }),
    ...(formData.get('date') === null ? {} : { date: formData.get('date') }),
    ...(formData.get('time') === null ? {} : { time: formData.get('time') }),
    accountId: formData.get('accountId') ?? '',
    fromAccountId: formData.get('fromAccountId') ?? '',
    toAccountId: formData.get('toAccountId') ?? '',
  })
  if (!parsed.success) {
    return fail('Perubahannya belum bisa disimpan.', parsed.error.issues[0]?.message)
  }

  const ctx = await context()
  if (!ctx) return fail(SESSION_EXPIRED)
  const { supabase, householdId } = ctx
  const input = parsed.data

  const { data: found } = await supabase
    .from('transactions')
    .select(ROW_COLUMNS)
    .eq('id', input.id)
    .eq('household_id', householdId)
    .is('deleted_at', null)
    .maybeSingle()
  if (!found) return fail('Transaksinya tidak ditemukan.')

  const row = toExisting(found)
  const patch: Record<string, unknown> = {
    description: input.description,
    note: input.note || null,
    is_pass_through: input.passThrough,
    confirmed_at: new Date().toISOString(),
    needs_review: false,
  }

  /*
    A transfer keeps the cashflow it has. There is no category that means
    "money moved between my own accounts" other than the transfer itself, and
    filing one under a spending category would leave a row whose account sides
    the balance check refuses.
  */
  if (row.cashflow !== 'transfer') {
    if (!input.categoryId) return fail('Pilih kategorinya.')

    const { data: category } = await supabase
      .from('categories')
      .select('id, name, cashflow')
      .eq('id', input.categoryId)
      .eq('household_id', householdId)
      .is('archived_at', null)
      .maybeSingle()
    if (!category) return fail('Kategori itu tidak ada di rumah tangga ini.')

    const cashflow = category.cashflow as CashflowType
    if (directionOf(cashflow) !== directionOf(row.cashflow)) {
      return fail(
        'Arah kategorinya tidak cocok dengan transaksinya.',
        `${category.name} untuk uang ${DIRECTION_LABELS[directionOf(cashflow)]}, sedangkan transaksi ini uang ${DIRECTION_LABELS[directionOf(row.cashflow)]}.`,
      )
    }

    patch.category_id = category.id
    patch.cashflow = cashflow
  }

  /*
    Amount, date and accounts are only read for rows somebody typed. For a
    statement row the fields are not rendered at all, and a crafted form that
    sends them anyway must not be able to move a figure the reconciliation
    depends on.
  */
  if (!isBankFact(row.source)) {
    if (input.amount === undefined || input.date === undefined || input.time === undefined) {
      return fail('Isiannya belum lengkap.', 'Nominal, tanggal dan jam harus terisi.')
    }

    const cashflow = (patch.cashflow as CashflowType | undefined) ?? row.cashflow
    const sides = sidesFor(cashflow, input)

    if (cashflow === 'transfer' && (!sides.fromAccountId || !sides.toAccountId)) {
      return fail('Pilih akunnya.', 'Perpindahan butuh akun asal dan akun tujuan.')
    }
    if (cashflow !== 'transfer' && !sides.fromAccountId && !sides.toAccountId) {
      return fail('Pilih akunnya.', 'Setiap catatan menempel pada satu akun.')
    }
    if (cashflow === 'transfer' && sides.fromAccountId === sides.toAccountId) {
      return fail(
        'Akun asal dan tujuan tidak boleh sama.',
        'Perpindahan ke akun yang sama tidak menggerakkan apa pun.',
      )
    }

    // A set, so a row naming one account on both sides is answered by the
    // sentence above rather than by a lookup that appears to find nothing.
    const ids = [
      ...new Set([sides.fromAccountId, sides.toAccountId].filter((id): id is string => Boolean(id))),
    ]
    const { data: owned } = await supabase
      .from('accounts')
      .select('id')
      .eq('household_id', householdId)
      .in('id', ids)
      .is('archived_at', null)
    if ((owned?.length ?? 0) !== ids.length) {
      return fail('Akun itu tidak ada di rumah tangga ini.')
    }

    const [year, month, day] = input.date.split('-').map(Number)
    const [hour, minute] = input.time.split(':').map(Number)
    const occurredAt = toJakartaInstant({ year, month, day }, { hour, minute, second: 0 })
    if (!withinDateBounds(occurredAt, new Date())) {
      return fail('Tanggalnya di luar jangkauan.', 'Paling lambat besok, paling awal tahun 2000.')
    }

    const problems = validateEntry({
      id: row.id,
      occurredAt,
      description: input.description,
      amount: input.amount,
      cashflow,
      categoryId: input.categoryId,
      ...sides,
      source: row.source,
    })
    if (problems.length > 0) return fail(describeProblem(problems[0]))

    patch.amount = input.amount.toString()
    patch.occurred_at = occurredAt.toISOString()
    patch.from_account_id = sides.fromAccountId
    patch.to_account_id = sides.toAccountId
  }

  const { data, error } = await supabase
    .from('transactions')
    .update(patch)
    .eq('id', row.id)
    .eq('household_id', householdId)
    .select('id')

  if (error) return fail('Perubahannya gagal disimpan.', error.message)
  if (!data || data.length === 0) return fail('Transaksinya tidak ditemukan.')

  revalidateEverywhere(row.id)
  return {
    ok: true,
    message: 'Transaksinya disimpan.',
    detail:
      input.passThrough !== row.isPassThrough
        ? 'Uang titipan tidak ikut dihitung sebagai pemasukan atau pengeluaran, tapi tetap menggerakkan saldo akun.'
        : undefined,
  }
}

const partSchema = z.object({
  amount: positiveSen,
  categoryId: z.uuid(),
  description: z.string().trim().max(MAX_DESCRIPTION),
})

export async function splitEntry(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const id = z.uuid().safeParse(formData.get('id'))
  if (!id.success) return fail('Transaksinya tidak ditemukan.')

  const parts: z.infer<typeof partSchema>[] = []
  for (let index = 0; index < SPLIT_MAX; index++) {
    const amount = formData.get(`part-${index}-amount`)
    const categoryId = formData.get(`part-${index}-categoryId`)
    if (amount === null && categoryId === null) continue

    const parsed = partSchema.safeParse({
      amount: amount ?? '',
      categoryId: categoryId ?? '',
      description: formData.get(`part-${index}-description`) ?? '',
    })
    if (!parsed.success) {
      return fail(`Bagian ${index + 1} belum lengkap.`, parsed.error.issues[0]?.message)
    }
    parts.push(parsed.data)
  }

  if (parts.length < SPLIT_MIN) {
    return fail('Isi minimal dua bagian.', 'Memisah jadi satu bagian tidak mengubah apa pun.')
  }

  const ctx = await context()
  if (!ctx) return fail(SESSION_EXPIRED)
  const { supabase, householdId } = ctx

  // Without the deleted filter: a parent that is already split is hidden, and
  // splitting it again has to be recognised rather than reported as missing.
  const { data: found } = await supabase
    .from('transactions')
    .select(ROW_COLUMNS)
    .eq('id', id.data)
    .eq('household_id', householdId)
    .maybeSingle()
  if (!found) return fail('Transaksinya tidak ditemukan.')

  const parent = toExisting(found)
  if (parent.cashflow === 'transfer') {
    return fail(
      'Perpindahan antar akun tidak bisa dipisah.',
      'Yang pindah adalah satu jumlah dari satu akun ke akun lain, dan itu tidak terbagi ke beberapa kategori.',
    )
  }

  const { data: existingChildren } = await supabase
    .from('transactions')
    .select('id')
    .eq('household_id', householdId)
    .eq('split_of', parent.id)
    .is('deleted_at', null)

  if (found.deleted_at && (existingChildren?.length ?? 0) > 0) {
    return { ok: true, message: 'Sudah dipisah sebelumnya.', applied: existingChildren?.length }
  }

  const { data: categories } = await supabase
    .from('categories')
    .select('id, name, cashflow')
    .eq('household_id', householdId)
    .in(
      'id',
      parts.map((part) => part.categoryId),
    )
    .is('archived_at', null)

  const byId = new Map((categories ?? []).map((row) => [row.id as string, row]))
  const wanted = directionOf(parent.cashflow)
  for (const part of parts) {
    const category = byId.get(part.categoryId)
    if (!category) return fail('Ada kategori yang tidak ada di rumah tangga ini.')
    if (directionOf(category.cashflow as CashflowType) !== wanted) {
      return fail(
        'Arah kategorinya tidak cocok dengan transaksinya.',
        `${category.name} untuk uang ${DIRECTION_LABELS[directionOf(category.cashflow as CashflowType)]}, sedangkan transaksi ini uang ${DIRECTION_LABELS[wanted]}.`,
      )
    }
  }

  const plan = planSplit(parent, parts)
  if (!plan.ok) {
    if (plan.problem === 'sum') {
      return fail(
        plan.difference > 0n
          ? `Masih kurang ${formatIdr(plan.difference)}.`
          : `Kelebihan ${formatIdr(-plan.difference)}.`,
        `Bagian-bagiannya harus berjumlah persis ${formatIdr(parent.amount)}, sebesar transaksi aslinya.`,
      )
    }
    if (plan.problem === 'zero') return fail('Ada bagian yang nominalnya nol.')
    return fail(`Jumlah bagiannya harus antara ${SPLIT_MIN} dan ${SPLIT_MAX}.`)
  }

  const now = new Date().toISOString()
  const children = plan.children.map((child) => ({
    household_id: householdId,
    occurred_at: found.occurred_at as string,
    description: child.description,
    amount: child.amount.toString(),
    cashflow: byId.get(child.categoryId)!.cashflow,
    category_id: child.categoryId,
    from_account_id: found.from_account_id ?? null,
    to_account_id: found.to_account_id ?? null,
    source: parent.source,
    // The parts belong to the same statement as the row they came from, so a
    // re-import of that statement sees them as already accounted for.
    import_batch_id: parent.importBatchId,
    external_ref: null,
    dedupe_key: child.dedupeKey,
    is_pass_through: parent.isPassThrough,
    needs_review: false,
    confirmed_at: now,
    split_of: parent.id,
  }))

  /*
    Merging rather than ignoring duplicates: splitting a row that was split
    before reuses the same keys, and ignoring them would leave the old parts
    in place while reporting a success.
  */
  const { error: childError } = await supabase
    .from('transactions')
    .upsert(children, { onConflict: 'household_id,dedupe_key' })
    .select('id')
  if (childError) return fail('Bagian-bagiannya gagal disimpan.', childError.message)

  /*
    A bank fee charged for the original belongs to its first part now, which is
    where a reader looking for it would go. Today the importer never fills
    `fee_parent_id` in, so this moves nothing; it is written anyway, because
    the day it does fill it in is not the day to remember that splitting
    orphans it.
  */
  const { data: firstChild } = await supabase
    .from('transactions')
    .select('id')
    .eq('household_id', householdId)
    .eq('dedupe_key', plan.children[0].dedupeKey)
    .maybeSingle()

  if (firstChild) {
    await supabase
      .from('transactions')
      .update({ fee_parent_id: firstChild.id })
      .eq('household_id', householdId)
      .eq('fee_parent_id', parent.id)
      .select('id')
  }

  const { error: parentError } = await supabase
    .from('transactions')
    .update({ deleted_at: now })
    .eq('id', parent.id)
    .eq('household_id', householdId)
    .select('id')
  if (parentError) return fail('Transaksi aslinya gagal disembunyikan.', parentError.message)

  revalidateEverywhere(parent.id)
  return {
    ok: true,
    message: `Dipisah jadi ${plan.children.length} bagian.`,
    detail: `Nominal aslinya ${formatIdr(parent.amount)} tetap ada di saldo dan rekonsiliasi, hanya dibagi ke ${plan.children.length} kategori.`,
    applied: plan.children.length,
  }
}

export async function unsplitEntry(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const id = z.uuid().safeParse(formData.get('id'))
  if (!id.success) return fail('Transaksinya tidak ditemukan.')

  const ctx = await context()
  if (!ctx) return fail(SESSION_EXPIRED)
  const { supabase, householdId } = ctx

  const { data: children } = await supabase
    .from('transactions')
    .select('id')
    .eq('household_id', householdId)
    .eq('split_of', id.data)
    .is('deleted_at', null)

  if (!children || children.length === 0) {
    // Already whole, which is the state the caller wanted.
    return { ok: true, message: 'Transaksinya sudah utuh.' }
  }

  const childIds = children.map((child) => child.id as string)
  const { data: grandchildren } = await supabase
    .from('transactions')
    .select('id')
    .eq('household_id', householdId)
    .in('split_of', childIds)
    .is('deleted_at', null)

  if ((grandchildren?.length ?? 0) > 0) {
    return fail(
      'Ada bagian yang dipisah lagi.',
      'Gabungkan dulu bagian itu, lalu gabungkan yang ini.',
    )
  }

  const now = new Date().toISOString()
  const { error: childError } = await supabase
    .from('transactions')
    .update({ deleted_at: now })
    .eq('household_id', householdId)
    .in('id', childIds)
    .select('id')
  if (childError) return fail('Bagian-bagiannya gagal disembunyikan.', childError.message)

  // Fees that followed the parts go back to the row they were charged for.
  await supabase
    .from('transactions')
    .update({ fee_parent_id: id.data })
    .eq('household_id', householdId)
    .in('fee_parent_id', childIds)
    .select('id')

  const { data, error } = await supabase
    .from('transactions')
    .update({ deleted_at: null })
    .eq('id', id.data)
    .eq('household_id', householdId)
    .select('id')
  if (error) return fail('Transaksi aslinya gagal dikembalikan.', error.message)
  if (!data || data.length === 0) return fail('Transaksinya tidak ditemukan.')

  revalidateEverywhere(id.data)
  return {
    ok: true,
    message: `Digabungkan kembali dari ${childIds.length} bagian.`,
    detail: 'Bagian-bagiannya disembunyikan, bukan dihapus.',
  }
}

/**
 * Bringing a deleted row back.
 *
 * Deleting sets a date rather than removing anything, and the page says so.
 * Until this existed that was a promise with no button behind it: a person who
 * deleted the wrong transaction was told the data was safe and given no way to
 * reach it, which is worse than an honest warning that it cannot be undone.
 *
 * Only rows somebody typed can be deleted, so only those can be restored, and
 * a row that is hidden because it was split is not restored here: that one is
 * put back by joining its parts, which is a different question.
 */
export async function restoreEntry(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const id = z.uuid().safeParse(formData.get('id'))
  if (!id.success) return fail('Transaksinya tidak ditemukan.')

  const ctx = await context()
  if (!ctx) return fail(SESSION_EXPIRED)
  const { supabase, householdId } = ctx

  const { data: children } = await supabase
    .from('transactions')
    .select('id')
    .eq('household_id', householdId)
    .eq('split_of', id.data)
    .is('deleted_at', null)

  if ((children?.length ?? 0) > 0) {
    return fail(
      'Transaksi ini sedang dipisah.',
      'Gabungkan kembali bagian-bagiannya kalau mau barisnya utuh lagi.',
    )
  }

  const { data, error } = await supabase
    .from('transactions')
    .update({ deleted_at: null })
    .eq('id', id.data)
    .eq('household_id', householdId)
    .in('source', ['manual', 'telegram'])
    .not('deleted_at', 'is', null)
    .select('id')

  if (error) return fail('Transaksinya gagal dikembalikan.', error.message)
  if (!data || data.length === 0) {
    return fail('Transaksi itu tidak ditemukan, atau memang tidak terhapus.')
  }

  revalidateEverywhere(id.data)
  return {
    ok: true,
    message: 'Transaksinya dikembalikan.',
    detail: 'Barisnya masuk lagi ke semua hitungan, persis seperti sebelum dihapus.',
  }
}

/** Every page that counts transactions is now stale, which is all of them. */
function revalidateEverywhere(id: string) {
  for (const path of ['/', '/laporan', '/tinjau', '/catat', '/dana', '/anggaran']) {
    revalidatePath(path)
  }
  revalidatePath(`/transaksi/${id}`)
}
