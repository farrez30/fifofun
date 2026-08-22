'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { DIRECTION_LABELS, directionOf, ruleAgreesWithDirection } from '@/lib/ledger/direction'
import { findConflict, matches, normalise, splitByDirection, type Rule } from '@/lib/ledger/rules'
import { CASHFLOW_TYPES, type CashflowType } from '@/lib/ledger/types'
import { getRules, getUnconfirmed } from '@/lib/queries/household'
import { createClient } from '@/lib/supabase/server'

/**
 * Settling a category, and teaching the app to settle the next one by itself.
 *
 * Every write goes through PostgREST rather than Drizzle, for the same reason
 * the import does: Drizzle connects as the database owner and bypasses row level
 * security entirely. Going through the user's own token means the policies
 * decide what may be written.
 *
 * Patterns arrive from a form and are run against every row in the ledger, so
 * they are length-capped and restricted to literal matching. There is no regular
 * expression match type anywhere in this feature, deliberately.
 */

const MATCH_TYPES = ['contains', 'prefix', 'exact'] as const

/** Long enough for any counterparty the bank prints, short enough to be safe. */
const MAX_PATTERN = 120

const applySchema = z.object({
  pattern: z.string().trim().min(3).max(MAX_PATTERN),
  matchType: z.enum(MATCH_TYPES),
  categoryId: z.uuid(),
  /** Store the decision as a rule so future imports settle themselves. */
  remember: z.boolean(),
})

const singleSchema = z.object({
  transactionId: z.uuid(),
  categoryId: z.uuid(),
})

export interface ActionResult {
  ok: boolean
  message: string
  detail?: string
  /** How many existing rows the decision settled. */
  applied?: number
}

function fail(message: string, detail?: string): ActionResult {
  return { ok: false, message, detail }
}

/**
 * Why a category cannot be written onto a row.
 *
 * A category carries a cashflow, and a cashflow decides which account sides a
 * row must have. Filing an outgoing payment under an income category would
 * produce exactly the shape `transactions_account_sides` refuses, and because
 * the update runs in batches of a hundred, one such row used to take ninety
 * nine correct ones down with it and report a raw Postgres message.
 */
function mismatch(categoryName: string, category: CashflowType, row: CashflowType): string {
  return `${categoryName} untuk uang ${DIRECTION_LABELS[directionOf(category)]}, transaksi ini uang ${DIRECTION_LABELS[directionOf(row)]}. Pilih kategori dengan arah yang sama.`
}

async function context() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: household } = await supabase
    .from('households')
    .select('id')
    .limit(1)
    .maybeSingle()
  if (!household) return null

  return { supabase, householdId: household.id as string }
}

/**
 * Applies a category to every unconfirmed row a pattern matches.
 *
 * The matching runs here rather than in the database. A SQL `ilike` would be
 * shorter, but it would be a second implementation of the matching rules, free
 * to disagree with the one the tests cover, and a disagreement would show up as
 * rows that a rule claims to cover and never touches.
 */
export async function applyCategory(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = applySchema.safeParse({
    pattern: formData.get('pattern'),
    matchType: formData.get('matchType'),
    categoryId: formData.get('categoryId'),
    remember: formData.get('remember') === 'on',
  })

  if (!parsed.success) {
    return fail(
      'Pilihannya belum lengkap.',
      `Pola minimal 3 huruf dan maksimal ${MAX_PATTERN}, dan kategorinya harus dipilih.`,
    )
  }

  const ctx = await context()
  if (!ctx) return fail('Sesi kamu sudah berakhir. Masuk lagi lalu ulangi.')
  const { supabase, householdId } = ctx

  const { pattern, matchType, categoryId, remember } = parsed.data

  // The category has to belong to this household, and its cashflow decides the
  // transaction's cashflow. Trusting the form for that would let a request move
  // spending into income.
  const { data: category } = await supabase
    .from('categories')
    .select('id, name, cashflow')
    .eq('household_id', householdId)
    .eq('id', categoryId)
    .maybeSingle()

  if (!category) return fail('Kategori itu tidak ada di rumah tangga ini.')

  const cashflow = category.cashflow as (typeof CASHFLOW_TYPES)[number]

  const pending = await getUnconfirmed(householdId)
  const asRule: Rule = {
    id: 'pending',
    priority: 100,
    matchType,
    pattern,
    cashflow,
    categoryId,
    autoApply: true,
    hitCount: 0,
  }

  const hits = pending.filter((row) => matches(asRule, row))
  if (hits.length === 0) {
    return fail(
      'Tidak ada transaksi yang cocok dengan pola itu.',
      'Coba persingkat polanya, atau ganti jenis pencocokan menjadi mengandung.',
    )
  }

  /*
    A counterparty that both pays and is paid matches in both directions, and
    only one of the two can take this category. The rows that agree are
    settled; the rest are left alone and counted, because they are already
    visible as their own group directly below this one. Refusing outright
    would block every mixed counterparty from ever being categorised.
  */
  const { agree, disagree } = splitByDirection(hits, cashflow)
  if (agree.length === 0) {
    return fail(
      'Arah kategorinya tidak cocok dengan transaksinya.',
      mismatch(category.name as string, cashflow, disagree[0].cashflow),
    )
  }

  /*
    Updated in chunks because PostgREST puts the id list in the query string.
    One counterparty here already accounts for 128 rows, which is a URL of some
    five kilobytes, and the limit at which a proxy starts refusing is neither
    documented nor consistent. Failing at scale on a request that works fine in
    testing is the kind of bug that only appears once the app is useful.
  */
  const CHUNK = 100
  const settledAt = new Date().toISOString()
  const ids = agree.map((row) => row.id)

  for (let start = 0; start < ids.length; start += CHUNK) {
    const { error: writeError } = await supabase
      .from('transactions')
      .update({
        category_id: categoryId,
        cashflow,
        needs_review: false,
        confirmed_at: settledAt,
        updated_at: settledAt,
      })
      .in('id', ids.slice(start, start + CHUNK))

    if (writeError) {
      return fail(
        'Gagal menyimpan kategorinya.',
        start === 0
          ? writeError.message
          : `${start} transaksi sudah tersimpan sebelum gagal. Ulangi untuk melanjutkan sisanya. ${writeError.message}`,
      )
    }
  }

  let ruleNote: string | undefined
  if (remember) {
    const existing = await getRules(householdId)
    const conflict = findConflict(existing as Rule[], {
      priority: 100,
      matchType,
      pattern,
      cashflow,
      categoryId,
      autoApply: true,
    })

    if (conflict) {
      ruleNote =
        conflict.kind === 'duplicate'
          ? `Aturan untuk "${conflict.existing.pattern}" sudah ada, jadi tidak ditambah lagi.`
          : `Aturan "${conflict.existing.pattern}" sudah lebih dulu menangkap pola ini, jadi aturan baru tidak akan pernah jalan dan tidak ditambahkan.`
    } else {
      const { error: ruleError } = await supabase.from('categorization_rules').insert({
        household_id: householdId,
        priority: 100,
        match_type: matchType,
        pattern: normalise(pattern),
        cashflow,
        category_id: categoryId,
        auto_apply: true,
        hit_count: agree.length,
      })
      ruleNote = ruleError
        ? `Kategorinya tersimpan, tapi aturannya gagal dibuat: ${ruleError.message}`
        : 'Impor berikutnya akan mengategorikan pola ini sendiri.'
    }
  }

  revalidatePath('/tinjau')
  revalidatePath('/')

  const left =
    disagree.length > 0
      ? `${disagree.length} transaksi dengan arah sebaliknya dibiarkan; kelompoknya ada di bawah.`
      : undefined

  return {
    ok: true,
    message: `${agree.length} transaksi masuk ke ${category.name as string}.`,
    detail: [ruleNote, left].filter(Boolean).join(' ') || undefined,
    applied: agree.length,
  }
}

/** Settles one transaction without teaching a rule, for genuine one-offs. */
export async function categoriseOne(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = singleSchema.safeParse({
    transactionId: formData.get('transactionId'),
    categoryId: formData.get('categoryId'),
  })
  if (!parsed.success) return fail('Transaksi atau kategorinya tidak dikenali.')

  const ctx = await context()
  if (!ctx) return fail('Sesi kamu sudah berakhir. Masuk lagi lalu ulangi.')
  const { supabase, householdId } = ctx

  const { data: category } = await supabase
    .from('categories')
    .select('id, name, cashflow')
    .eq('household_id', householdId)
    .eq('id', parsed.data.categoryId)
    .maybeSingle()
  if (!category) return fail('Kategori itu tidak ada di rumah tangga ini.')

  // The row's own direction is read from the database rather than taken from
  // the page, which may have been open since before somebody else changed it.
  const { data: row } = await supabase
    .from('transactions')
    .select('id, cashflow')
    .eq('household_id', householdId)
    .eq('id', parsed.data.transactionId)
    .is('deleted_at', null)
    .maybeSingle()
  if (!row) return fail('Transaksinya tidak ditemukan.', 'Mungkin sudah dihapus atau dipisah.')

  const rowCashflow = row.cashflow as CashflowType
  const categoryCashflow = category.cashflow as CashflowType
  if (!ruleAgreesWithDirection(categoryCashflow, rowCashflow)) {
    return fail(
      'Arah kategorinya tidak cocok dengan transaksinya.',
      mismatch(category.name as string, categoryCashflow, rowCashflow),
    )
  }

  const { error } = await supabase
    .from('transactions')
    .update({
      category_id: parsed.data.categoryId,
      cashflow: category.cashflow,
      needs_review: false,
      confirmed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', parsed.data.transactionId)

  if (error) return fail('Gagal menyimpan kategorinya.', error.message)

  revalidatePath('/tinjau')
  revalidatePath('/')
  return { ok: true, message: `Masuk ke ${category.name as string}.`, applied: 1 }
}

const deleteSchema = z.object({ ruleId: z.uuid() })

export async function deleteRule(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = deleteSchema.safeParse({ ruleId: formData.get('ruleId') })
  if (!parsed.success) return fail('Aturannya tidak dikenali.')

  const ctx = await context()
  if (!ctx) return fail('Sesi kamu sudah berakhir. Masuk lagi lalu ulangi.')

  // Deleting a rule deliberately leaves the rows it already settled alone. The
  // rule decided how future rows are read; it did not become their category.
  const { error } = await ctx.supabase
    .from('categorization_rules')
    .delete()
    .eq('id', parsed.data.ruleId)

  if (error) return fail('Gagal menghapus aturannya.', error.message)

  revalidatePath('/tinjau')
  return { ok: true, message: 'Aturannya dihapus. Kategori yang sudah tersimpan tidak berubah.' }
}
