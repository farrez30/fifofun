import { createClient } from '@/lib/supabase/server'
import type { CashflowType, LedgerEntry } from '@/lib/ledger/types'

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
  kind: 'bank' | 'ewallet' | 'cash' | 'emoney' | 'investment'
  openingBalance: bigint
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

export async function getAccounts(householdId: string): Promise<AccountRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('accounts')
    .select('id, name, kind, opening_balance')
    .eq('household_id', householdId)
    .is('archived_at', null)
    .order('sort_order')

  if (error || !data) return []
  return data.map((row) => ({
    id: row.id as string,
    name: row.name as string,
    kind: row.kind as AccountRow['kind'],
    openingBalance: toBigInt(row.opening_balance),
  }))
}

export async function getCategories(householdId: string): Promise<CategoryRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('categories')
    .select('id, name, cashflow, opening_balance, target_amount, target_month')
    .eq('household_id', householdId)
    .is('archived_at', null)
    .order('name')

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
  }))
}

export interface TransactionRow extends LedgerEntry {
  categoryName: string | null
  needsReview: boolean
  isPassThrough: boolean
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
    .select(
      'id, occurred_at, description, amount, cashflow, category_id, from_account_id, to_account_id, source, external_ref, note, needs_review, is_pass_through, categories(name)',
    )
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

  return data.map((row) => {
    const joined = row.categories as { name: string } | { name: string }[] | null
    const categoryName = Array.isArray(joined) ? (joined[0]?.name ?? null) : (joined?.name ?? null)

    return {
      id: row.id as string,
      occurredAt: new Date(row.occurred_at as string),
      description: row.description as string,
      amount: toBigInt(row.amount),
      cashflow: row.cashflow as CashflowType,
      categoryId: (row.category_id as string | null) ?? null,
      fromAccountId: (row.from_account_id as string | null) ?? null,
      toAccountId: (row.to_account_id as string | null) ?? null,
      source: row.source as LedgerEntry['source'],
      externalRef: (row.external_ref as string | null) ?? null,
      note: (row.note as string | null) ?? null,
      categoryName,
      needsReview: Boolean(row.needs_review),
      isPassThrough: Boolean(row.is_pass_through),
    }
  })
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
      .select('id, description, raw_description, amount, cashflow, occurred_at, categories(name)')
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
      const joined = row.categories as { name: string } | { name: string }[] | null
      all.push({
        id: row.id as string,
        description: row.description as string,
        rawDescription: (row.raw_description as string | null) ?? null,
        amount: toBigInt(row.amount),
        cashflow: row.cashflow as CashflowType,
        categoryName: Array.isArray(joined) ? (joined[0]?.name ?? null) : (joined?.name ?? null),
        occurredAt: new Date(row.occurred_at as string),
      })
    }

    if (data.length < PAGE_SIZE) break
  }

  return all
}
