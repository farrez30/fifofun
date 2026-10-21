import { createHash } from 'node:crypto'
import { revalidateTag } from 'next/cache'
import { importsTag, rulesTag, txTag } from '@/lib/queries/tags'
import { formatIdr } from '@/lib/money'
import { toJakartaInstant } from '@/lib/datetime'
import { findLikelyDuplicates } from '@/lib/ledger/conflicts'
import { ruleAgreesWithDirection } from '@/lib/ledger/direction'
import { firstMatch, type Rule } from '@/lib/ledger/rules'
import { DEFAULT_CATEGORY_BY_KIND } from '@/lib/ledger/seed-data'
import { parseMandiriStatement, StatementParseError } from '@/lib/statement/mandiri-xlsx'
import { statementToLedger, WALLET_ACCOUNT_KEYS } from '@/lib/statement/to-ledger'
import { insertInto, json, sql, type Row, type Scope } from '@/db/query'
import { userScope } from '@/lib/auth/session'
import { SESSION_EXPIRED, WRITE_FAILED } from '@/lib/actions'
import { readXlsx } from '@/lib/xlsx'
import {
  decryptWorkbook,
  isCompoundFile,
  isEncryptedWorkbook,
  UnsupportedWorkbookError,
  WrongPasswordError,
} from '@/lib/xlsx/encrypted'

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
 * Called from the route handler in `unggah/route.ts`, not as a Server Action.
 * A Server Action upload rides `experimental.useOffline`, which replays any
 * rejected fetch forever with the same body; a file that changed on disk after
 * it was picked rejects the same way every time, and the form flickered
 * "Koneksi terputus" without end. A plain fetch fails once and says so.
 *
 * The second is that every statement runs in the signed-in user's own scope.
 * The database owner bypasses row level security entirely, which is correct
 * for a seed script run from a laptop and completely wrong for a request
 * arriving from a browser. The user's scope means the policies decide what may
 * be written, so a mistake in this file cannot reach another household's data.
 */

/**
 * A statement is a few hundred kilobytes. This is generous and still bounded.
 *
 * It has to stay under Vercel's 4.5MB request cap, or a file between the two
 * is refused at the edge and the caller sees an HTML error page instead of the
 * message below. The route checks the same number against Content-Length
 * before it reads the body at all.
 */
export const MAX_UPLOAD_BYTES = 3 * 1024 * 1024

/** Every .xlsx is a ZIP, and every ZIP starts with these four bytes. */
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]

/** Excel caps a workbook password at 255 characters. */
const MAX_PASSWORD_LENGTH = 255

const PASSWORD_IS_NOT_KEPT =
  'Kata sandinya hanya dipakai untuk membuka berkas ini di server, lalu dibuang. Tidak disimpan dan tidak dicatat.'

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
  /**
   * The file is password-protected, and the form should ask for the password
   * and send the same file again. Set on a wrong password too.
   */
  needsPassword?: boolean
  /** Which part of settings has to be filled in before this can work. */
  needsSettings?: 'akun'
  /** Payments to e-wallets that could not be recognised as the household own. */
  walletUnmatched?: number
  openingBalance?: string
  closingBalance?: string
  issues?: ImportIssue[]
}

function fail(message: string, detail?: string): ImportReport {
  return { ok: false, message, detail }
}

/**
 * Where an unexpected throw can land, in the order the import reaches them.
 *
 * The stage is what lets the message say whether anything is already saved,
 * so the reader knows whether uploading again is a fresh attempt or a
 * duplicate check.
 */
type Stage = 'memeriksa sesi' | 'membaca berkas' | 'mencocokkan' | 'menyimpan' | 'merapikan'

const STAGE_DETAIL: Record<Stage, string> = {
  'memeriksa sesi': 'Belum ada yang tersimpan.',
  'membaca berkas': 'Belum ada yang tersimpan.',
  mencocokkan: 'Belum ada yang tersimpan.',
  menyimpan:
    'Sebagian transaksi mungkin sudah tersimpan. Mengunggah berkas yang sama lagi aman: baris yang sudah masuk tidak akan digandakan.',
  merapikan:
    'Transaksinya sudah tersimpan. Yang belum selesai hanya penghitungan aturan dan pencocokan ganda, dan keduanya menyusul sendiri di impor berikutnya.',
}

/**
 * The SQLSTATE of an error Postgres answered with, or null for anything else.
 *
 * A refusal means nothing was written and gets its own sentence. A dropped
 * connection may have landed after the commit, so it goes to the stage catch,
 * which says data may already be there.
 */
function sqlState(error: unknown): string | null {
  const code = (error as { code?: unknown } | null)?.code
  return typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code) ? code : null
}

function isoDate(date: { year: number; month: number; day: number }): string {
  return `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`
}

export async function importStatement(formData: FormData): Promise<ImportReport> {
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

  // The extension is a claim by whoever uploaded; the first bytes are not. An
  // OLE container is let through: a password-protected .xlsx is one, and it
  // is opened below, once the session is known to be real.
  const zip = ZIP_MAGIC.every((byte, index) => bytes[index] === byte)
  if (!zip && !isCompoundFile(bytes)) {
    return fail(
      'Berkas ini bukan .xlsx.',
      'Sebuah .xlsx sebenarnya arsip ZIP, dan berkas ini tidak diawali penanda ZIP. Kalau yang kamu punya PDF, gunakan menu impor PDF.',
    )
  }

  // Computed unconditionally, before anything that can throw, so every log
  // line below can name the upload it belongs to.
  const fileHash = createHash('sha256').update(bytes).digest('hex')
  let stage: Stage = 'memeriksa sesi'

  try {
    const db = await userScope()
    if (!db) return fail(SESSION_EXPIRED)

    // A failed read here, and in the lookups below, lands in the catch at the
    // bottom, which names the stage and says nothing is saved yet.
    const household = await db.maybeOne<{ id: string }>(sql`SELECT id FROM public.households LIMIT 1`)
    if (!household) {
      return fail('Akun ini belum terhubung ke rumah tangga mana pun.')
    }

    stage = 'membaca berkas'

    /*
      A password-protected .xlsx, as Mandiri sends from August 2026. Opened
      only here, after the session check: every attempt costs a hundred
      thousand hash rounds, and that is not something to hand out to anyone
      who can reach the route.
    */
    let workbook: Uint8Array = bytes
    if (!zip) {
      if (!isEncryptedWorkbook(bytes)) {
        return fail(
          'Berkas ini format .xls lama, bukan .xlsx.',
          "Buka di Excel, pilih Simpan Sebagai, lalu pilih Buku Kerja Excel (.xlsx). Atau unduh ulang e-Statement-nya dari Livin' dalam format .xlsx.",
        )
      }
      const password = formData.get('password')
      if (typeof password !== 'string' || password.length === 0) {
        return {
          ...fail(
            'Berkas ini dikunci kata sandi.',
            `Ketik kata sandi e-Statement-nya, lalu impor lagi. ${PASSWORD_IS_NOT_KEPT}`,
          ),
          filename: file.name,
          needsPassword: true,
        }
      }
      const wrongPassword: ImportReport = {
        ...fail(
          'Kata sandinya belum cocok.',
          'Periksa huruf besar-kecilnya, lalu impor lagi. Kata sandinya sama dengan yang diminta Excel saat membuka berkas ini.',
        ),
        filename: file.name,
        needsPassword: true,
      }
      if (password.length > MAX_PASSWORD_LENGTH) return wrongPassword
      try {
        workbook = decryptWorkbook(bytes, password)
      } catch (error) {
        if (error instanceof WrongPasswordError) return wrongPassword
        if (error instanceof UnsupportedWorkbookError) {
          return fail(
            'Kunci berkas ini belum bisa dibuka di sini.',
            'Buka di Excel dengan kata sandinya, hapus kata sandinya (File, Info, Proteksi Buku Kerja, Enkripsi dengan Kata Sandi, kosongkan), simpan, lalu unggah lagi.',
          )
        }
        throw error
      }
    }

    let statement
    try {
      statement = parseMandiriStatement(readXlsx(workbook))
    } catch (error) {
      return fail(
        'Berkasnya tidak bisa dibaca sebagai e-Statement Mandiri.',
        // Only the parser's own sentences, which are written for the reader.
        // What the ZIP and XML layers throw ("invalid zip data") is not.
        error instanceof StatementParseError
          ? error.message
          : "Isinya tidak berbentuk spreadsheet .xlsx yang utuh. Unduh ulang e-Statement-nya dari Livin', lalu coba lagi.",
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

    stage = 'mencocokkan'

    const accounts = await db.rows(sql`
      SELECT id, name, key, own_identifiers, reference FROM public.accounts
      WHERE household_id = ${household.id} AND archived_at IS NULL`)

    // Live categories only. A rule or a name lookup that still points at an
    // archived category would quietly keep filling a pos the household retired;
    // filtered here, the rule simply stops matching and the row parks in the
    // kind's default with the review flag on, which is where an orphaned habit
    // belongs.
    const categories = await db.rows(sql`
      SELECT id, name, cashflow FROM public.categories
      WHERE household_id = ${household.id} AND archived_at IS NULL`)

    // What the household has already taught the app. Without this, the line shown
    // after teaching a rule, that the next import will file the pattern by itself,
    // was simply untrue: the import only ever read the defaults below.
    const ruleRows = await db.rows(sql`
      SELECT id, priority, match_type, pattern, cashflow, category_id, hit_count
      FROM public.categorization_rules
      WHERE household_id = ${household.id} AND auto_apply = true`)

    // A rule that targets a retired category is dropped for this run rather
    // than allowed to file rows into the archive; deleting it stays the
    // household's call, from the rules list.
    const liveCategoryIds = new Set(categories.map((row) => row.id as string))
    const rules: Rule[] = ruleRows
      .filter((row) => row.category_id === null || liveCategoryIds.has(row.category_id as string))
      .map((row) => ({
        id: row.id as string,
        priority: row.priority as number,
        matchType: row.match_type as Rule['matchType'],
        pattern: row.pattern as string,
        cashflow: row.cashflow as Rule['cashflow'],
        categoryId: (row.category_id as string | null) ?? null,
        autoApply: true,
        hitCount: (row.hit_count as number) ?? 0,
      }))

    /*
      Accounts are found by their import key, not by their name. The name is a
      label a household is free to change, and it used to be the only thing
      linking a statement row to an account: renaming Bank Mandiri to Rekening
      Gaji silently made every future import file its rows against nothing.
    */
    const idByKey = new Map(
      accounts
        .filter((row) => row.key)
        .map((row) => [row.key as string, row.id as string]),
    )
    /*
      The household's other accounts by number, for transfers between them.
      These are matched by id rather than by key, because an account the
      statement never feeds (a second bank, the old Mandiri account) has no
      import key to be found by; the ids go into the same lookup so the rows
      below resolve both kinds the same way.
    */
    const byNumber: Record<string, string> = {}
    for (const row of accounts) {
      if (!row.reference || row.key === 'mandiri') continue
      byNumber[row.reference as string] = row.id as string
      idByKey.set(row.id as string, row.id as string)
    }
    // Keyed by cashflow and name together, because that is what the unique index
    // is. Two categories may share a name across cashflows, and a map keyed on the
    // name alone silently keeps whichever row came back last.
    const categoryByName = new Map(
      categories.map((row) => [
        `${row.cashflow as string} ${row.name as string}`,
        row.id as string,
      ]),
    )

    const bank = accounts.find((row) => row.key === 'mandiri')
    if (!bank) {
      return {
        ...fail(
          'Tidak ada akun dengan kunci impor mandiri.',
          'Statement ini diisi ke akun yang memegang kunci itu. Pasang kuncinya pada rekening bankmu di Pengaturan, lalu impor lagi.',
        ),
        filename: file.name,
        needsSettings: 'akun',
      }
    }

    const ownIdentifiers = ((bank.own_identifiers as string[] | null) ?? []).filter(Boolean)

    const { entries, classifications, passThroughIds, review, walletCoverage } = statementToLedger(
      statement,
      {
        ownIdentifiers,
        ownAccounts: Object.keys(byNumber),
        employerNames: [],
        accounts: {
          bankAccountId: 'mandiri',
          cashAccountId: 'cash',
          wallets: WALLET_ACCOUNT_KEYS,
          byNumber,
        },
      },
    )

    stage = 'menyimpan'

    let batch: { id: string }
    try {
      batch = await db.one<{ id: string }>(
        insertInto('import_batches', {
          household_id: household.id,
          account_id: bank.id as string,
          filename: file.name,
          file_hash: fileHash,
          format: 'mandiri_livin_xlsx_v1',
          period_start: isoDate(header.periodStart),
          period_end: isoDate(header.periodEnd),
          opening_balance: header.openingBalance.toString(),
          closing_balance: header.closingBalance.toString(),
          row_count: statement.rows.length,
          status: 'reconciled',
          issues: json([]),
        }),
        'import_batches',
      )
    } catch (batchError) {
      if (!sqlState(batchError)) throw batchError
      // The unique index on (household, file hash) is what makes re-uploading the
      // same statement harmless rather than duplicating it.
      const duplicate = sqlState(batchError) === '23505'
      if (!duplicate) console.error('[impor] gagal menyimpan berkas impor', batchError)
      return {
        ok: duplicate,
        filename: file.name,
        message: duplicate
          ? 'Berkas ini sudah pernah diimpor.'
          : 'Gagal menyimpan berkas impor.',
        detail: duplicate
          ? 'Tidak ada yang berubah. Mengunggah statement yang sama dua kali memang aman.'
          : WRITE_FAILED,
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
      const cashflow = unmappedTransfer ? 'spending' : (rule?.cashflow ?? entry.cashflow)

      return {
        household_id: household.id,
        occurred_at: entry.occurredAt.toISOString(),
        description: entry.description,
        amount: entry.amount.toString(),
        cashflow,
        // Looked up under the cashflow the row is actually written with. Under
        // the classifier's own, an own top-up to a wallet with no account here
        // went in as spending filed under the transfer category Antar Account.
        category_id:
          rule?.categoryId ??
          (fallbackName ? (categoryByName.get(`${cashflow} ${fallbackName}`) ?? null) : null),
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

    let written: WrittenRow[] = []
    if (rows.length > 0) {
      /*
        The whole statement as one jsonb parameter, spread back into rows by the
        table's own record type. A VALUES list binds twenty parameters a row and
        runs into Postgres' limit of 65535 on a long statement. Only the rows
        that were actually inserted come back, which is exactly the set a manual
        entry can newly turn out to duplicate.
      */
      const columns = sql.raw(Object.keys(rows[0]).join(', '))
      try {
        written = await db.rows<WrittenRow>(sql`
          INSERT INTO public.transactions (${columns})
          SELECT ${columns} FROM jsonb_populate_recordset(NULL::public.transactions, ${json(rows)})
          ON CONFLICT (household_id, dedupe_key) DO NOTHING
          RETURNING id, occurred_at, amount, from_account_id, to_account_id`)
      } catch (writeError) {
        if (!sqlState(writeError)) throw writeError
        console.error('[impor] transaksinya gagal disimpan', writeError)
        return {
          ok: false,
          filename: file.name,
          message: 'Transaksinya gagal disimpan.',
          detail: WRITE_FAILED,
        }
      }
    }

    const inserted = written.length

    stage = 'merapikan'

    /*
      Hit counts and suspected-duplicate links, run together rather than one
      after another. Both are diagnostics on data that is already safely
      written: a rule that never fires is only visible through its count, and
      a duplicate pairing only saves somebody a second look. Neither is worth
      the wall-clock of a separate round trip per row, and neither failing
      changes what already landed in the ledger above.
    */
    const [duplicatesSuspected] = await Promise.all([
      linkSuspectedDuplicates(db, household.id, header, written, inserted),
      updateRuleHitCounts(db, rules, ruleHits),
    ])

    // Rules too: the import bumps hit counts on the ones it applied. Expired
    // outright rather than 'max': the form refreshes straight after, and a
    // stale ledger there would read as an import that saved nothing.
    // `updateTag` would do this, but it is Server-Action-only.
    revalidateTag(txTag(household.id), { expire: 0 })
    revalidateTag(importsTag(household.id), { expire: 0 })
    revalidateTag(rulesTag(household.id), { expire: 0 })

    return {
      ok: true,
      filename: file.name,
      duplicatesSuspected,
      message: `${inserted} transaksi masuk, dan saldonya cocok sampai ke sen terakhir.`,
      detail:
        walletCoverage.seen > 0 && walletCoverage.matchedOwn === 0
          ? `Ada ${walletCoverage.seen} pembayaran ke e-wallet yang tidak dikenali sebagai top-up milikmu sendiri, jadi semuanya tercatat sebagai pengeluaran. Isi nomor telepon e-walletmu di Pengaturan, pada akun yang memegang kunci impor mandiri, agar tidak menggelembungkan pengeluaran.`
          : undefined,
      walletUnmatched:
        walletCoverage.seen > 0 && walletCoverage.matchedOwn === 0 ? walletCoverage.seen : undefined,
      period: { start: isoDate(header.periodStart), end: isoDate(header.periodEnd) },
      inserted,
      duplicates: rows.length - inserted,
      needsReview: rows.filter((row) => row.needs_review).length,
      openingBalance: formatIdr(header.openingBalance),
      closingBalance: formatIdr(header.closingBalance),
    }
  } catch (error) {
    // The stack belongs in the server log, keyed on the hash so a report can
    // be matched back to this exact upload; a raw message on the client can
    // carry a table name or a fragment of a transaction, which is the same
    // reasoning src/app/error.tsx follows.
    console.error(`[impor] gagal saat ${stage}`, { fileHash }, error)
    return fail(`Impor berhenti saat ${stage}.`, STAGE_DETAIL[stage])
  }
}

type WrittenRow = {
  id: string
  occurred_at: string
  amount: number
  from_account_id: string | null
  to_account_id: string | null
}

/**
 * Manual entries this statement turns out to have imported.
 *
 * Somebody types a cash payment on the day it happens; the statement arrives a
 * month later with the same payment in it, because it went through the account
 * after all. Both rows are honest and counting both is wrong, so the pair is
 * recorded and the choice is left to a person in the review queue.
 *
 * Only rows the upsert actually inserted are considered, and only manual rows
 * inside the statement's period plus a few days either side.
 */
async function linkSuspectedDuplicates(
  db: Scope,
  householdId: string,
  header: { periodStart: { year: number; month: number; day: number }; periodEnd: { year: number; month: number; day: number } },
  written: WrittenRow[],
  inserted: number,
): Promise<number> {
  if (inserted === 0) return 0

  const PAD_MS = 4 * 24 * 60 * 60 * 1000
  const from = new Date(toJakartaInstant(header.periodStart).getTime() - PAD_MS)
  const to = new Date(
    toJakartaInstant(header.periodEnd, { hour: 23, minute: 59, second: 59 }).getTime() + PAD_MS,
  )

  // Best effort, like the links below: a failed read pairs nothing.
  const manualRows = await db
    .rows(sql`
      SELECT id, occurred_at, amount, from_account_id, to_account_id FROM public.transactions
      WHERE household_id = ${householdId} AND source = 'manual'
        AND deleted_at IS NULL AND duplicate_of IS NULL
        AND occurred_at >= ${from.toISOString()} AND occurred_at <= ${to.toISOString()}`)
    .catch((): Row[] => [])

  const pairable = (row: Row) => ({
    id: row.id as string,
    occurredAt: new Date(row.occurred_at as string),
    amount: BigInt(row.amount as number),
    fromAccountId: (row.from_account_id as string | null) ?? null,
    toAccountId: (row.to_account_id as string | null) ?? null,
  })

  const { pairs } = findLikelyDuplicates(manualRows.map(pairable), written.map(pairable))

  const linked = await Promise.all(
    pairs.map((pair) =>
      db
        .rows(sql`
          UPDATE public.transactions SET duplicate_of = ${pair.imported.id}
          WHERE id = ${pair.manual.id} AND household_id = ${householdId}`)
        .then(
          () => 1,
          () => 0,
        ),
    ),
  )

  return linked.reduce((sum: number, one) => sum + one, 0)
}

/**
 * Hit counts, updated per rule this import matched.
 *
 * Counted against the rows this import matched rather than the rows it wrote,
 * so a re-upload of the same statement inflates nothing. The count exists so a
 * rule that has never fired is visible in the rules list, which is the only way
 * anyone discovers a pattern that was wrong from the day it was written.
 */
async function updateRuleHitCounts(
  db: Scope,
  rules: Rule[],
  ruleHits: Map<string, number>,
): Promise<void> {
  await Promise.all(
    [...ruleHits].map(async ([ruleId, hits]) => {
      const rule = rules.find((candidate) => candidate.id === ruleId)
      if (!rule) return
      // Ignored on failure, as it always was: the count is a diagnostic.
      await db
        .rows(sql`UPDATE public.categorization_rules SET hit_count = ${rule.hitCount + hits} WHERE id = ${ruleId}`)
        .catch(() => [])
    }),
  )
}
