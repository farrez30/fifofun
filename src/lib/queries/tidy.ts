import { groupIds } from '@/lib/ledger/settings'
import { planTidy, type TidyPlan } from '@/lib/ledger/tidy'
import type { Rule } from '@/lib/ledger/rules'
import { getCategories, getRules, getUnconfirmed } from './household'

/**
 * What tidying would do, for the panel that shows it and the action that does
 * it. Reading it twice is cheaper than storing a plan that could go stale
 * between the render and the click.
 */
export async function planLedgerTidy(householdId: string): Promise<TidyPlan> {
  const [rows, rules, categories] = await Promise.all([
    getUnconfirmed(householdId, { includeSettled: true }),
    getRules(householdId),
    getCategories(householdId),
  ])

  const groups = groupIds(categories)
  return planTidy(
    rows,
    rules as Rule[],
    categories
      .filter((category) => !groups.has(category.id))
      .map((category) => ({
        id: category.id,
        name: category.name,
        cashflow: category.cashflow,
      })),
  )
}
