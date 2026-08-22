import { createClient } from '@/lib/supabase/server'
import { parseHue } from '@/lib/ledger/palette'
import type { AccountKind, CashflowType, EntrySource, LedgerEntry } from '@/lib/ledger/types'
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
 * These go through supabase-js rather than Drizzle on purpose. Drizzle connects
 * as the database owner, which bypasses row level security entirely; that is
 * correct for migrations and seeding, and completely wrong for serving a
 * request. Going through PostgREST means every read carries the user's token
 * and the policies decide what comes back, so a mistake in this file cannot
 * expose another household's data.
 *
 * PostgREST returns `bigint` columns as strings, since JSON numbers cannot hold
 * them safely. Every amount is converted back to `bigint` here, at the boundary,
 * so no string ever reaches the money functions.
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
  openingBalanceAt: Date | null
  sortOrder: number
  archivedAt: Date | null
}

export interface CategoryRow {
  id: string
  name: string
  cashflow: CashflowType
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
  /** Phosphor icon name, or null to fall back to the cashflow's own. */
  icon: string | null
  /** Stored hue 0 to 359, or null to fall back to the palette. */
  hue: number | null
  sortOrder: number
  archivedAt: Date | null
}

/** Archived rows are hidden from every picker, and kept for the rows that used them. */
export interface ListOptions {
  includeArchived?: boolean
}

function toBigInt(value: unknown): bigint {
  if (typeof value === 'bigint') return value
  if (typeof value === 'string') return BigInt(value)
  if (typeof value === 'number') return BigInt(Math.round(value))
  return 0n
}

/** The household the signed-in user belongs to, or null if they have none yet. */
export async function getHousehold(): Promise<HouseholdSummary | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('households')
    .select('id, name, timezone, currency')
    .limit(1)
    .maybeSingle()

  if (error || !data) return null
  return data as HouseholdSummary
}

export async function getAccounts(
  householdId: string,
  options: ListOptions = {},
): Promise<AccountRow[]> {
  const supabase = await createClient()
  let query = supabase
    .from('accounts')
    .select(
      'id, name, kind, opening_balance, opening_balance_at, key, institution, own_identifiers, sort_order, archived_at',
    )
    .eq('household_id', householdId)
    .order('sort_order')
    .order('name')

  if (!options.includeArchived) query = query.is('archived_at', null)

  const { data, error } = await query
  if (error || !data) return []
  return data.map((row) => ({
    id: row.id as string,
    name: row.name as string,
    kind: row.kind as AccountKind,
    openingBalance: toBigInt(row.opening_balance),
    key: (row.key as string | null) ?? null,
    institution: (row.institution as string | null) ?? null,
    ownIdentifiers: (row.own_identifiers as string[] | null) ?? [],
    openingBalanceAt: row.opening_balance_at ? new Date(row.opening_balance_at as string) : null,
    sortOrder: (row.sort_order as number) ?? 0,
    archivedAt: row.archived_at ? new Date(row.archived_at as string) : null,
  }))
}

export async function getCategories(
  householdId: string,
  options: ListOptions = {},
): Promise<CategoryRow[]> {
  const supabase = await createClient()
  let query = supabase
    .from('categories')
    .select(
      'id, name, cashflow, opening_balance, target_amount, target_month, planned_monthly, planned_share_bp, icon, color, sort_order, archived_at',
    )
    .eq('household_id', householdId)
    // Ordered by the household's own arrangement, with the name as the
    // tiebreak. Before the numbering migration every row carried zero, so the
    // tiebreak alone reproduces the alphabetical order this used to have.
    .order('sort_order')
    .order('name')

  if (!options.includeArchived) query = query.is('archived_at', null)

  const { data, error } = await query
  if (error || !data) return []

  // PostgREST returns bigint columns as strings, because JSON numbers cannot
  // hold them. Converting here keeps every amount in the app a bigint of sen.
  return data.map((row) => ({
    id: row.id as string,
    name: row.name as string,
    cashflow: row.cashflow as CashflowType,
    openingBalance: BigInt(row.opening_balance ?? 0),
    target: row.target_amount === null ? null : BigInt(row.target_amount),
    targetMonth: (row.target_month as string | null) ?? null,
    plannedMonthly: row.planned_monthly === null ? null : toBigInt(row.planned_monthly),
    plannedShareBp: (row.planned_share_bp as number | null) ?? null,
    icon: (row.icon as string | null) ?? null,
    hue: parseHue(row.color),
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
const TRANSACTION_COLUMNS =
  'id, occurred_at, description, amount, cashflow, category_id, from_account_id, to_account_id, source, external_ref, note, needs_review, is_pass_through, duplicate_of, split_of, categories(name)'

type Row = Record<string, unknown>

function joinedName(value: unknown): string | null {
  const joined = value as { name: string } | { name: string }[] | null
  return Array.isArray(joined) ? (joined[0]?.name ?? null) : (joined?.name ?? null)
}

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
    categoryName: joinedName(row.categories),
    needsReview: Boolean(row.needs_review),
    isPassThrough: Boolean(row.is_pass_through),
    duplicateOf: (row.duplicate_of as string | null) ?? null,
    splitOf: (row.split_of as string | null) ?? null,
  }
}

interface FetchOptions {
  from?: Date
  to?: Date
  limit?: number
  offset?: number
}

/** Transactions for a household, newest first. */
export async function getTransactions(
  householdId: string,
  options: FetchOptions = {},
): Promise<TransactionRow[]> {
  const supabase = await createClient()

  let query = supabase
    .from('transactions')
    .select(TRANSACTION_COLUMNS)
    .eq('household_id', householdId)
    .is('deleted_at', null)
    .order('occurred_at', { ascending: false })

  if (options.from) query = query.gte('occurred_at', options.from.toISOString())
  if (options.to) query = query.lt('occurred_at', options.to.toISOString())
  if (options.limit !== undefined) {
    const start = options.offset ?? 0
    // `range` is inclusive at both ends, so the end index is one short.
    query = query.range(start, start + options.limit - 1)
  }

  const { data, error } = await query
  if (error || !data) return []

  return data.map(toTransactionRow)
}

/**
 * PostgREST caps a response at 1000 rows regardless of the limit asked for, and
 * does so silently. A truncated ledger still renders perfectly happily, just
 * with months missing from the totals, so every full read pages explicitly
 * rather than trusting a single request to return everything.
 */
const PAGE_SIZE = 1000

/** Every transaction, used by the yearly views. Ordered oldest first. */
export async function getAllTransactions(householdId: string): Promise<TransactionRow[]> {
  const all: TransactionRow[] = []

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await getTransactions(householdId, { offset, limit: PAGE_SIZE })
    all.push(...page)
    if (page.length < PAGE_SIZE) break
  }

  return all.reverse()
}

/**
 * The spendable balance the ledger starts from: the opening balance printed on
 * the earliest statement imported. Without it every "Sisa uang" figure is an
 * offset from zero rather than a real balance.
 */
export async function getOpeningBalance(householdId: string): Promise<bigint> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('import_batches')
    .select('opening_balance')
    .eq('household_id', householdId)
    .order('period_start', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error || !data) return 0n
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
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('budgets')
    .select('amount, categories(name)')
    .eq('household_id', householdId)
    .eq('period', period)

  if (error || !data) return {}

  const budgets: Record<string, bigint> = {}
  for (const row of data) {
    const joined = row.categories as { name: string } | { name: string }[] | null
    const name = Array.isArray(joined) ? joined[0]?.name : joined?.name
    if (name) budgets[name] = toBigInt(row.amount)
  }
  return budgets
}

/** The closing balance the bank printed on the most recent statement imported. */
export async function getLatestClosingBalance(
  householdId: string,
): Promise<{ closing: bigint; periodEnd: Date } | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('import_batches')
    .select('closing_balance, period_end')
    .eq('household_id', householdId)
    .eq('status', 'reconciled')
    .order('period_end', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data?.period_end) return null
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
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('categorization_rules')
    .select('id, priority, match_type, pattern, cashflow, category_id, auto_apply, hit_count, categories(name)')
    .eq('household_id', householdId)
    .order('priority')

  if (error || !data) return []

  return data.map((row) => {
    const joined = row.categories as { name: string } | { name: string }[] | null
    return {
      id: row.id as string,
      priority: row.priority as number,
      matchType: row.match_type as RuleRow['matchType'],
      pattern: row.pattern as string,
      cashflow: (row.cashflow as CashflowType | null) ?? null,
      categoryId: (row.category_id as string | null) ?? null,
      categoryName: Array.isArray(joined) ? (joined[0]?.name ?? null) : (joined?.name ?? null),
      autoApply: Boolean(row.auto_apply),
      hitCount: (row.hit_count as number) ?? 0,
    }
  })
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
}

/**
 * Rows whose category is still the importer's guess.
 *
 * Transfers are left out: their category is decided by which accounts they move
 * money between, not by a person's judgement, and asking about them would bury
 * the rows that actually need an opinion.
 */
export async function getUnconfirmed(householdId: string): Promise<UnconfirmedRow[]> {
  const supabase = await createClient()
  const all: UnconfirmedRow[] = []

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('transactions')
      .select(
        'id, description, raw_description, amount, cashflow, occurred_at, from_account_id, to_account_id, source, categories(name)',
      )
      .eq('household_id', householdId)
      .is('deleted_at', null)
      .is('confirmed_at', null)
      .neq('cashflow', 'transfer')
      .neq('source', 'manual')
      // Paging on a non-unique sort key lets rows swap between pages, so a row
      // can appear twice or not at all. Amounts repeat constantly in a ledger,
      // so the id is there purely to make the order total.
      .order('amount', { ascending: false })
      .order('id')
      .range(offset, offset + PAGE_SIZE - 1)

    if (error || !data) break

    for (const row of data) {
      all.push({
        id: row.id as string,
        description: row.description as string,
        rawDescription: (row.raw_description as string | null) ?? null,
        amount: toBigInt(row.amount),
        cashflow: row.cashflow as CashflowType,
        categoryName: joinedName(row.categories),
        occurredAt: new Date(row.occurred_at as string),
        fromAccountId: (row.from_account_id as string | null) ?? null,
        toAccountId: (row.to_account_id as string | null) ?? null,
        source: row.source as EntrySource,
      })
    }

    if (data.length < PAGE_SIZE) break
  }

  return all
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
  const supabase = await createClient()

  const { data: row, error } = await supabase
    .from('transactions')
    .select(`${TRANSACTION_COLUMNS}, deleted_at, confirmed_at, raw_description`)
    .eq('household_id', householdId)
    .eq('id', id)
    .maybeSingle()

  if (error || !row) return null

  const detail = {
    ...toTransactionRow(row),
    deletedAt: row.deleted_at ? new Date(row.deleted_at as string) : null,
    confirmedAt: row.confirmed_at ? new Date(row.confirmed_at as string) : null,
    rawDescription: (row.raw_description as string | null) ?? null,
  }

  const { data: related } = await supabase
    .from('transactions')
    .select(`${TRANSACTION_COLUMNS}, fee_parent_id`)
    .eq('household_id', householdId)
    .is('deleted_at', null)
    .or(`split_of.eq.${id},fee_parent_id.eq.${id}`)
    .order('dedupe_key')

  const children: TransactionRow[] = []
  const fees: TransactionRow[] = []
  for (const candidate of related ?? []) {
    if (candidate.split_of === id) children.push(toTransactionRow(candidate))
    else fees.push(toTransactionRow(candidate))
  }

  let parent: TransactionDetail['parent'] = null
  if (detail.splitOf) {
    const { data: found } = await supabase
      .from('transactions')
      .select('id, description, amount')
      .eq('household_id', householdId)
      .eq('id', detail.splitOf)
      .maybeSingle()
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

/** The most recent rows a person typed, for the page they typed them on. */
export async function getManualEntries(householdId: string, limit = 10): Promise<TransactionRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('transactions')
    .select(TRANSACTION_COLUMNS)
    .eq('household_id', householdId)
    .eq('source', 'manual')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error || !data) return []
  return data.map(toTransactionRow)
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

const DUPLICATE_COLUMNS =
  'id, occurred_at, description, amount, cashflow, source, category_id, note, confirmed_at, duplicate_of, categories(name)'

function toDuplicateSide(row: Row): DuplicateSide {
  return {
    id: row.id as string,
    occurredAt: new Date(row.occurred_at as string),
    description: row.description as string,
    amount: toBigInt(row.amount),
    cashflow: row.cashflow as CashflowType,
    source: row.source as EntrySource,
    categoryId: (row.category_id as string | null) ?? null,
    categoryName: joinedName(row.categories),
    note: (row.note as string | null) ?? null,
    confirmedAt: row.confirmed_at ? new Date(row.confirmed_at as string) : null,
  }
}

/**
 * Manual entries the import thinks it has already seen, paired with the bank
 * row that looks like the same movement.
 *
 * Two queries rather than an embed: a self reference has no unambiguous hint
 * in PostgREST, and joining two small lists in JavaScript is cheaper than
 * arguing with it. A pair whose bank row has since vanished is dropped rather
 * than half rendered.
 */
export async function getSuspectedDuplicates(householdId: string): Promise<DuplicatePair[]> {
  const supabase = await createClient()

  const { data: manual, error } = await supabase
    .from('transactions')
    .select(DUPLICATE_COLUMNS)
    .eq('household_id', householdId)
    .eq('source', 'manual')
    .is('deleted_at', null)
    .not('duplicate_of', 'is', null)
    .order('occurred_at', { ascending: false })
    // A hundred open pairs is already a state nobody reaches, and the cap keeps
    // the second query's id list inside what PostgREST puts in a query string.
    .limit(100)

  if (error || !manual || manual.length === 0) return []

  const ids = [...new Set(manual.map((row) => row.duplicate_of as string))]
  const { data: imported } = await supabase
    .from('transactions')
    .select(DUPLICATE_COLUMNS)
    .eq('household_id', householdId)
    .is('deleted_at', null)
    .in('id', ids)

  const byId = new Map((imported ?? []).map((row) => [row.id as string, toDuplicateSide(row)]))

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
  const supabase = await createClient()
  const usage: Usage = { categories: {}, accounts: {} }

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('transactions')
      .select('category_id, from_account_id, to_account_id')
      .eq('household_id', householdId)
      .order('id')
      .range(offset, offset + PAGE_SIZE - 1)

    if (error || !data) break

    for (const row of data) {
      const category = row.category_id as string | null
      if (category) usage.categories[category] = (usage.categories[category] ?? 0) + 1
      for (const side of [row.from_account_id, row.to_account_id] as (string | null)[]) {
        if (side) usage.accounts[side] = (usage.accounts[side] ?? 0) + 1
      }
    }

    if (data.length < PAGE_SIZE) break
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
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('budgets')
    .select('category_id, amount')
    .eq('household_id', householdId)
    .eq('period', period)

  if (error || !data) return []
  return data.map((row) => ({
    categoryId: row.category_id as string,
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
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('plans')
    .select(
      'income, adults, children, irregular_income, wants_zakat, framework_id, track, target_tier, target_savings, child_plans, goal_target, goal_years, goal_saved, hajj_monthly',
    )
    .eq('household_id', householdId)
    .maybeSingle()

  if (error || !data) return null

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
