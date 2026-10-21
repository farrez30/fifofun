'use server'

import { updateTag } from 'next/cache'
import { rulesTag, txTag } from '@/lib/queries/tags'
import { z } from 'zod'
import { insertInto, sql, type Scope } from '@/db/query'
import { directionRefusal, ruleAgreesWithDirection } from '@/lib/ledger/direction'
import { findConflict, matches, normalise, splitByDirection, type Rule } from '@/lib/ledger/rules'
import { CASHFLOW_TYPES, type CashflowType } from '@/lib/ledger/types'
import { resolveTidy } from '@/lib/ledger/tidy'
import { groupRefusal } from '@/lib/queries/categories'
import { getRules, getUnconfirmed } from '@/lib/queries/household'
import { planLedgerTidy } from '@/lib/queries/tidy'
import { SESSION_EXPIRED, WRITE_FAILED, context } from '@/lib/actions'

/**
 * Settling a category, and teaching the app to settle the next one by itself.
 *
 * Every write runs in the signed-in user's own scope, for the same reason the
 * import does: the database owner bypasses row level security entirely, and
 * the user's scope means the policies decide what may be written.
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

/** Tidying the whole plan at once, as opposed to one move out of it. */
const SCOPE_ALL = 'semua'

/** Per-row decisions arrive as `pilih:<transaction id>`. */
const CHOICE_PREFIX = 'pilih:'

/**
 * More rows than the largest move holds, and far short of a request worth
 * worrying about. The cap belongs here because the field names come from a
 * form, and nothing else bounds how many of them may be sent.
 */
const MAX_CHOICES = 500

export interface ActionResult {
  ok: boolean
  message: string
  detail?: string
  /** How many existing rows the decision settled. */
  applied?: number
  /** Which move was run, so the panel can put the reply beside its button. */
  scope?: string
}

function fail(message: string, detail?: string): ActionResult {
  return { ok: false, message, detail }
}

interface CategoryRow {
  id: string
  name: string
  cashflow: CashflowType
}

/** A live category of this household, or null; a failed read answers like a missing one. */
function liveCategory(db: Scope, householdId: string, categoryId: string) {
  return db
    .maybeOne<CategoryRow>(
      sql`SELECT id, name, cashflow FROM public.categories
          WHERE household_id = ${householdId} AND id = ${categoryId} AND archived_at IS NULL`,
    )
    .catch(() => null)
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
  if (!ctx) return fail(SESSION_EXPIRED)
  const { db, householdId } = ctx

  const { pattern, matchType, categoryId, remember } = parsed.data

  // The category has to belong to this household, and its cashflow decides the
  // transaction's cashflow. Trusting the form for that would let a request move
  // spending into income. Archived rows are refused the same way the entry and
  // edit forms refuse them: retired means retired everywhere, not everywhere
  // except here.
  const category = await liveCategory(db, householdId, categoryId)

  if (!category) return fail('Kategori itu tidak ada di rumah tangga ini.')

  const isGroup = await groupRefusal(householdId, categoryId, category.name)
  if (isGroup) return fail('Kelompok tidak bisa dipakai langsung.', isGroup)

  const cashflow: (typeof CASHFLOW_TYPES)[number] = category.cashflow

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
      directionRefusal(category.name, cashflow, disagree[0].cashflow),
    )
  }

  // One statement: the id list is a single array parameter, so there is no
  // URL to outgrow, and the rows settle together or not at all.
  const settledAt = new Date().toISOString()
  const ids = agree.map((row) => row.id)

  try {
    await settle(db, householdId, ids, { categoryId, cashflow }, settledAt)
  } catch (e) {
    console.error('[tinjau] gagal menyimpan kategori', e)
    return fail('Gagal menyimpan kategorinya.', WRITE_FAILED)
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
      try {
        await db.rows(
          insertInto('categorization_rules', {
            household_id: householdId,
            priority: 100,
            match_type: matchType,
            pattern: normalise(pattern),
            cashflow,
            category_id: categoryId,
            auto_apply: true,
            hit_count: agree.length,
          }),
        )
        ruleNote = 'Impor berikutnya akan mengategorikan pola ini sendiri.'
      } catch (e) {
        console.error('[tinjau] gagal membuat aturan', e)
        ruleNote = 'Kategorinya tersimpan, tapi aturannya gagal dibuat.'
      }
    }
  }

  // Rules too: a remembered pattern was just written above.
  updateTag(txTag(householdId))
  updateTag(rulesTag(householdId))

  const left =
    disagree.length > 0
      ? `${disagree.length} transaksi dengan arah sebaliknya dibiarkan; kelompoknya ada di bawah.`
      : undefined

  return {
    ok: true,
    message: `${agree.length} transaksi masuk ke ${category.name}.`,
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
  if (!ctx) return fail(SESSION_EXPIRED)
  const { db, householdId } = ctx

  const category = await liveCategory(db, householdId, parsed.data.categoryId)
  if (!category) return fail('Kategori itu tidak ada di rumah tangga ini.')

  const isGroup = await groupRefusal(householdId, parsed.data.categoryId, category.name)
  if (isGroup) return fail('Kelompok tidak bisa dipakai langsung.', isGroup)

  // The row's own direction is read from the database rather than taken from
  // the page, which may have been open since before somebody else changed it.
  const row = await db
    .maybeOne<{ id: string; cashflow: CashflowType }>(
      sql`SELECT id, cashflow FROM public.transactions
          WHERE household_id = ${householdId} AND id = ${parsed.data.transactionId} AND deleted_at IS NULL`,
    )
    .catch(() => null)
  if (!row) return fail('Transaksinya tidak ditemukan.', 'Mungkin sudah dihapus atau dipisah.')

  const rowCashflow = row.cashflow
  const categoryCashflow = category.cashflow
  if (!ruleAgreesWithDirection(categoryCashflow, rowCashflow)) {
    return fail(
      'Arah kategorinya tidak cocok dengan transaksinya.',
      directionRefusal(category.name, categoryCashflow, rowCashflow),
    )
  }

  try {
    await settle(
      db,
      householdId,
      [parsed.data.transactionId],
      { categoryId: parsed.data.categoryId, cashflow: category.cashflow },
      new Date().toISOString(),
    )
  } catch (e) {
    console.error('[tinjau] gagal menyimpan kategori', e)
    return fail('Gagal menyimpan kategorinya.', WRITE_FAILED)
  }

  updateTag(txTag(householdId))
  return { ok: true, message: `Masuk ke ${category.name}.`, applied: 1 }
}

const deleteSchema = z.object({ ruleId: z.uuid() })

export async function deleteRule(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = deleteSchema.safeParse({ ruleId: formData.get('ruleId') })
  if (!parsed.success) return fail('Aturannya tidak dikenali.')

  const ctx = await context()
  if (!ctx) return fail(SESSION_EXPIRED)

  // Deleting a rule deliberately leaves the rows it already settled alone. The
  // rule decided how future rows are read; it did not become their category.
  try {
    await ctx.db.rows(sql`
      DELETE FROM public.categorization_rules
      WHERE id = ${parsed.data.ruleId} AND household_id = ${ctx.householdId}
      RETURNING id`)
  } catch (e) {
    console.error('[tinjau] gagal menghapus aturan', e)
    return fail('Gagal menghapus aturannya.', WRITE_FAILED)
  }

  updateTag(rulesTag(ctx.householdId))
  return { ok: true, message: 'Aturannya dihapus. Kategori yang sudah tersimpan tidak berubah.' }
}


/**
 * Runs every rule over the whole ledger, not just the queue.
 *
 * A rule has always stopped at the unconfirmed rows, which is right when the
 * rule is new and wrong when the rules were the problem. This ledger had every
 * QRIS payment stamped as a meal on the way in, so the rows most in need of a
 * better rule were the ones a rule could not reach.
 *
 * Three things keep that safe. Only rows still sitting in one of the importer's
 * parking categories are eligible, so nothing anybody chose is overwritten. The
 * plan is computed and shown before it is written, by the same pure function on
 * both sides, so the figures under the button are the figures applied. And the
 * plan is recomputed here rather than taken from the form: a person may redirect
 * a row inside it or hold one back, never add one to it.
 */
export async function tidyLedger(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const scope = String(formData.get('scope') ?? SCOPE_ALL)

  // Every refusal below names the move it came from, so the panel can put it
  // under the button that was pressed rather than at the foot of the table.
  const stop = (message: string, detail?: string): ActionResult => ({
    ...fail(message, detail),
    scope,
  })

  /*
    A whole ledger at once is more than anybody can read, so that button asks
    for the checkbox. A single move is a list somebody had to open to reach the
    button underneath it, and the button names the pot and the count itself, so
    a checkbox there would be friction standing in for consent already given.
  */
  if (scope === SCOPE_ALL && formData.get('confirm') !== 'ya') {
    return stop('Perapian belum dijalankan.', 'Centang dulu persetujuannya.')
  }

  const choices = new Map<string, string>()
  for (const [field, value] of formData.entries()) {
    if (!field.startsWith(CHOICE_PREFIX) || typeof value !== 'string') continue
    if (choices.size >= MAX_CHOICES) {
      return stop(
        'Terlalu banyak perubahan sekaligus.',
        `Paling banyak ${MAX_CHOICES} baris dalam satu kali jalan. Jalankan per pindahan saja.`,
      )
    }
    choices.set(field.slice(CHOICE_PREFIX.length), value)
  }

  const ctx = await context()
  if (!ctx) return stop(SESSION_EXPIRED)
  const { db, householdId } = ctx

  const { plan, targets, groups } = await planLedgerTidy(householdId)
  const resolved = resolveTidy(plan, choices, targets, groups, scope === SCOPE_ALL ? null : scope)

  if (resolved.count === 0 && resolved.held.length === 0) {
    return {
      ok: resolved.rejected.length === 0,
      message:
        resolved.rejected.length > 0
          ? 'Tidak ada yang bisa dipindahkan.'
          : 'Tidak ada yang perlu dipindahkan.',
      detail:
        resolved.rejected[0]?.reason ?? 'Setiap transaksi sudah berada di pos yang ditunjuk aturan.',
      applied: 0,
      scope,
    }
  }

  // One statement per destination pot, so a failure stops between pots and
  // the count of what already moved is exact.
  const settledAt = new Date().toISOString()
  let written = 0

  for (const write of resolved.writes) {
    try {
      await settle(db, householdId, write.ids, write, settledAt)
    } catch (e) {
      console.error('[tinjau] perapian berhenti', e)
      return stop(
        'Perapian berhenti di tengah jalan.',
        `${written} transaksi sudah dipindahkan. Jalankan lagi untuk melanjutkan sisanya.`,
      )
    }
    written += write.ids.length
  }

  // A held row keeps its category. The stamp only stops tidying from offering
  // to move it again, which is the difference between a decision and a default.
  if (resolved.held.length > 0) {
    try {
      await db.rows(sql`
        UPDATE public.transactions SET category_locked_at = ${settledAt}, updated_at = ${settledAt}
        WHERE household_id = ${householdId} AND id = ANY(${sql.param(resolved.held)}::uuid[])
        RETURNING id`)
    } catch (e) {
      console.error('[tinjau] penandaan tahan gagal', e)
      return stop(
        'Perpindahannya jadi, penandaannya tidak.',
        `${written} transaksi dipindahkan, tapi yang kamu tahan gagal ditandai dan akan ditawarkan lagi.`,
      )
    }
  }

  updateTag(txTag(householdId))

  const notes = [
    resolved.held.length > 0
      ? `${resolved.held.length} ditahan dan tidak akan ditawarkan lagi.`
      : '',
    resolved.rejected.length > 0 ? resolved.rejected[0].reason : '',
    scope === SCOPE_ALL && plan.protectedCount > 0
      ? `${plan.protectedCount} transaksi yang kategorinya pernah kamu tetapkan sendiri tidak disentuh.`
      : '',
  ].filter(Boolean)

  return {
    ok: true,
    message:
      written > 0
        ? `${written} transaksi dipindahkan ke ${resolved.writes.length} pos.`
        : `${resolved.held.length} transaksi ditahan.`,
    detail: notes.length > 0 ? notes.join(' ') : undefined,
    applied: written,
    scope,
  }
}

/** Files rows under a category and takes them out of the review queue. */
function settle(
  db: Scope,
  householdId: string,
  ids: string[],
  to: { categoryId: string; cashflow: CashflowType },
  settledAt: string,
) {
  return db.rows(sql`
    UPDATE public.transactions
    SET category_id = ${to.categoryId}, cashflow = ${to.cashflow}, needs_review = false,
        confirmed_at = ${settledAt}, updated_at = ${settledAt}
    WHERE household_id = ${householdId} AND id = ANY(${sql.param(ids)}::uuid[])
    RETURNING id`)
}
