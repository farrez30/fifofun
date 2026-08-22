import type { SankeyLink, SankeyNode } from '@/components/chart/sankey'
import { totalsByCategory } from './categories'
import type { MonthlyStatement } from './monthly'
import type { CashflowType, LedgerEntry } from './types'

/**
 * One month turned into the flow diagram's nodes and links.
 *
 * Three columns: what came in, where it was earmarked, and what the largest
 * single destination broke down into. Only the top few categories are drawn by
 * name; the rest are gathered into one node, because twenty ribbons a pixel wide
 * carry no information and make the ones that matter unreadable.
 *
 * Which destination gets opened up is decided from the figures rather than fixed
 * to spending. That is what the description above always claimed, and it was not
 * true: a household whose eleven subscriptions outweigh its groceries was being
 * shown the breakdown of the smaller of the two, every month, with nothing on
 * the page admitting the choice had been made for them.
 *
 * The node and link shapes come from the chart rather than being restated here.
 * They are types only, so nothing of the component is pulled in at runtime, and
 * a parallel set of shapes to map between would be more code that could drift.
 */

/*
  Widened the same way the roll-up widens it. The category name is resolved by
  the query layer rather than stored on the entry, and a signature that did not
  ask for it would compile against entries this cannot break down at all.
*/
type Entry = LedgerEntry & { categoryName?: string | null; isPassThrough?: boolean }

/** Cashflow types whose categories are worth a column of their own. */
const DRILLABLE = ['spending', 'bills', 'invest_savings', 'financial_goal'] as const

/** How many categories are drawn by name before the tail is folded away. */
const NAMED_LIMIT = 6

export interface CategoryTotal {
  category: string
  amount: bigint
}

export interface MonthFlow {
  nodes: SankeyNode[]
  links: SankeyLink[]
  /** Categories gathered into the tail node, so the panel can still list them. */
  folded: CategoryTotal[]
  /** The destination that was broken down, or null when none could be. */
  foldedInto: string | null
}

export interface FlowOptions {
  /**
   * `largest` opens the single biggest destination, which is what a diagram
   * drawn in one screen can hold. `all` opens every destination that has
   * categories, including sinking funds and instalments, which the single
   * drill deliberately skips because they usually hold one category each.
   */
  drill?: 'largest' | 'all'
  /** How many categories keep their own name per destination. Null names them all. */
  namedLimit?: number | null
  /** The hue that identifies a category everywhere else in the app. */
  hueOf?: (category: string) => number
}

export function buildFlow(
  statement: MonthlyStatement,
  entries: Entry[],
  options: FlowOptions = {},
): MonthFlow {
  const drill = options.drill ?? 'largest'
  const namedLimit = options.namedLimit === undefined ? NAMED_LIMIT : options.namedLimit
  const nodes: SankeyNode[] = [{ id: 'in', label: 'Pemasukan', column: 0, tone: 'income' }]
  const links: SankeyLink[] = []

  const buckets: {
    id: string
    label: string
    amount: bigint
    tone: SankeyNode['tone']
    cashflow: CashflowType
  }[] = [
    {
      id: 'spending',
      label: 'Pengeluaran',
      amount: statement.spending,
      tone: 'spend',
      cashflow: 'spending',
    },
    { id: 'bills', label: 'Tagihan', amount: statement.bills, tone: 'spend', cashflow: 'bills' },
    {
      id: 'invest',
      label: 'Investasi',
      amount: statement.investSavings,
      tone: 'save',
      cashflow: 'invest_savings',
    },
    {
      id: 'sinking',
      label: 'Sinking fund',
      amount: statement.sinkingFund,
      tone: 'save',
      cashflow: 'sinking_fund',
    },
    {
      id: 'goals',
      label: 'Tujuan',
      amount: statement.financialGoals,
      tone: 'save',
      cashflow: 'financial_goal',
    },
    {
      id: 'debt',
      label: 'Cicilan',
      amount: statement.debtPayment,
      tone: 'warn',
      cashflow: 'debt_payment',
    },
  ]

  for (const bucket of buckets) {
    if (bucket.amount <= 0n) continue
    nodes.push({ id: bucket.id, label: bucket.label, column: 1, tone: bucket.tone })
    links.push({ source: 'in', target: bucket.id, value: bucket.amount })
  }

  // What was not spent is a destination like any other, and showing it as one is
  // the difference between a diagram that balances and one that quietly does not.
  const kept = statement.sisaUang - statement.saldoAwal
  if (kept > 0n) {
    nodes.push({ id: 'kept', label: 'Sisa', column: 1, tone: 'income' })
    links.push({ source: 'in', target: 'kept', value: kept })
  }

  /*
    Which destinations get opened up.

    By size, among those that have categories at all. A bucket holding one
    category breaks down into a single ribbon of its own width, which is a
    column that says nothing, so the single-drill mode wants two as a floor.
    Opening every destination is a different picture with a different job:
    there, one category is still worth naming, because the question is where
    the money went rather than which pile is largest.
  */
  const candidates = buckets
    .map((bucket) => ({
      bucket,
      categories:
        bucket.amount > 0n
          ? totalsByCategory(entries, { cashflows: [bucket.cashflow] }).filter(
              (row) => row.amount > 0n,
            )
          : [],
    }))
    .filter((candidate) =>
      drill === 'all'
        ? candidate.categories.length >= 1
        : (DRILLABLE as readonly CashflowType[]).includes(candidate.bucket.cashflow) &&
          candidate.categories.length > 1,
    )
    .sort((a, b) => (b.bucket.amount > a.bucket.amount ? 1 : -1))

  const opened = drill === 'all' ? candidates : candidates.slice(0, 1)
  if (opened.length === 0) return { nodes, links, folded: [], foldedInto: null }

  const folded: CategoryTotal[] = []

  opened.forEach(({ bucket, categories }, rank) => {
    const named = namedLimit === null ? categories : categories.slice(0, namedLimit)
    const tail = namedLimit === null ? [] : categories.slice(namedLimit)
    const rest = tail.reduce((sum, row) => sum + row.amount, 0n)
    folded.push(...tail)

    for (const row of named) {
      nodes.push({
        // Prefixed by its destination, because the same category name can sit
        // under two of them and one id would merge two different ribbons.
        id: `cat-${bucket.id}-${row.category}`,
        label: row.category,
        column: 2,
        tone: bucket.tone,
        hue: options.hueOf?.(row.category),
        // Keeps a destination's categories together in the column, in the same
        // order as the destinations themselves.
        order: rank,
      })
      links.push({
        source: bucket.id,
        target: `cat-${bucket.id}-${row.category}`,
        value: row.amount,
      })
    }

    if (rest > 0n) {
      nodes.push({
        id: `cat-rest-${bucket.id}`,
        label: `${tail.length} kategori lain`,
        column: 2,
        tone: 'neutral',
        order: rank,
      })
      links.push({ source: bucket.id, target: `cat-rest-${bucket.id}`, value: rest })
    }
  })

  return {
    nodes,
    links,
    folded,
    // Only meaningful when exactly one destination was opened; with several,
    // the folded tail belongs to no single one of them.
    foldedInto: opened.length === 1 ? opened[0].bucket.label : null,
  }
}
