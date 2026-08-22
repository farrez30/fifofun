'use server'

import { createHash } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { formatIdr } from '@/lib/money'
import { toJakartaInstant } from '@/lib/datetime'
import { findLikelyDuplicates } from '@/lib/ledger/conflicts'
import { ruleAgreesWithDirection } from '@/lib/ledger/direction'
import { firstMatch, type Rule } from '@/lib/ledger/rules'
import { DEFAULT_CATEGORY_BY_KIND, SEED_ACCOUNTS } from '@/lib/ledger/seed-data'
import { parseMandiriStatement } from '@/lib/statement/mandiri-xlsx'
import { statementToLedger } from '@/lib/statement/to-ledger'
import { createClient } from '@/lib/supabase/server'
import { readXlsx } from '@/lib/xlsx'

/**
 * Importing a statement.
 *
 * Two rules shape everything here.
 *
 * The first is that nothing is written unless the file reconciles. A statement
 * whose rows do not add up to the balance the bank printed has been misread, and
 * importing it anyway would put wrong numbers into a ledger whose entire purpose
 * is to be right. Refusing costs the user a second attempt; accepting costs them
 * a figure they will trust and should not.
 *
 * The second is that every write goes through PostgREST rather than Drizzle.
 * Drizzle connects as the database owner and bypasses row level security
 * entirely, which is correct for a seed script run from a laptop and completely
 * wrong for a request arriving from a browser. Going through the user's own
 * token means the policies decide what may be written, so a mistake in this file
 * cannot reach another household's data.
 */

/**
 * A statement is a few hundred kilobytes. This is generous and still bounded.
 *
 * It has to stay under `serverActions.bodySizeLimit`, or a file between the two
 * is rejected by the framework and the caller sees a transport error instead of
 * the message below.
 */
const MAX_UPLOAD_BYTES = 3 * 1024 * 1024

/** Every .xlsx is a ZIP, and every ZIP starts with these four bytes. */
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]

export interface ImportIssue {
  kind: string
  /** Absent where the mismatch is in a total rather than in one row. */
  sheetRow?: number
  expected: string
  actual: string
}

export interface ImportReport {
  ok: boolean
  filename?: string
  message: string
  detail?: string
  period?: { start: string; end: string }
  inserted?: number
  duplicates?: number
  needsReview?: number
  /** Manual entries that look like rows this statement just brought in. */
  duplicatesSuspected?: number
  openingBalance?: string
  closingBalance?: string
  issues?: ImportIssue[]
}

function fail(message: string, detail?: string): ImportReport {
  return { ok: false, message, detail }
}

function isoDate(date: { year: number; month: number; day: number }): string {
  return `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`
}

export async function importStatement(
  _previous: ImportReport | null,
  formData: FormData,
): Promise<ImportReport> {
  const file = formData.get('statement')
  if (!(file instanceof File) || file.size === 0) {
    return fail('Pilih satu berkas e-Statement lebih dulu.')
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return fail(
      'Berkasnya terlalu besar.',
      `Batasnya ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB, berkas ini ${(file.size / 1024 / 1024).toFixed(1)} MB. E-Statement Mandiri biasanya di bawah 100 KB, jadi kemungkinan besar ini bukan berkas yang dimaksud.`,
    )
  }

  const bytes = new Uint8Array(await file.arrayBuffer())

  // The extension is a claim by whoever uploaded; the first four bytes are not.
  if (!ZIP_MAGIC.every((byte, index) => bytes[index] === byte)) {
    return fail(
      'Berkas ini bukan .xlsx.',
      'Sebuah .xlsx sebenarnya arsip ZIP, dan berkas ini tidak diawali penanda ZIP. Kalau yang kamu punya PDF, gunakan menu impor PDF.',
    )
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return fail('Sesi kamu sudah berakhir. Masuk lagi lalu ulangi.')

  const { data: household } = await supabase
    .from('households')
    .select('id')
    .limit(1)
    .maybeSingle()
  if (!household) {
    return fail('Akun ini belum terhubung ke rumah tangga mana pun.')
  }

  let statement
  try {
    statement = parseMandiriStatement(readXlsx(bytes))
  } catch (error) {
    return fail(
      'Berkasnya tidak bisa dibaca sebagai e-Statement Mandiri.',
      error instanceof Error ? error.message : undefined,
    )
  }

  const { header, reconciliation } = statement

  // Nothing is written when the file does not reconcile. The row number is the
  // point: "totalnya tidak cocok" is unactionable, "baris 47" is not.
  if (!reconciliation.ok) {
    return {
      ok: false,
      filename: file.name,
      message: 'Berkasnya terbaca, tapi angkanya tidak cocok dengan saldo yang dicetak bank.',
      detail:
        'Tidak ada satu pun transaksi yang disimpan. Impor dihentikan supaya angka yang salah tidak masuk ke catatanmu.',
      issues: reconciliation.issues.map((issue) => ({
        kind: issue.kind,
        sheetRow: issue.sheetRow,
        expected: formatIdr(issue.expected),
        actual: formatIdr(issue.actual),
      })),
    }
  }

  const fileHash = createHash('sha256').update(bytes).digest('hex')

  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, name, own_identifiers')
    .eq('household_id', household.id)

  const { data: categories } = await supabase
    .from('categories')
    .select('id, name, cashflow')
    .eq('household_id', household.id)

  // What the household has already taught the app. Without this, the line shown
  // after teaching a rule, that the next import will file the pattern by itself,
  // was simply untrue: the import only ever read the defaults below.
  const { data: ruleRows } = await supabase
    .from('categorization_rules')
    .select('id, priority, match_type, pattern, cashflow, category_id, hit_count')
    .eq('household_id', household.id)
    .eq('auto_apply', true)

  const rules: Rule[] = (ruleRows ?? []).map((row) => ({
    id: row.id as string,
    priority: row.priority as number,
    matchType: row.match_type as Rule['matchType'],
    pattern: row.pattern as string,
    cashflow: row.cashflow as Rule['cashflow'],
    categoryId: (row.category_id as string | null) ?? null,
    autoApply: true,
    hitCount: (row.hit_count as number) ?? 0,
  }))

  const idByName = new Map((accounts ?? []).map((row) => [row.name as string, row.id as string]))
  const idByKey = new Map(
    SEED_ACCOUNTS.map((seed) => [seed.key, idByName.get(seed.name)]).filter(
      (pair): pair is [string, string] => Boolean(pair[1]),
    ),
  )
  // Keyed by cashflow and name together, because that is what the unique index
  // is. Two categories may share a name across cashflows, and a map keyed on the
  // name alone silently keeps whichever row came back last.
  const categoryByName = new Map(
    (categories ?? []).map((row) => [
      `${row.cashflow as string} ${row.name as string}`,
      row.id as string,
    ]),
  )

  const bank = (accounts ?? []).find((row) => row.name === 'Bank Mandiri')
  const ownIdentifiers = ((bank?.own_identifiers as string[] | null) ?? []).filter(Boolean)

  const { entries, classifications, passThroughIds, review, walletCoverage } = statementToLedger(
    statement,
    {
      ownIdentifiers,
      employerNames: [],
      accounts: {
        bankAccountId: 'mandiri',
        cashAccountId: 'cash',
        wallets: {
          GoPay: 'gopay',
          DANA: 'dana',
          ShopeePay: 'shopeepay',
          OVO: 'ovo',
          LinkAja: 'linkaja',
          'e-Money': 'emoney',
        },
      },
    },
  )

  const { data: batch, error: batchError } = await supabase
    .from('import_batches')
    .insert({
      household_id: household.id,
      account_id: idByKey.get('mandiri') ?? null,
      filename: file.name,
      file_hash: fileHash,
      format: 'mandiri_livin_xlsx_v1',
      period_start: isoDate(header.periodStart),
      period_end: isoDate(header.periodEnd),
      opening_balance: header.openingBalance.toString(),
      closing_balance: header.closingBalance.toString(),
      row_count: statement.rows.length,
      status: 'reconciled',
      issues: [],
    })
    .select('id')
    .single()

  if (batchError || !batch) {
    // The unique index on (household, file hash) is what makes re-uploading the
    // same statement harmless rather than duplicating it.
    const duplicate = batchError?.code === '23505'
    return {
      ok: duplicate,
      filename: file.name,
      message: duplicate
        ? 'Berkas ini sudah pernah diimpor.'
        : 'Gagal menyimpan berkas impor.',
      detail: duplicate
        ? 'Tidak ada yang berubah. Mengunggah statement yang sama dua kali memang aman.'
        : batchError?.message,
    }
  }

  const reviewIds = new Set(review.map((item) => item.entryId))
  const passThrough = new Set(passThroughIds)

  const ruleHits = new Map<string, number>()
  const importedAt = new Date().toISOString()

  const rows = entries.map((entry, index) => {
    const fallbackName = DEFAULT_CATEGORY_BY_KIND[classifications[index].kind]

    /*
      A taught rule beats the default, except on transfers. Which accounts a
      transfer moves money between is a fact about the row rather than an opinion
      about it, and a pattern that happens to match must not overrule it.
    */
    const matched =
      entry.cashflow === 'transfer'
        ? null
        : firstMatch(rules, {
            description: entry.description,
            rawDescription: statement.rows[index].description,
          })

    /*
      A rule taught on an outgoing row will happily match an incoming one whose
      counterparty is the same person, and filing money arriving under a
      spending category is the shape `transactions_account_sides` refuses. That
      refusal fails the whole upsert, so one such pattern used to make every
      later import of that statement impossible. The row keeps its default
      category instead and waits in the review queue, which is where a decision
      about it belongs anyway.
    */
    const rule = matched && ruleAgreesWithDirection(matched.cashflow, entry.cashflow) ? matched : null

    if (rule) ruleHits.set(rule.id, (ruleHits.get(rule.id) ?? 0) + 1)

    const fromAccountId = entry.fromAccountId ? (idByKey.get(entry.fromAccountId) ?? null) : null
    const toAccountId = entry.toAccountId ? (idByKey.get(entry.toAccountId) ?? null) : null

    // A transfer whose other side has no account here would violate the check
    // constraint, so it is recorded as an ordinary movement and flagged rather
    // than failing the whole import.
    const unmappedTransfer =
      entry.cashflow === 'transfer' && (!fromAccountId || !toAccountId)

    return {
      household_id: household.id,
      occurred_at: entry.occurredAt.toISOString(),
      description: entry.description,
      amount: entry.amount.toString(),
      cashflow: unmappedTransfer ? 'spending' : (rule?.cashflow ?? entry.cashflow),
      category_id:
        rule?.categoryId ??
        (fallbackName ? (categoryByName.get(`${entry.cashflow} ${fallbackName}`) ?? null) : null),
      from_account_id: fromAccountId,
      to_account_id: toAccountId,
      source: 'xlsx',
      external_ref: entry.externalRef ?? null,
      import_batch_id: batch.id,
      dedupe_key: entry.id,
      note: entry.note ?? null,
      is_pass_through: passThrough.has(entry.id),
      // A rule match is a decision the household already made in words. Leaving
      // the row unconfirmed would put it back in the review queue to ask a
      // question that has been answered, every month, for ever.
      confirmed_at: rule ? importedAt : null,
      needs_review: !rule && (unmappedTransfer || reviewIds.has(entry.id)),
      raw_description: statement.rows[index].description,
    }
  })

  const { data: written, error: writeError } = await supabase
    .from('transactions')
    .upsert(rows, { onConflict: 'household_id,dedupe_key', ignoreDuplicates: true })
    // Only the rows that were actually inserted come back, which is exactly
    // the set a manual entry can newly turn out to duplicate.
    .select('id, occurred_at, amount, from_account_id, to_account_id')

  if (writeError) {
    return {
      ok: false,
      filename: file.name,
      message: 'Transaksinya gagal disimpan.',
      detail: writeError.message,
    }
  }

  const inserted = written?.length ?? 0

  /*
    Hit counts, updated one rule at a time.

    Counted against the rows this import matched rather than the rows it wrote,
    so a re-upload of the same statement inflates nothing. The count exists so a
    rule that has never fired is visible in the rules list, which is the only way
    anyone discovers a pattern that was wrong from the day it was written.

    A failure here is not worth failing the import over: the transactions are
    already saved and correct, and the count is a diagnostic.
  */
  for (const [ruleId, hits] of ruleHits) {
    const rule = rules.find((candidate) => candidate.id === ruleId)
    if (!rule) continue
    await supabase
      .from('categorization_rules')
      .update({ hit_count: rule.hitCount + hits })
      .eq('id', ruleId)
  }

  /*
    Manual entries this statement turns out to have imported.

    Somebody types a cash payment on the day it happens; the statement arrives
    a month later with the same payment in it, because it went through the
    account after all. Both rows are honest and counting both is wrong, so the
    pair is recorded and the choice is left to a person in the review queue.

    Only rows the upsert actually inserted are considered, and only manual rows
    inside the statement's period plus a few days either side. Like the hit
    counts above, a failure here is a diagnostic rather than a reason to fail
    an import whose transactions are already saved and correct.
  */
  let duplicatesSuspected = 0
  if (inserted > 0) {
    const PAD_MS = 4 * 24 * 60 * 60 * 1000
    const from = new Date(toJakartaInstant(header.periodStart).getTime() - PAD_MS)
    const to = new Date(
      toJakartaInstant(header.periodEnd, { hour: 23, minute: 59, second: 59 }).getTime() + PAD_MS,
    )

    const { data: manualRows } = await supabase
      .from('transactions')
      .select('id, occurred_at, amount, from_account_id, to_account_id')
      .eq('household_id', household.id)
      .eq('source', 'manual')
      .is('deleted_at', null)
      .is('duplicate_of', null)
      .gte('occurred_at', from.toISOString())
      .lte('occurred_at', to.toISOString())

    const pairable = (row: Record<string, unknown>) => ({
      id: row.id as string,
      occurredAt: new Date(row.occurred_at as string),
      amount: BigInt(row.amount as string),
      fromAccountId: (row.from_account_id as string | null) ?? null,
      toAccountId: (row.to_account_id as string | null) ?? null,
    })

    const { pairs } = findLikelyDuplicates(
      (manualRows ?? []).map(pairable),
      (written ?? []).map(pairable),
    )

    for (const pair of pairs) {
      const { error: linkError } = await supabase
        .from('transactions')
        .update({ duplicate_of: pair.imported.id })
        .eq('id', pair.manual.id)
        .eq('household_id', household.id)
      if (!linkError) duplicatesSuspected += 1
    }
  }

  revalidatePath('/')
  revalidatePath('/rencana')
  revalidatePath('/tinjau')
  revalidatePath('/catat')

  return {
    ok: true,
    filename: file.name,
    duplicatesSuspected,
    message: `${inserted} transaksi masuk, dan saldonya cocok sampai ke sen terakhir.`,
    detail:
      walletCoverage.seen > 0 && walletCoverage.matchedOwn === 0
        ? `Ada ${walletCoverage.seen} pembayaran ke e-wallet yang tidak dikenali sebagai top-up milikmu sendiri, jadi semuanya tercatat sebagai pengeluaran. Isi nomor telepon di balik akun e-wallet kamu pada pengaturan akun Bank Mandiri agar tidak menggelembungkan pengeluaran.`
        : undefined,
    period: { start: isoDate(header.periodStart), end: isoDate(header.periodEnd) },
    inserted,
    duplicates: rows.length - inserted,
    needsReview: rows.filter((row) => row.needs_review).length,
    openingBalance: formatIdr(header.openingBalance),
    closingBalance: formatIdr(header.closingBalance),
  }
}
