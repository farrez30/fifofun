import type { SankeyLink, SankeyNode } from '@/components/chart/sankey'
import { totalsByCategory } from './categories'
import type { MonthlyStatement } from './monthly'
import type { LedgerEntry } from './types'

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

/** Which column one node each of those feeds. */
const BUCKET_OF: Record<(typeof DRILLABLE)[number], string> = {
  spending: 'spending',
  bills: 'bills',
  invest_savings: 'invest',
  financial_goal: 'goals',
}

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

export function buildFlow(statement: MonthlyStatement, entries: Entry[]): MonthFlow {
  const nodes: SankeyNode[] = [{ id: 'in', label: 'Pemasukan', column: 0, tone: 'income' }]
  const links: SankeyLink[] = []

  const buckets: { id: string; label: string; amount: bigint; tone: SankeyNode['tone'] }[] = [
    { id: 'spending', label: 'Pengeluaran', amount: statement.spending, tone: 'spend' },
    { id: 'bills', label: 'Tagihan', amount: statement.bills, tone: 'spend' },
    { id: 'invest', label: 'Investasi', amount: statement.investSavings, tone: 'save' },
    { id: 'sinking', label: 'Sinking fund', amount: statement.sinkingFund, tone: 'save' },
    { id: 'goals', label: 'Tujuan', amount: statement.financialGoals, tone: 'save' },
    { id: 'debt', label: 'Cicilan', amount: statement.debtPayment, tone: 'warn' },
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
    The destination worth opening up, by size, among those that have categories
    at all. A bucket holding one category breaks down into a single ribbon of its
    own width, which is a column that says nothing, so two is the floor.
  */
  const drilled = DRILLABLE.map((cashflow) => {
    const bucket = buckets.find((candidate) => candidate.id === BUCKET_OF[cashflow])
    return {
      bucket,
      categories:
        bucket && bucket.amount > 0n
          ? totalsByCategory(entries, { cashflows: [cashflow] }).filter((row) => row.amount > 0n)
          : [],
    }
  })
    .filter((candidate) => candidate.bucket !== undefined && candidate.categories.length > 1)
    .sort((a, b) => (b.bucket!.amount > a.bucket!.amount ? 1 : -1))
    .at(0)

  if (!drilled?.bucket) return { nodes, links, folded: [], foldedInto: null }

  const { bucket, categories } = drilled
  const named = categories.slice(0, NAMED_LIMIT)
  const folded = categories.slice(NAMED_LIMIT)
  const rest = folded.reduce((sum, row) => sum + row.amount, 0n)

  for (const row of named) {
    nodes.push({ id: `cat-${row.category}`, label: row.category, column: 2, tone: bucket.tone })
    links.push({ source: bucket.id, target: `cat-${row.category}`, value: row.amount })
  }

  if (rest > 0n) {
    nodes.push({
      id: 'cat-rest',
      label: `${folded.length} kategori lain`,
      column: 2,
      tone: 'neutral',
    })
    links.push({ source: bucket.id, target: 'cat-rest', value: rest })
  }

  return { nodes, links, folded, foldedInto: bucket.label }
}
