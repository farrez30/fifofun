import { cache } from 'react'
import { cacheLife, cacheTag } from 'next/cache'
import type { SQL } from 'drizzle-orm'
import { sql, type Scope } from '@/db/query'
import { userScope } from '@/lib/auth/session'
import { accountsTag, budgetsTag, categoriesTag, importsTag, placesTag, planTag, rulesTag, summaryNoteTag, txTag } from '@/lib/queries/tags'
import { parseHue } from '@/lib/ledger/palette'
import { logoUrl } from '@/lib/brand'
import type { AccountKind, CashflowType, EntrySource, LedgerEntry } from '@/lib/ledger/types'
import type { PlaceEntry } from '@/lib/ledger/places'
import type { AdjustmentRow } from '@/lib/ledger/adjustments'
import {
  childPlansFromJson,
  isKnownFramework,
  LIFESTYLE_TIERS,
  SCHOOL_TRACKS,
  type PlanValues,
} from '@/lib/planning/plan'
import type { SchoolTrack } from '@/lib/planning/constants'
import type { LifestyleTier } from '@/lib/planning/lifestyle'

/**
 * Reads for the signed-in user.
 *
 * Every read runs in the user's scope (`userScope`), never as the owner: the
 * owner bypasses row level security entirely, which is correct for migrations
 * and seeding and completely wrong for serving a request. In the user's scope
 * the policies decide what comes back, so a mistake in this file cannot expose
 * another household's data.
 *
 * Amounts arrive as numbers of sen. Every one is converted to `bigint` here, at
 * the boundary, so no number ever reaches the money functions.
 *
 * A read that fails, or a request with nobody signed in, answers with the empty
 * value rather than throwing, as these always have: the pages render an empty
 * state, and the error goes to the server log.
 */

export interface HouseholdSummary {
  id: string
  name: string
  timezone: string
  currency: string
}

export interface AccountRow {
  id: string
  name: string
  kind: AccountKind
  openingBalance: bigint
  /** What the importer and the bot write to, so a rename cannot break either. */
  key: string | null
  institution: string | null
  ownIdentifiers: string[]
  /** The account's own number, digits only, for recognising transfers to and from it. */
  reference: string | null
  openingBalanceAt: Date | null
  sortOrder: number
  archivedAt: Date | null
  /** The institution's colour as `#rrggbb`, or null for the app's own accent. */
  color: string | null
  /** Where the institution's icon is served, or null when there is none. */
  logoUrl: string | null
}

export interface CategoryRow {
  id: string
  name: string
  cashflow: CashflowType
  /** The group this rolls up into, or null when it is a group or stands alone. */
  parentId: string | null
  /** What was already in this pot before the ledger starts. Zero for the rest. */
  openingBalance: bigint
  /** Only savings, sinking funds and goals carry a target. */
  target: bigint | null
  /** `YYYY-MM` the target is wanted by, or null for no deadline. */
  targetMonth: string | null
  /** What the household means to put in each month, in sen. */
  plannedMonthly: bigint | null
  /** The same intention as basis points of typical income. */
  plannedShareBp: number | null
  /** What a bill costs each month, in sen. Only bills carry one. */
  billAmount: bigint | null
  /** Day of the month a bill is due, 1 to 31. */
  billDueDay: number | null
  /** Phosphor icon name, or null to fall back to the cashflow's own. */
  icon: string | null
  /** Stored hue 0 to 359, or null to fall back to the palette. */
  hue: number | null
  /** One sentence saying what belongs here, shown under every picker. */
  description: string | null
  sortOrder: number
  archivedAt: Date | null
}

/** Archived rows are hidden from every picker, and kept for the rows that used them. */
export interface ListOptions {
  includeArchived?: boolean
}

type Row = Record<string, unknown>

/** Run a read in the user's scope; the fallback when signed out or when it fails. */
async function read<T>(fallback: T, query: (db: Scope) => Promise<T>): Promise<T> {
  const db = await userScope()
  if (!db) return fallback
  try {
    return await query(db)
  } catch (e) {
    console.error('[household] read failed', e)
    return fallback
  }
}

const where = (conditions: SQL[]): SQL => sql.join(conditions, sql` AND `)

function toBigInt(value: unknown): bigint {
  if (typeof value === 'bigint') return value
  if (typeof value === 'string') return BigInt(value)
  if (typeof value === 'number') return BigInt(Math.round(value))
  return 0n
}

/**
 * The household the signed-in user belongs to, or null if they have none yet.
 *
 * React `cache()` because a dozen loaders ask this on a single render and the
 * answer cannot change mid-request. Not `'use cache'`: that refuses the
 * `cookies()` this read needs for RLS. Per-request memoisation only.
 */
export const getHousehold = cache(async (): Promise<HouseholdSummary | null> => {
  return read(null, (db) =>
    db.maybeOne<HouseholdSummary>(sql`SELECT id, name, timezone, currency FROM public.households LIMIT 1`),
  )
})

export async function getAccounts(
  householdId: string,
  options: ListOptions = {},
): Promise<AccountRow[]> {
  'use cache: private'
  cacheTag(accountsTag(householdId))
  cacheLife({ stale: 300 })

  // logo_hash, not logo: the icon itself is served once by /akun/[id]/logo
  // rather than riding along in every page that lists accounts.
  const data = await read<Row[]>([], (db) =>
    db.rows(sql`
      SELECT id, name, kind, opening_balance, opening_balance_at, key, institution, own_identifiers,
             reference, sort_order, archived_at, color, logo_hash
      FROM public.accounts
      WHERE household_id = ${householdId}
        ${options.includeArchived ? sql`` : sql`AND archived_at IS NULL`}
      ORDER BY sort_order, name`),
  )
  return data.map((row) => ({
    id: row.id as string,
    name: row.name as string,
    kind: row.kind as AccountKind,
    openingBalance: toBigInt(row.opening_balance),
    key: (row.key as string | null) ?? null,
    institution: (row.institution as string | null) ?? null,
    ownIdentifiers: (row.own_identifiers as string[] | null) ?? [],
    reference: (row.reference as string | null) ?? null,
    openingBalanceAt: row.opening_balance_at ? new Date(row.opening_balance_at as string) : null,
    sortOrder: (row.sort_order as number) ?? 0,
    archivedAt: row.archived_at ? new Date(row.archived_at as string) : null,
    color: (row.color as string | null) ?? null,
    logoUrl: logoUrl(row.id as string, (row.logo_hash as string | null) ?? null),
  }))
}

export async function getCategories(
  householdId: string,
  options: ListOptions = {},
): Promise<CategoryRow[]> {
  'use cache: private'
  cacheTag(categoriesTag(householdId))
  cacheLife({ stale: 300 })

  // Ordered by the household's own arrangement, with the name as the
  // tiebreak. Before the numbering migration every row carried zero, so the
  // tiebreak alone reproduces the alphabetical order this used to have.
  const data = await read<Row[]>([], (db) =>
    db.rows(sql`
      SELECT id, name, cashflow, parent_id, opening_balance, target_amount, target_month, planned_monthly,
             planned_share_bp, bill_amount, bill_due_day, icon, color, description, sort_order, archived_at
      FROM public.categories
      WHERE household_id = ${householdId}
        ${options.includeArchived ? sql`` : sql`AND archived_at IS NULL`}
      ORDER BY sort_order, name`),
  )

  return data.map((row) => ({
    id: row.id as string,
    name: row.name as string,
    cashflow: row.cashflow as CashflowType,
    parentId: (row.parent_id as string | null) ?? null,
    openingBalance: toBigInt(row.opening_balance ?? 0),
    target: row.target_amount === null ? null : toBigInt(row.target_amount),
    targetMonth: (row.target_month as string | null) ?? null,
    plannedMonthly: row.planned_monthly === null ? null : toBigInt(row.planned_monthly),
    plannedShareBp: (row.planned_share_bp as number | null) ?? null,
    billAmount: row.bill_amount === null ? null : toBigInt(row.bill_amount),
    billDueDay: (row.bill_due_day as number | null) ?? null,
    icon: (row.icon as string | null) ?? null,
    hue: parseHue(row.color),
    description: (row.description as string | null) ?? null,
    sortOrder: (row.sort_order as number) ?? 0,
    archivedAt: row.archived_at ? new Date(row.archived_at as string) : null,
  }))
}

export interface TransactionRow extends LedgerEntry {
  categoryName: string | null
  needsReview: boolean
  isPassThrough: boolean
  /** The imported row this manual entry looks like a copy of. */
  duplicateOf: string | null
  /** The row this one is a part of, when a receipt was split. */
  splitOf: string | null
}

/** Every column the ledger reads, in one place, so a new one is added once. */
const TRANSACTION_COLUMNS = sql`t.id, t.occurred_at, t.description, t.amount, t.cashflow, t.category_id,
  t.from_account_id, t.to_account_id, t.source, t.external_ref, t.note, t.needs_review, t.is_pass_through,
  t.duplicate_of, t.split_of, c.name AS category_name`

/** Transactions as `t`, with the category's name beside each row. */
const TRANSACTIONS = sql`public.transactions t LEFT JOIN public.categories c ON c.id = t.category_id`

const categoryName = (row: Row): string | null => (row.category_name as string | null) ?? null

function toTransactionRow(row: Row): TransactionRow {
  return {
    id: row.id as string,
    occurredAt: new Date(row.occurred_at as string),
    description: row.description as string,
    amount: toBigInt(row.amount),
    cashflow: row.cashflow as CashflowType,
    categoryId: (row.category_id as string | null) ?? null,
    fromAccountId: (row.from_account_id as string | null) ?? null,
    toAccountId: (row.to_account_id as string | null) ?? null,
    source: row.source as EntrySource,
    externalRef: (row.external_ref as string | null) ?? null,
    note: (row.note as string | null) ?? null,
    categoryName: categoryName(row),
    needsReview: Boolean(row.needs_review),
    isPassThrough: Boolean(row.is_pass_through),
    duplicateOf: (row.duplicate_of as string | null) ?? null,
    splitOf: (row.split_of as string | null) ?? null,
  }
}

interface FetchOptions {
  from?: Date
  /** Exclusive: rows strictly before this instant. */
  to?: Date
  limit?: number
  offset?: number
  cashflows?: CashflowType[]
  /** Category ids to keep; `null` keeps the rows that have no category. */
  categoryIds?: (string | null)[]
  /** Rows touching any of these accounts, on either side. */
  accountIds?: string[]
  /** Case-insensitive substring of the description. */
  search?: string
  /** Pass `false` to hide pass-through rows; anything else leaves them in. */
  includePassThrough?: boolean
  sources?: EntrySource[]
}

/** LIKE wildcards typed into the search box are text, not syntax. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`)
}

/**
 * Transactions for a household, newest first.
 *
 * Deliberately not `use cache: private`, along with every reader that feeds a
 * balance (`getMatchingTransactions`, `getAllTransactions`, `getUsage`).
 * These are the inputs every headline figure is computed from, and reading
 * them fresh from the database on every render is what makes "never show a
 * stale balance" trivially true instead of carefully true.
 */
export async function getTransactions(
  householdId: string,
  options: FetchOptions = {},
): Promise<TransactionRow[]> {
  const conditions = [sql`t.household_id = ${householdId}`, sql`t.deleted_at IS NULL`]

  if (options.from) conditions.push(sql`t.occurred_at >= ${options.from.toISOString()}::timestamptz`)
  if (options.to) conditions.push(sql`t.occurred_at < ${options.to.toISOString()}::timestamptz`)
  if (options.cashflows?.length) {
    conditions.push(sql`t.cashflow = ANY(${sql.param(options.cashflows)}::public.cashflow_type[])`)
  }
  if (options.sources?.length) {
    conditions.push(sql`t.source = ANY(${sql.param(options.sources)}::public.entry_source[])`)
  }

  if (options.categoryIds?.length) {
    const ids = options.categoryIds.filter((id): id is string => id !== null)
    const wantsNull = options.categoryIds.includes(null)
    const inIds = sql`t.category_id = ANY(${sql.param(ids)}::uuid[])`
    if (ids.length && wantsNull) conditions.push(sql`(${inIds} OR t.category_id IS NULL)`)
    else if (ids.length) conditions.push(inIds)
    else conditions.push(sql`t.category_id IS NULL`)
  }

  if (options.accountIds?.length) {
    const ids = sql.param(options.accountIds)
    conditions.push(sql`(t.from_account_id = ANY(${ids}::uuid[]) OR t.to_account_id = ANY(${ids}::uuid[]))`)
  }

  if (options.search?.trim()) {
    conditions.push(sql`t.description ILIKE ${`%${escapeLike(options.search.trim())}%`}`)
  }

  if (options.includePassThrough === false) conditions.push(sql`t.is_pass_through = false`)

  const page =
    options.limit !== undefined ? sql`LIMIT ${options.limit} OFFSET ${options.offset ?? 0}` : sql``

  const data = await read<Row[]>([], (db) =>
    db.rows(sql`
      SELECT ${TRANSACTION_COLUMNS} FROM ${TRANSACTIONS}
      WHERE ${where(conditions)}
      ORDER BY t.occurred_at DESC ${page}`),
  )
  return data.map(toTransactionRow)
}

/**
 * Every transaction, used by the yearly views. Ordered oldest first.
 *
 * One query. PostgREST capped a response at 1000 rows, so the full reads here
 * used to page; a direct query returns everything it is asked for.
 */
export async function getAllTransactions(householdId: string): Promise<TransactionRow[]> {
  return (await getTransactions(householdId)).reverse()
}

/**
 * Every transaction a filter matches, newest first.
 *
 * The report used to read the whole ledger and sieve it in JavaScript; this
 * moves the sieve into the query so only the matched rows travel. The
 * JavaScript predicate still runs over what comes back — the totals and the
 * visible page must come from one array filtered by one piece of code, and a
 * database filter accidentally looser than `matchesFilter` then costs
 * bandwidth, not correctness.
 *
 * Empty id lists mean the name in the address bar matched nothing the
 * household owns, so nothing can match — answered without a query.
 */
export async function getMatchingTransactions(
  householdId: string,
  options: FetchOptions = {},
): Promise<TransactionRow[]> {
  if (options.categoryIds?.length === 0 || options.accountIds?.length === 0) return []

  return getTransactions(householdId, { ...options, offset: undefined, limit: undefined })
}

/** How many live rows the ledger holds, without fetching any of them. */
export async function countLedger(householdId: string): Promise<number> {
  const found = await read(null, (db) =>
    db.maybeOne<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM public.transactions WHERE household_id = ${householdId} AND deleted_at IS NULL`,
    ),
  )
  return found?.n ?? 0
}

/**
 * The spendable balance the ledger starts from: the opening balance printed on
 * the earliest statement imported. Without it every "Sisa uang" figure is an
 * offset from zero rather than a real balance.
 */
export async function getOpeningBalance(householdId: string): Promise<bigint> {
  'use cache: private'
  cacheTag(importsTag(householdId))
  cacheLife({ stale: 30 })

  const data = await read(null, (db) =>
    db.maybeOne<Row>(sql`
      SELECT opening_balance FROM public.import_batches
      WHERE household_id = ${householdId}
      ORDER BY period_start ASC
      LIMIT 1`),
  )
  if (!data) return 0n
  return toBigInt(data.opening_balance)
}

/**
 * Budgets for one calendar month, keyed by category name.
 *
 * Keyed by name rather than by id because that is what the actuals are keyed by:
 * the rollup groups on the category name a transaction carries, and joining the
 * two on an id would need every actual to have resolved a category first, which
 * imported rows have not always done.
 */
export async function getBudgets(
  householdId: string,
  period: string,
): Promise<Record<string, bigint>> {
  'use cache: private'
  cacheTag(budgetsTag(householdId))
  cacheLife({ stale: 30 })

  const data = await read<Row[]>([], (db) =>
    db.rows(sql`
      SELECT b.amount, c.name AS category_name
      FROM public.budgets b LEFT JOIN public.categories c ON c.id = b.category_id
      WHERE b.household_id = ${householdId} AND b.period = ${period}`),
  )

  const budgets: Record<string, bigint> = {}
  for (const row of data) {
    const name = categoryName(row)
    if (name) budgets[name] = toBigInt(row.amount)
  }
  return budgets
}

/** The closing balance the bank printed on the most recent statement imported. */
export async function getLatestClosingBalance(
  householdId: string,
): Promise<{ closing: bigint; periodEnd: Date } | null> {
  'use cache: private'
  cacheTag(importsTag(householdId))
  cacheLife({ stale: 30 })

  const data = await read(null, (db) =>
    db.maybeOne<Row>(sql`
      SELECT closing_balance, period_end FROM public.import_batches
      WHERE household_id = ${householdId} AND status = 'reconciled'
      ORDER BY period_end DESC
      LIMIT 1`),
  )

  if (!data?.period_end) return null
  return { closing: toBigInt(data.closing_balance), periodEnd: new Date(data.period_end as string) }
}

export interface RuleRow {
  id: string
  priority: number
  matchType: 'contains' | 'prefix' | 'exact'
  pattern: string
  cashflow: CashflowType | null
  categoryId: string | null
  categoryName: string | null
  autoApply: boolean
  hitCount: number
}

export async function getRules(householdId: string): Promise<RuleRow[]> {
  'use cache: private'
  cacheTag(rulesTag(householdId))
  cacheLife({ stale: 300 })

  const data = await read<Row[]>([], (db) =>
    db.rows(sql`
      SELECT r.id, r.priority, r.match_type, r.pattern, r.cashflow, r.category_id, r.auto_apply, r.hit_count,
             c.name AS category_name
      FROM public.categorization_rules r LEFT JOIN public.categories c ON c.id = r.category_id
      WHERE r.household_id = ${householdId}
      ORDER BY r.priority`),
  )

  return data.map((row) => ({
    id: row.id as string,
    priority: row.priority as number,
    matchType: row.match_type as RuleRow['matchType'],
    pattern: row.pattern as string,
    cashflow: (row.cashflow as CashflowType | null) ?? null,
    categoryId: (row.category_id as string | null) ?? null,
    categoryName: categoryName(row),
    autoApply: Boolean(row.auto_apply),
    hitCount: (row.hit_count as number) ?? 0,
  }))
}

export interface MerchantLocationRow {
  id: string
  merchantKey: string
  label: string
  address: string | null
  /** Null on a merchant marked as having no place. */
  lat: number | null
  lng: number | null
  source: 'manual' | 'osm' | 'riset'
  /** `YYYY-MM-DD`, inclusive; null for open. */
  validFrom: string | null
  validTo: string | null
}

export async function getMerchantLocations(householdId: string): Promise<MerchantLocationRow[]> {
  'use cache: private'
  cacheTag(placesTag(householdId))
  cacheLife({ stale: 300 })

  const data = await read<Row[]>([], (db) =>
    db.rows(sql`
      SELECT id, merchant_key, label, address, lat, lng, source, valid_from, valid_to
      FROM public.merchant_locations
      WHERE household_id = ${householdId}`),
  )

  return data.map((row) => ({
    id: row.id as string,
    merchantKey: row.merchant_key as string,
    label: row.label as string,
    address: (row.address as string | null) ?? null,
    lat: row.lat === null ? null : Number(row.lat),
    lng: row.lng === null ? null : Number(row.lng),
    source: row.source as MerchantLocationRow['source'],
    validFrom: (row.valid_from as string | null) ?? null,
    validTo: (row.valid_to as string | null) ?? null,
  }))
}

/** The household's own lines under the three-month summary, or an empty string. */
export async function getSummaryNote(householdId: string): Promise<string> {
  'use cache: private'
  cacheTag(summaryNoteTag(householdId))
  cacheLife({ stale: 300 })

  const data = await read(null, (db) =>
    db.maybeOne<{ body: string }>(sql`SELECT body FROM public.summary_notes WHERE household_id = ${householdId}`),
  )
  return data?.body ?? ''
}

/**
 * Every spending and bill row with the bank's raw text, which is what tells a
 * counter payment from an online one. Pass-through rows stay out: the money
 * was somebody else's. Uncached for the same reason as the other ledger reads.
 */
export async function getPlaceEntries(householdId: string): Promise<PlaceEntry[]> {
  const data = await read<Row[]>([], (db) =>
    db.rows(sql`
      SELECT t.id, t.occurred_at, t.description, t.raw_description, t.amount, t.cashflow, t.source,
             c.name AS category_name
      FROM ${TRANSACTIONS}
      WHERE t.household_id = ${householdId}
        AND t.deleted_at IS NULL
        AND t.is_pass_through = false
        AND t.cashflow IN ('spending', 'bills')
      ORDER BY t.occurred_at ASC, t.id ASC`),
  )

  return data.map((row) => ({
    id: row.id as string,
    occurredAt: new Date(row.occurred_at as string),
    description: row.description as string,
    rawDescription: (row.raw_description as string | null) ?? null,
    amount: toBigInt(row.amount),
    cashflow: row.cashflow as CashflowType,
    source: row.source as EntrySource,
    categoryName: categoryName(row),
  }))
}

/**
 * Every balance correction `catat` wrote, with the moment it was written,
 * which is what orders two corrections booked at the same minute. Uncached
 * like every other read a balance depends on.
 */
export async function getAdjustments(householdId: string): Promise<AdjustmentRow[]> {
  const data = await read<Row[]>([], (db) =>
    db.rows(sql`
      SELECT id, occurred_at, created_at, amount, cashflow, from_account_id, to_account_id, note
      FROM public.transactions
      WHERE household_id = ${householdId}
        AND deleted_at IS NULL
        AND source = 'manual'
        AND cashflow IN ('income', 'spending')
        AND description LIKE ${'Penyesuaian saldo %'}`),
  )

  return data.map((row) => ({
    id: row.id as string,
    accountId: ((row.from_account_id ?? row.to_account_id) as string | null) ?? '',
    occurredAt: new Date(row.occurred_at as string),
    createdAt: new Date(row.created_at as string),
    amount: toBigInt(row.amount),
    cashflow: row.cashflow as AdjustmentRow['cashflow'],
    note: (row.note as string | null) ?? null,
  }))
}

export interface UnconfirmedRow {
  id: string
  description: string
  rawDescription: string | null
  amount: bigint
  cashflow: CashflowType
  categoryName: string | null
  occurredAt: Date
  /** Which account the money left or arrived in, so the queue can name it. */
  fromAccountId: string | null
  toAccountId: string | null
  source: EntrySource
  /** Set when a person told tidying to leave this row's category alone. */
  categoryLockedAt: Date | null
}

/**
 * Rows whose category is still the importer's guess.
 *
 * Transfers are left out: their category is decided by which accounts they move
 * money between, not by a person's judgement, and asking about them would bury
 * the rows that actually need an opinion.
 *
 * `includeSettled` drops the confirmed filter, which is what tidying a ledger
 * needs: a row settled by an old rule is exactly the row a better rule is
 * meant to reach. Nothing else uses it, and the caller that does refuses to
 * write over a category a person chose.
 */
/**
 * How many rows are waiting in Tinjau, and nothing else about them.
 *
 * For the badge on the tab bar. The shell starts this without awaiting it, so
 * the page paints and the figure streams in behind it, which is why it
 * resolves the household itself and why it never rejects: nothing upstream is
 * positioned to catch it, and a badge is not worth an error page.
 *
 * The filters must be the ones `getUnconfirmed` uses below: a badge that
 * counts rows the queue will not list is a door that says occupied over an
 * empty room.
 */
export async function countUnconfirmed(): Promise<number> {
  try {
    const household = await getHousehold()
    if (!household) return 0

    const found = await read(null, (db) =>
      db.maybeOne<{ n: number }>(sql`
        SELECT count(*)::int AS n FROM public.transactions
        WHERE household_id = ${household.id}
          AND deleted_at IS NULL
          AND cashflow <> 'transfer'
          AND source <> 'manual'
          AND confirmed_at IS NULL`),
    )
    return found?.n ?? 0
  } catch {
    // The fixture harness renders the shell with no request to read cookies
    // from. It shows the badge's absence, which is also what it asserts on.
    return 0
  }
}

export async function getUnconfirmed(
  householdId: string,
  options: { includeSettled?: boolean } = {},
): Promise<UnconfirmedRow[]> {
  'use cache: private'
  cacheTag(txTag(householdId))
  cacheLife({ stale: 30 })

  // The id makes the order total: amounts repeat constantly in a ledger.
  const data = await read<Row[]>([], (db) =>
    db.rows(sql`
      SELECT t.id, t.description, t.raw_description, t.amount, t.cashflow, t.occurred_at, t.from_account_id,
             t.to_account_id, t.source, t.category_locked_at, c.name AS category_name
      FROM ${TRANSACTIONS}
      WHERE t.household_id = ${householdId}
        AND t.deleted_at IS NULL
        AND t.cashflow <> 'transfer'
        AND t.source <> 'manual'
        ${options.includeSettled ? sql`` : sql`AND t.confirmed_at IS NULL`}
      ORDER BY t.amount DESC, t.id`),
  )

  return data.map((row) => ({
    id: row.id as string,
    description: row.description as string,
    rawDescription: (row.raw_description as string | null) ?? null,
    amount: toBigInt(row.amount),
    cashflow: row.cashflow as CashflowType,
    categoryName: categoryName(row),
    occurredAt: new Date(row.occurred_at as string),
    fromAccountId: (row.from_account_id as string | null) ?? null,
    toAccountId: (row.to_account_id as string | null) ?? null,
    source: row.source as EntrySource,
    categoryLockedAt: row.category_locked_at ? new Date(row.category_locked_at as string) : null,
  }))
}

export interface TransactionDetail {
  row: TransactionRow & {
    deletedAt: Date | null
    confirmedAt: Date | null
    rawDescription: string | null
  }
  /** Live parts this row was split into. */
  children: TransactionRow[]
  /** Bank fees charged for this row. */
  fees: TransactionRow[]
  /** The row this one is a part of, when it is a child. */
  parent: { id: string; description: string; amount: bigint } | null
}

/**
 * One transaction and everything attached to it, for the page that edits it.
 *
 * Deliberately without the `deleted_at is null` filter every other read has: a
 * row that was split is hidden from the ledger and still has to be reachable,
 * or the only way to undo a split would be to know its id by heart.
 */
export async function getTransaction(
  householdId: string,
  id: string,
): Promise<TransactionDetail | null> {
  'use cache: private'
  cacheTag(txTag(householdId))
  cacheLife({ stale: 30 })

  const db = await userScope()
  if (!db) return null

  let row: Row | null
  try {
    row = await db.maybeOne<Row>(sql`
      SELECT ${TRANSACTION_COLUMNS}, t.deleted_at, t.confirmed_at, t.raw_description
      FROM ${TRANSACTIONS}
      WHERE t.household_id = ${householdId} AND t.id = ${id}`)
  } catch (e) {
    // Also what a malformed id in the address bar lands on.
    console.error('[household] read failed', e)
    return null
  }
  if (!row) return null

  const detail = {
    ...toTransactionRow(row),
    deletedAt: row.deleted_at ? new Date(row.deleted_at as string) : null,
    confirmedAt: row.confirmed_at ? new Date(row.confirmed_at as string) : null,
    rawDescription: (row.raw_description as string | null) ?? null,
  }

  const related = await db
    .rows<Row>(sql`
      SELECT ${TRANSACTION_COLUMNS}, t.fee_parent_id
      FROM ${TRANSACTIONS}
      WHERE t.household_id = ${householdId}
        AND t.deleted_at IS NULL
        AND (t.split_of = ${id} OR t.fee_parent_id = ${id})
      ORDER BY t.dedupe_key`)
    .catch(() => [] as Row[])

  const children: TransactionRow[] = []
  const fees: TransactionRow[] = []
  for (const candidate of related) {
    if (candidate.split_of === id) children.push(toTransactionRow(candidate))
    else fees.push(toTransactionRow(candidate))
  }

  let parent: TransactionDetail['parent'] = null
  if (detail.splitOf) {
    const found = await db
      .maybeOne<Row>(sql`
        SELECT id, description, amount FROM public.transactions
        WHERE household_id = ${householdId} AND id = ${detail.splitOf}`)
      .catch(() => null)
    if (found) {
      parent = {
        id: found.id as string,
        description: found.description as string,
        amount: toBigInt(found.amount),
      }
    }
  }

  return { row: detail, children, fees, parent }
}

/**
 * The most recent rows a person typed, for the page they typed them on, and
 * how many there are in all: the count rides on the same request.
 */
export async function getManualEntries(
  householdId: string,
  limit = 10,
): Promise<{ rows: TransactionRow[]; total: number }> {
  'use cache: private'
  cacheTag(txTag(householdId))
  cacheLife({ stale: 30 })

  // The window count is taken before LIMIT, so it counts every manual row.
  const data = await read<Row[]>([], (db) =>
    db.rows(sql`
      SELECT ${TRANSACTION_COLUMNS}, count(*) OVER ()::int AS total
      FROM ${TRANSACTIONS}
      WHERE t.household_id = ${householdId} AND t.source = 'manual' AND t.deleted_at IS NULL
      ORDER BY t.created_at DESC
      LIMIT ${limit}`),
  )
  return { rows: data.map(toTransactionRow), total: (data[0]?.total as number | undefined) ?? 0 }
}

export interface DuplicateSide {
  id: string
  occurredAt: Date
  description: string
  amount: bigint
  cashflow: CashflowType
  source: EntrySource
  categoryId: string | null
  categoryName: string | null
  note: string | null
  confirmedAt: Date | null
}

export interface DuplicatePair {
  manual: DuplicateSide
  imported: DuplicateSide
}

const DUPLICATE_COLUMNS = sql`t.id, t.occurred_at, t.description, t.amount, t.cashflow, t.source, t.category_id,
  t.note, t.confirmed_at, t.duplicate_of, c.name AS category_name`

function toDuplicateSide(row: Row): DuplicateSide {
  return {
    id: row.id as string,
    occurredAt: new Date(row.occurred_at as string),
    description: row.description as string,
    amount: toBigInt(row.amount),
    cashflow: row.cashflow as CashflowType,
    source: row.source as EntrySource,
    categoryId: (row.category_id as string | null) ?? null,
    categoryName: categoryName(row),
    note: (row.note as string | null) ?? null,
    confirmedAt: row.confirmed_at ? new Date(row.confirmed_at as string) : null,
  }
}

/**
 * Manual entries the import thinks it has already seen, paired with the bank
 * row that looks like the same movement.
 *
 * Two queries rather than a self join, kept from when this went through
 * PostgREST: joining two small lists in JavaScript is simple enough. A pair
 * whose bank row has since vanished is dropped rather than half rendered.
 */
export async function getSuspectedDuplicates(householdId: string): Promise<DuplicatePair[]> {
  'use cache: private'
  cacheTag(txTag(householdId))
  cacheLife({ stale: 30 })

  const db = await userScope()
  if (!db) return []

  // A hundred open pairs is already a state nobody reaches.
  const manual = await db
    .rows<Row>(sql`
      SELECT ${DUPLICATE_COLUMNS}
      FROM ${TRANSACTIONS}
      WHERE t.household_id = ${householdId}
        AND t.source = 'manual'
        AND t.deleted_at IS NULL
        AND t.duplicate_of IS NOT NULL
      ORDER BY t.occurred_at DESC
      LIMIT 100`)
    .catch(() => [] as Row[])

  if (manual.length === 0) return []

  const ids = [...new Set(manual.map((row) => row.duplicate_of as string))]
  const imported = await db
    .rows<Row>(sql`
      SELECT ${DUPLICATE_COLUMNS}
      FROM ${TRANSACTIONS}
      WHERE t.household_id = ${householdId}
        AND t.deleted_at IS NULL
        AND t.id = ANY(${sql.param(ids)}::uuid[])`)
    .catch(() => [] as Row[])

  const byId = new Map(imported.map((row) => [row.id as string, toDuplicateSide(row)]))

  const pairs: DuplicatePair[] = []
  for (const row of manual) {
    const partner = byId.get(row.duplicate_of as string)
    if (partner) pairs.push({ manual: toDuplicateSide(row), imported: partner })
  }
  return pairs
}

export interface Usage {
  categories: Record<string, number>
  accounts: Record<string, number>
}

/**
 * How many transactions each category and account carries.
 *
 * Deleted rows count. A soft-deleted row still holds its category, and undoing
 * a split brings it back, so a category that looks unused because its only
 * rows are hidden must not become free to move to another cashflow.
 */
export async function getUsage(householdId: string): Promise<Usage> {
  const usage: Usage = { categories: {}, accounts: {} }
  const data = await read<Row[]>([], (db) =>
    db.rows(sql`
      SELECT category_id, from_account_id, to_account_id
      FROM public.transactions
      WHERE household_id = ${householdId}`),
  )

  for (const row of data) {
    const category = row.category_id as string | null
    if (category) usage.categories[category] = (usage.categories[category] ?? 0) + 1
    for (const side of [row.from_account_id, row.to_account_id] as (string | null)[]) {
      if (side) usage.accounts[side] = (usage.accounts[side] ?? 0) + 1
    }
  }

  return usage
}

export interface BudgetRow {
  categoryId: string
  amount: bigint
}

/**
 * Budgets for one month keyed by category id, for the page that edits them.
 * `getBudgets` stays keyed by name, because that is what the dashboard's
 * actuals are keyed by.
 */
export async function getBudgetRows(householdId: string, period: string): Promise<BudgetRow[]> {
  'use cache: private'
  cacheTag(budgetsTag(householdId))
  cacheLife({ stale: 30 })

  const data = await read<Row[]>([], (db) =>
    db.rows(sql`
      SELECT category_id, amount FROM public.budgets
      WHERE household_id = ${householdId} AND period = ${period}`),
  )
  return data.map((row) => ({
    categoryId: row.category_id as string,
    amount: toBigInt(row.amount),
  }))
}

/**
 * Every stored budget row across a set of months, for the year strip. One
 * indexed query instead of twelve. Callers pass the periods in a
 * deterministic order (they are also the cache key); the rows come back
 * unaggregated so the pure builder owns the arithmetic.
 */
export async function getBudgetsForPeriods(
  householdId: string,
  periods: string[],
): Promise<{ period: string; amount: bigint }[]> {
  'use cache: private'
  cacheTag(budgetsTag(householdId))
  cacheLife({ stale: 30 })

  const data = await read<Row[]>([], (db) =>
    db.rows(sql`
      SELECT period, amount FROM public.budgets
      WHERE household_id = ${householdId} AND period = ANY(${sql.param(periods)}::text[])`),
  )
  return data.map((row) => ({
    period: row.period as string,
    amount: toBigInt(row.amount),
  }))
}

/**
 * The saved planner inputs, or null for a household that has never saved any.
 *
 * Null is also the answer when a stored framework, school track or lifestyle
 * tier is not one this build knows about. A row written by an older deploy
 * with an option since removed would otherwise put the picker into a state it
 * has no entry for, and a planner that starts from the defaults is a smaller
 * loss than one that starts from something incoherent.
 */
export async function getPlan(householdId: string): Promise<PlanValues | null> {
  'use cache: private'
  cacheTag(planTag(householdId))
  cacheLife({ stale: 300 })

  const data = await read(null, (db) =>
    db.maybeOne<Row>(sql`
      SELECT income, adults, children, irregular_income, wants_zakat, framework_id, track, target_tier,
             target_savings, child_plans, goal_target, goal_years, goal_saved, hajj_monthly
      FROM public.plans
      WHERE household_id = ${householdId}`),
  )

  if (!data) return null

  const track = data.track as SchoolTrack
  const targetTier = data.target_tier as LifestyleTier
  if (
    !isKnownFramework(data.framework_id as string) ||
    !SCHOOL_TRACKS.includes(track) ||
    !LIFESTYLE_TIERS.includes(targetTier)
  ) {
    return null
  }

  return {
    income: toBigInt(data.income),
    adults: Number(data.adults),
    children: Number(data.children),
    irregularIncome: Boolean(data.irregular_income),
    wantsZakat: Boolean(data.wants_zakat),
    frameworkId: data.framework_id as string,
    track,
    targetTier,
    targetSavings: toBigInt(data.target_savings),
    childPlans: childPlansFromJson(data.child_plans),
    goalTarget: toBigInt(data.goal_target),
    goalYears: Number(data.goal_years),
    goalSaved: toBigInt(data.goal_saved),
    hajjMonthly: toBigInt(data.hajj_monthly),
  }
}
