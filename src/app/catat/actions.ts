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
  senField,
  type ActionResult,
} from '@/lib/actions'
import { toJakartaInstant } from '@/lib/datetime'
import { planMerge } from '@/lib/ledger/conflicts'
import {
  adjustmentFor,
  adjustmentNote,
  describeProblem,
  manualDedupeKey,
  sidesFor,
  withinDateBounds,
} from '@/lib/ledger/manual'
import { computeAccountMovements } from '@/lib/ledger/monthly'
import { validateEntry, type CashflowType } from '@/lib/ledger/types'
import { formatIdr } from '@/lib/money'
import { getAccounts, getAllTransactions } from '@/lib/queries/household'

/**
 * The first write path in this app that creates a ledger row from a form.
 *
 * Three rules shape all of it. The cashflow is never read from the request: it
 * comes from the category row, the way the review queue already does it, so a
 * crafted form cannot move spending into income. The account sides are derived
 * from that cashflow rather than submitted, so the check constraint that
 * guards every balance cannot be reached with a stray side. And every write
 * carries a client-generated key, so a double tap on a phone with a slow
 * connection writes one row and says so.
 *
 * Deleting is `deleted_at` and never a delete. A row from the bank cannot be
 * deleted at all: the running balance the import reconciles against is built
 * from those rows, and a hole in it would make the one external check this app
 * has stop meaning anything.
 */

const MAX_DESCRIPTION = 140
const MAX_NOTE = 500

const entrySchema = z.object({
  clientId: z.uuid(),
  categoryId: z.uuid(),
  accountId: optionalUuid,
  fromAccountId: optionalUuid,
  toAccountId: optionalUuid,
  amount: positiveSen,
  date: isoDateField,
  time: hhmmField,
  description: z.string().trim().min(1, 'Keterangannya belum diisi.').max(MAX_DESCRIPTION),
  note: z
    .string()
    .trim()
    .max(MAX_NOTE)
    .transform((value) => value || null),
})

const deleteSchema = z.object({ transactionId: z.uuid() })

const adjustSchema = z.object({
  clientId: z.uuid(),
  accountId: z.uuid(),
  /** Zero is a real answer: an empty wallet is a balance like any other. */
  actual: senField,
  /** What the page showed, so a balance that moved since is caught. */
  expectedComputed: z
    .string()
    .trim()
    .regex(/^-?\d{1,21}$/, 'Saldo tercatatnya tidak terbaca.')
    .transform((digits) => BigInt(digits)),
  date: isoDateField,
})

const pairSchema = z.object({ manualId: z.uuid(), importedId: z.uuid() })

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Isiannya belum lengkap.'
}

/** Every page that shows money, since a hand-typed row moves all of them. */
function revalidateLedger() {
  revalidatePath('/')
  revalidatePath('/catat')
  revalidatePath('/laporan')
  revalidatePath('/dana')
  revalidatePath('/anggaran')
  revalidatePath('/tinjau')
  revalidatePath('/transaksi/[id]', 'page')
}

export async function recordEntry(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = entrySchema.safeParse({
    clientId: formData.get('clientId'),
    categoryId: formData.get('categoryId'),
    accountId: formData.get('accountId') ?? '',
    fromAccountId: formData.get('fromAccountId') ?? '',
    toAccountId: formData.get('toAccountId') ?? '',
    amount: formData.get('amount') ?? '',
    date: formData.get('date') ?? '',
    time: formData.get('time') ?? '',
    description: formData.get('description') ?? '',
    note: formData.get('note') ?? '',
  })
  if (!parsed.success) return fail('Isiannya belum lengkap.', firstIssue(parsed.error))

  const ctx = await context()
  if (!ctx) return fail(SESSION_EXPIRED)
  const { supabase, householdId } = ctx
  const input = parsed.data

  const { data: category } = await supabase
    .from('categories')
    .select('id, name, cashflow')
    .eq('household_id', householdId)
    .eq('id', input.categoryId)
    .is('archived_at', null)
    .maybeSingle()
  if (!category) return fail('Kategori itu tidak ada di rumah tangga ini.')

  const cashflow = category.cashflow as CashflowType
  const sides = sidesFor(cashflow, input)

  if (cashflow === 'transfer' && (!sides.fromAccountId || !sides.toAccountId)) {
    return fail('Pilih akunnya.', 'Perpindahan butuh akun asal dan akun tujuan.')
  }
  if (cashflow !== 'transfer' && !sides.fromAccountId && !sides.toAccountId) {
    return fail('Pilih akunnya.', 'Setiap catatan menempel pada satu akun.')
  }

  const ids = [sides.fromAccountId, sides.toAccountId].filter((id): id is string => Boolean(id))
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
    id: input.clientId,
    occurredAt,
    description: input.description,
    amount: input.amount,
    cashflow,
    categoryId: input.categoryId,
    ...sides,
    source: 'manual',
  })
  if (problems.length > 0) return fail(describeProblem(problems[0]))

  const now = new Date().toISOString()
  const { error } = await supabase.from('transactions').insert({
    household_id: householdId,
    occurred_at: occurredAt.toISOString(),
    description: input.description,
    amount: input.amount.toString(),
    cashflow,
    category_id: input.categoryId,
    from_account_id: sides.fromAccountId,
    to_account_id: sides.toAccountId,
    source: 'manual',
    dedupe_key: manualDedupeKey(input.clientId),
    note: input.note,
    // Typed by a person who chose the category, so there is nothing for the
    // review queue to ask about.
    confirmed_at: now,
    needs_review: false,
  })

  if (error) {
    if (error.code === '23505') {
      return {
        ok: true,
        message: 'Sudah tersimpan sebelumnya.',
        detail: 'Tombol yang ditekan dua kali tidak mencatat dua kali.',
      }
    }
    return fail('Catatannya gagal disimpan.', error.message)
  }

  revalidateLedger()
  return {
    ok: true,
    message: `${formatIdr(input.amount)} tercatat ke ${category.name as string}.`,
    applied: 1,
  }
}

export async function deleteEntry(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = deleteSchema.safeParse({ transactionId: formData.get('transactionId') })
  if (!parsed.success) return fail('Catatannya tidak dikenali.')

  const ctx = await context()
  if (!ctx) return fail(SESSION_EXPIRED)

  const { data, error } = await ctx.supabase
    .from('transactions')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', parsed.data.transactionId)
    .eq('household_id', ctx.householdId)
    // A bank row is a fact the running balance is reconciled against; hiding
    // one would make the only external check this app has stop adding up.
    .in('source', ['manual', 'telegram'])
    .is('deleted_at', null)
    .select('id')

  if (error) return fail('Gagal menghapus catatannya.', error.message)
  if (!data || data.length === 0) {
    return fail(
      'Catatan itu tidak ditemukan, atau berasal dari bank.',
      'Baris dari e-Statement tidak bisa dihapus karena rekonsiliasi saldo bergantung padanya.',
    )
  }

  revalidateLedger()
  return {
    ok: true,
    message: 'Catatannya dihapus.',
    detail: 'Barisnya disembunyikan dari semua hitungan; datanya tetap ada.',
  }
}

export async function adjustBalance(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = adjustSchema.safeParse({
    clientId: formData.get('clientId'),
    accountId: formData.get('accountId'),
    actual: formData.get('actual') ?? '',
    expectedComputed: formData.get('expectedComputed') ?? '',
    date: formData.get('date') ?? '',
  })
  if (!parsed.success) return fail('Isiannya belum lengkap.', firstIssue(parsed.error))

  const ctx = await context()
  if (!ctx) return fail(SESSION_EXPIRED)
  const { supabase, householdId } = ctx
  const input = parsed.data

  const accounts = await getAccounts(householdId)
  const account = accounts.find((candidate) => candidate.id === input.accountId)
  if (!account) return fail('Akun itu tidak ada di rumah tangga ini.')

  // Recomputed here rather than trusted from the form: the figure decides how
  // large the correction is, and a page open in another tab may be stale.
  const movements = computeAccountMovements(await getAllTransactions(householdId), accounts)
  const closing = movements.find((movement) => movement.accountId === account.id)?.closing ?? 0n
  if (closing !== input.expectedComputed) {
    return fail(
      'Saldo akun ini berubah sejak halaman dibuka.',
      `Sekarang tercatat ${formatIdr(closing)}. Muat ulang halaman, lalu ulangi.`,
    )
  }

  const adjustment = adjustmentFor(closing, input.actual)
  if (!adjustment) {
    return { ok: true, message: 'Saldonya sudah sama. Tidak ada yang ditulis.' }
  }

  let categoryId: string | null = null
  const { data: existing } = await supabase
    .from('categories')
    .select('id')
    .eq('household_id', householdId)
    .eq('cashflow', adjustment.cashflow)
    .eq('name', adjustment.categoryName)
    .is('archived_at', null)
    .maybeSingle()

  if (existing) {
    categoryId = existing.id as string
  } else {
    const { data: created, error: createError } = await supabase
      .from('categories')
      .insert({
        household_id: householdId,
        name: adjustment.categoryName,
        cashflow: adjustment.cashflow,
      })
      .select('id')
      .maybeSingle()
    if (!created) {
      return fail('Kategori penyesuaian belum ada dan gagal dibuat.', createError?.message)
    }
    categoryId = created.id as string
  }

  const [year, month, day] = input.date.split('-').map(Number)
  // Late in the day, so the correction lands after whatever it is correcting.
  const occurredAt = toJakartaInstant({ year, month, day }, { hour: 23, minute: 59, second: 0 })
  if (!withinDateBounds(occurredAt, new Date())) {
    return fail('Tanggalnya di luar jangkauan.', 'Paling lambat besok, paling awal tahun 2000.')
  }

  const size = adjustment.delta < 0n ? -adjustment.delta : adjustment.delta
  const sides = sidesFor(adjustment.cashflow, { accountId: account.id })
  const now = new Date().toISOString()

  const { error } = await supabase.from('transactions').insert({
    household_id: householdId,
    occurred_at: occurredAt.toISOString(),
    description: `Penyesuaian saldo ${account.name}`,
    amount: size.toString(),
    cashflow: adjustment.cashflow,
    category_id: categoryId,
    from_account_id: sides.fromAccountId,
    to_account_id: sides.toAccountId,
    source: 'manual',
    dedupe_key: manualDedupeKey(input.clientId),
    note: adjustmentNote(account.name, closing, input.actual),
    confirmed_at: now,
    needs_review: false,
  })

  if (error) {
    if (error.code === '23505') {
      return { ok: true, message: 'Penyesuaiannya sudah tercatat sebelumnya.' }
    }
    return fail('Penyesuaiannya gagal disimpan.', error.message)
  }

  revalidateLedger()
  return {
    ok: true,
    message: `Saldo ${account.name} ${adjustment.delta < 0n ? 'dikurangi' : 'ditambah'} ${formatIdr(size)}.`,
    detail: 'Tercatat sebagai transaksi penyesuaian, bukan perubahan saldo awal.',
    applied: 1,
  }
}

const MERGE_DETAIL = {
  'category-and-note': 'Kategori dan catatan dari entri manual dipindahkan ke baris bank.',
  note: 'Hanya catatannya yang dipindahkan: baris bank sudah dipastikan kategorinya.',
  nothing: 'Tidak ada yang perlu dipindahkan dari catatan manualnya.',
} as const

export async function mergeDuplicate(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = pairSchema.safeParse({
    manualId: formData.get('manualId'),
    importedId: formData.get('importedId'),
  })
  if (!parsed.success) return fail('Pasangannya tidak dikenali.')

  const ctx = await context()
  if (!ctx) return fail(SESSION_EXPIRED)
  const { supabase, householdId } = ctx
  const { manualId, importedId } = parsed.data

  const { data: rows } = await supabase
    .from('transactions')
    .select('id, source, cashflow, category_id, note, confirmed_at, duplicate_of, deleted_at')
    .eq('household_id', householdId)
    .in('id', [manualId, importedId])

  const manual = rows?.find((row) => row.id === manualId)
  const imported = rows?.find((row) => row.id === importedId)

  // Pressing the button twice, or having done it in another tab, is a state
  // that already holds rather than an error.
  if (manual?.deleted_at && manual.duplicate_of === importedId) {
    return { ok: true, message: 'Sudah digabungkan sebelumnya.' }
  }
  if (!manual || !imported || manual.source !== 'manual' || imported.source === 'manual') {
    return fail('Pasangan itu tidak ditemukan lagi.', 'Mungkin sudah diselesaikan di tab lain.')
  }
  if (manual.duplicate_of !== importedId || manual.deleted_at || imported.deleted_at) {
    return fail('Pasangan itu tidak ditemukan lagi.', 'Mungkin sudah diselesaikan di tab lain.')
  }

  let categoryCashflow: CashflowType | null = null
  if (manual.category_id) {
    const { data: category } = await supabase
      .from('categories')
      .select('cashflow')
      .eq('household_id', householdId)
      .eq('id', manual.category_id)
      .maybeSingle()
    categoryCashflow = (category?.cashflow as CashflowType | undefined) ?? null
  }

  const now = new Date()
  const decision = planMerge(
    {
      cashflow: manual.cashflow as CashflowType,
      categoryId: (manual.category_id as string | null) ?? null,
      note: (manual.note as string | null) ?? null,
      confirmedAt: manual.confirmed_at ? new Date(manual.confirmed_at as string) : null,
    },
    categoryCashflow,
    {
      cashflow: imported.cashflow as CashflowType,
      categoryId: (imported.category_id as string | null) ?? null,
      note: (imported.note as string | null) ?? null,
      confirmedAt: imported.confirmed_at ? new Date(imported.confirmed_at as string) : null,
    },
    now,
  )

  if (decision.importedPatch) {
    const { error } = await supabase
      .from('transactions')
      .update(decision.importedPatch)
      .eq('id', importedId)
      .eq('household_id', householdId)
      .select('id')
    if (error) return fail('Gagal memindahkan kategorinya ke baris bank.', error.message)
  }

  const { error: hideError } = await supabase
    .from('transactions')
    .update({ deleted_at: now.toISOString() })
    .eq('id', manualId)
    .eq('household_id', householdId)
    .select('id')
  if (hideError) {
    return fail('Kategorinya pindah, tapi catatan manualnya gagal dihapus.', hideError.message)
  }

  revalidateLedger()
  return {
    ok: true,
    message: 'Digabungkan. Baris dari bank yang dipakai, catatan manualnya dihapus.',
    detail: MERGE_DETAIL[decision.adopted],
    applied: 1,
  }
}

export async function keepBoth(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = pairSchema.safeParse({
    manualId: formData.get('manualId'),
    importedId: formData.get('importedId'),
  })
  if (!parsed.success) return fail('Pasangannya tidak dikenali.')

  const ctx = await context()
  if (!ctx) return fail(SESSION_EXPIRED)
  const { supabase, householdId } = ctx

  const { data, error } = await supabase
    .from('transactions')
    .update({ duplicate_of: null })
    .eq('id', parsed.data.manualId)
    .eq('household_id', householdId)
    .eq('source', 'manual')
    .eq('duplicate_of', parsed.data.importedId)
    .select('id')

  if (error) return fail('Gagal menyimpan keputusannya.', error.message)

  if (!data || data.length === 0) {
    // Either it was already decided, or the pair never existed. Reading the row
    // tells the two apart, and only one of them is a failure.
    const { data: manual } = await supabase
      .from('transactions')
      .select('id, duplicate_of')
      .eq('household_id', householdId)
      .eq('id', parsed.data.manualId)
      .maybeSingle()
    if (manual && manual.duplicate_of === null) {
      return { ok: true, message: 'Keduanya sudah dipertahankan.' }
    }
    return fail('Pasangan itu tidak ditemukan lagi.', 'Mungkin sudah diselesaikan di tab lain.')
  }

  revalidatePath('/tinjau')
  revalidatePath('/catat')
  return {
    ok: true,
    message: 'Keduanya dipertahankan sebagai dua transaksi berbeda.',
    applied: 1,
  }
}
