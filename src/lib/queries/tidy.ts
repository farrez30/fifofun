import { groupIds } from '@/lib/ledger/settings'
import { planTidy, type TidyPlan, type TidyTarget } from '@/lib/ledger/tidy'
import type { Rule } from '@/lib/ledger/rules'
import { getCategories, getRules, getUnconfirmed } from './household'

export interface LedgerTidy {
  plan: TidyPlan
  /** The categories a row may be redirected to, and which of them are groups. */
  targets: TidyTarget[]
  groups: Set<string>
}

/**
 * What tidying would do, for the panel that shows it and the action that does
 * it. Reading it twice is cheaper than storing a plan that could go stale
 * between the render and the click.
 *
 * The catalogue comes back with the plan because the action needs it to judge a
 * redirected row, and fetching it a second time there would be the same query
 * against a ledger that may have moved underneath it.
 */
export async function planLedgerTidy(householdId: string): Promise<LedgerTidy> {
  const [rows, rules, categories] = await Promise.all([
    getUnconfirmed(householdId, { includeSettled: true }),
    getRules(householdId),
    getCategories(householdId),
  ])

  const groups = groupIds(categories)
  const targets = categories
    .filter((category) => !groups.has(category.id))
    .map((category) => ({
      id: category.id,
      name: category.name,
      cashflow: category.cashflow,
    }))

  return { plan: planTidy(rows, rules as Rule[], targets), targets, groups }
}
