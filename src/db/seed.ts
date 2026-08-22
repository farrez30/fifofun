import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { config } from 'dotenv'

/**
 * Imports a directory of Bank Mandiri e-Statements into the database.
 *
 * Idempotent by design: every transaction carries a hash of the source row, so
 * re-running the seed, or importing a statement that overlaps one already
 * loaded, updates nothing rather than creating duplicates. That property is
 * what makes it safe to re-run after a parser change.
 *
 *   pnpm db:seed -- --dir e_statement_mandiri --email you@example.com
 *
 * A household that already exists picks up categories added to the seed since,
 * without touching a single statement:
 *
 *   pnpm db:seed -- --setup-only
 */

interface Args {
  dir: string
  email?: string
  household: string
  ownIdentifiers: string[]
  employers: string[]
  dryRun: boolean
  /**
   * Stop after the household, accounts and categories.
   *
   * This is how a household that was set up months ago picks up categories added
   * to the seed since. Adding eleven Bills categories is useless to somebody who
   * already ran the seed once, and re-importing every statement to get at them
   * is a lot of work for a few rows.
   */
  setupOnly: boolean
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag)
    return i >= 0 ? argv[i + 1] : undefined
  }
  return {
    dir: get('--dir') ?? 'e_statement_mandiri',
    email: get('--email'),
    household: get('--household') ?? 'Rumah Tangga',
    ownIdentifiers: (get('--own') ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    employers: (get('--employer') ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    dryRun: argv.includes('--dry-run'),
    setupOnly: argv.includes('--setup-only'),
  }
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) return walk(path)
    return path.endsWith('.xlsx') ? [path] : []
  })
}

async function main(): Promise<void> {
  config({ path: '.env.local', quiet: true })
  const args = parseArgs(process.argv.slice(2))

  // Imported after the environment is loaded; the client reads it on creation.
  const { eq, and, or } = await import('drizzle-orm')
  const { db, schema } = await import('./client')
  const { readXlsx } = await import('@/lib/xlsx')
  const { parseMandiriStatement } = await import('@/lib/statement/mandiri-xlsx')
  const { statementToLedger } = await import('@/lib/statement/to-ledger')
  const { SEED_ACCOUNTS, SEED_CATEGORIES, DEFAULT_CATEGORY_BY_KIND } = await import(
    '@/lib/ledger/seed-data'
  )
  const { SEED_PALETTE } = await import('@/lib/ledger/palette')
  const { formatIdr } = await import('@/lib/money')

  const files = args.setupOnly ? [] : walk(args.dir).sort()
  if (!args.setupOnly && files.length === 0) {
    console.error(`No .xlsx statements found under ${args.dir}`)
    process.exit(1)
  }
  if (!args.setupOnly) console.log(`Found ${files.length} statements under ${args.dir}`)

  // --- household ---------------------------------------------------------
  let [household] = await db
    .select()
    .from(schema.households)
    .where(eq(schema.households.name, args.household))
    .limit(1)

  if (!household) {
    ;[household] = await db
      .insert(schema.households)
      .values({ name: args.household })
      .returning()
    console.log(`Created household "${household.name}"`)
  } else {
    console.log(`Using existing household "${household.name}"`)
  }

  // Link a signed-up user so the app can actually see this data through RLS.
  if (args.email) {
    const { createClient } = await import('@supabase/supabase-js')
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )
    const { data, error } = await admin.auth.admin.listUsers()
    if (error) throw error

    const user = data.users.find((u) => u.email?.toLowerCase() === args.email!.toLowerCase())
    if (!user) {
      console.warn(
        `No account found for ${args.email}. Sign up in the app first, then re-run to link it.`,
      )
    } else {
      await db
        .insert(schema.householdMembers)
        .values({ householdId: household.id, userId: user.id, role: 'owner' })
        .onConflictDoNothing()
      console.log(`Linked ${args.email} as owner`)
    }
  }

  // --- accounts and categories ------------------------------------------
  const accountIds = new Map<string, string>()
  for (const seed of SEED_ACCOUNTS) {
    // By key first, then by name. A household that has since renamed Bank
    // Mandiri still has the key, and one seeded before the key column existed
    // still has the name; both end up with the same account rather than a
    // second one.
    const [existing] = await db
      .select()
      .from(schema.accounts)
      .where(
        and(
          eq(schema.accounts.householdId, household.id),
          or(eq(schema.accounts.key, seed.key), eq(schema.accounts.name, seed.name)),
        ),
      )
      .limit(1)

    if (existing) {
      if (existing.key === null) {
        await db
          .update(schema.accounts)
          .set({ key: seed.key })
          .where(eq(schema.accounts.id, existing.id))
      }
      accountIds.set(seed.key, existing.id)
      continue
    }
    const [created] = await db
      .insert(schema.accounts)
      .values({
        householdId: household.id,
        name: seed.name,
        kind: seed.kind,
        institution: seed.institution,
        key: seed.key,
        ownIdentifiers: seed.key === 'mandiri' ? args.ownIdentifiers : [],
      })
      .returning()
    accountIds.set(seed.key, created.id)
  }
  console.log(`${accountIds.size} accounts ready`)

  // Keyed by cashflow and name, which is what the unique index is. Piutang
  // exists under both sides of a loan, and a map keyed on the name alone would
  // hand every lookup whichever of the two happened to be seeded second.
  const categoryIds = new Map<string, string>()
  const keyOf = (cashflow: string, name: string) => `${cashflow} ${name}`

  for (const seed of SEED_CATEGORIES) {
    // The same colour and icon the migration backfills, so a database seeded
    // on a laptop looks like one migrated in production rather than falling
    // back to a hash for every row.
    const look = SEED_PALETTE[seed.name]
    const [created] = await db
      .insert(schema.categories)
      .values({
        householdId: household.id,
        name: seed.name,
        cashflow: seed.cashflow,
        icon: look?.icon ?? null,
        color: look === undefined ? null : String(look.hue),
      })
      .onConflictDoNothing()
      .returning()

    if (created) {
      categoryIds.set(keyOf(seed.cashflow, seed.name), created.id)
      continue
    }

    const [existing] = await db
      .select()
      .from(schema.categories)
      .where(
        and(
          eq(schema.categories.householdId, household.id),
          eq(schema.categories.name, seed.name),
          eq(schema.categories.cashflow, seed.cashflow),
        ),
      )
      .limit(1)
    if (!existing) continue

    if (look && (existing.icon === null || existing.color === null)) {
      await db
        .update(schema.categories)
        .set({
          icon: existing.icon ?? look.icon,
          color: existing.color ?? String(look.hue),
        })
        .where(eq(schema.categories.id, existing.id))
    }
    categoryIds.set(keyOf(seed.cashflow, seed.name), existing.id)
  }
  console.log(`${categoryIds.size} categories ready`)

  if (args.setupOnly) {
    console.log('Setup only, statements left alone.')
    return
  }

  // --- statements --------------------------------------------------------
  const options = {
    ownIdentifiers: args.ownIdentifiers,
    employerNames: args.employers,
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
  }

  let inserted = 0
  let skipped = 0
  let flagged = 0
  let walletSeen = 0
  let walletMatched = 0

  for (const file of files) {
    const bytes = readFileSync(file)
    const fileHash = createHash('sha256').update(bytes).digest('hex')
    const filename = file.split(/[\\/]/).pop()!

    const statement = parseMandiriStatement(readXlsx(new Uint8Array(bytes)))
    const { reconciliation, header } = statement

    const [batch] = await db
      .insert(schema.importBatches)
      .values({
        householdId: household.id,
        accountId: accountIds.get('mandiri'),
        filename,
        fileHash,
        format: 'mandiri_livin_xlsx_v1',
        periodStart: new Date(Date.UTC(header.periodStart.year, header.periodStart.month - 1, header.periodStart.day)),
        periodEnd: new Date(Date.UTC(header.periodEnd.year, header.periodEnd.month - 1, header.periodEnd.day)),
        openingBalance: header.openingBalance,
        closingBalance: header.closingBalance,
        rowCount: statement.rows.length,
        status: reconciliation.ok ? 'reconciled' : 'failed',
        issues: reconciliation.issues.map((issue) => ({
          ...issue,
          expected: issue.expected.toString(),
          actual: issue.actual.toString(),
        })),
      })
      .onConflictDoNothing()
      .returning()

    if (!batch) {
      console.log(`  skip ${filename} (already imported)`)
      skipped += statement.rows.length
      continue
    }

    const { entries, classifications, passThroughIds, review, walletCoverage } =
      statementToLedger(statement, options)
    walletSeen += walletCoverage.seen
    walletMatched += walletCoverage.matchedOwn
    const reviewIds = new Set(review.map((item) => item.entryId))
    const passThrough = new Set(passThroughIds)

    const rows = entries.map((entry, i) => {
      const kind = classifications[i].kind
      const categoryName = DEFAULT_CATEGORY_BY_KIND[kind]
      return {
        householdId: household.id,
        occurredAt: entry.occurredAt,
        description: entry.description,
        amount: entry.amount,
        cashflow: entry.cashflow,
        categoryId: categoryName
          ? (categoryIds.get(keyOf(entry.cashflow, categoryName)) ?? null)
          : null,
        fromAccountId: entry.fromAccountId ? accountIds.get(entry.fromAccountId) ?? null : null,
        toAccountId: entry.toAccountId ? accountIds.get(entry.toAccountId) ?? null : null,
        source: 'xlsx' as const,
        externalRef: entry.externalRef ?? null,
        importBatchId: batch.id,
        dedupeKey: entry.id,
        note: entry.note ?? null,
        isPassThrough: passThrough.has(entry.id),
        needsReview: reviewIds.has(entry.id),
        rawDescription: statement.rows[i].description,
      }
    })

    if (args.dryRun) {
      console.log(`  would insert ${rows.length} from ${filename}`)
      continue
    }

    // A transfer whose other side has no mapped account would violate the
    // database check constraint, so it is recorded as an ordinary movement and
    // flagged for review instead of failing the whole import.
    const safe = rows.map((row) =>
      row.cashflow === 'transfer' && (!row.fromAccountId || !row.toAccountId)
        ? { ...row, cashflow: 'spending' as const, needsReview: true }
        : row,
    )

    const written = await db
      .insert(schema.transactions)
      .values(safe)
      .onConflictDoNothing()
      .returning({ id: schema.transactions.id })

    inserted += written.length
    skipped += rows.length - written.length
    flagged += safe.filter((row) => row.needsReview).length

    console.log(
      `  ${reconciliation.ok ? 'ok  ' : 'FAIL'} ${filename.padEnd(46)} ` +
        `${String(written.length).padStart(3)} rows  close ${formatIdr(header.closingBalance)}`,
    )
  }

  console.log(`\nInserted ${inserted}, skipped ${skipped} already present, ${flagged} need review.`)

  // A wrong phone number is indistinguishable from a right one row by row: every
  // top-up simply reads as a payment to somebody else. It is obvious in the
  // aggregate, so the aggregate is what gets checked.
  if (walletSeen > 0) {
    console.log(`Wallet payments: ${walletSeen} seen, ${walletMatched} recognised as your own.`)

    if (walletMatched === 0) {
      console.error(
        `\nWARNING: none of the ${walletSeen} wallet payments matched --own.\n` +
          `Every top-up has been recorded as spending, which overstates it and\n` +
          `leaves the wallet accounts empty. Re-run with the phone numbers behind\n` +
          `your e-wallet accounts.`,
      )
      process.exit(2)
    }
  }

  process.exit(0)
}

main().catch((error: unknown) => {
  console.error('Seed failed:', error instanceof Error ? error.message : error)
  process.exit(1)
})
