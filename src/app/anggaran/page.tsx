import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { AppShell } from '@/components/app-shell'
import { buildBudgetPlan, parseMonthParam, type BudgetCategory } from '@/lib/ledger/budget-plan'
import { rollUpByMonthAndCategory } from '@/lib/ledger/categories'
import { addMonths } from '@/lib/ledger/funds'
import { monthKeyOf, monthKeyToString } from '@/lib/ledger/monthly'
import {
  getAllTransactions,
  getBudgetRows,
  getCategories,
  getHousehold,
} from '@/lib/queries/household'
import { getUser } from '@/lib/supabase/server'
import { BudgetTable } from './budget-table'
import { MonthNav } from './month-nav'

export const metadata: Metadata = { title: 'Anggaran' }

/**
 * What a month is allowed to cost.
 *
 * The dashboard has judged spending against a budget since the beginning, and
 * until now the only budget it could judge against was one derived from the
 * household's own median: a figure nobody chose, which cannot be exceeded in
 * any way that means anything. This is where a household actually decides.
 *
 * The month defaults to the current one rather than to the last month with
 * data, which is where the dashboard starts. Budgeting is about the month
 * being lived, and a link from the dashboard always carries its own `?bulan=`.
 */

function BudgetSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-busy="true" aria-label="Memuat anggaran">
      <div className="skeleton h-12 border border-line" />
      <div className="skeleton h-96 border border-line" />
    </div>
  )
}

async function Budgets({ params }: { params: Record<string, string | string[] | undefined> }) {
  const household = await getHousehold()
  if (!household) redirect('/gabung')

  const thisMonth = monthKeyToString(monthKeyOf(new Date()))
  const period = parseMonthParam(params.bulan, thisMonth)
  const previous = addMonths(period, -1)

  const [transactions, categories, saved, previousSaved] = await Promise.all([
    getAllTransactions(household.id),
    getCategories(household.id),
    getBudgetRows(household.id, period),
    getBudgetRows(household.id, previous),
  ])

  const budgetable: BudgetCategory[] = categories
    .filter((category) => category.cashflow === 'spending' || category.cashflow === 'bills')
    .map((category) => ({
      id: category.id,
      name: category.name,
      cashflow: category.cashflow,
      icon: category.icon,
      hue: category.hue,
    }))

  if (budgetable.length === 0) {
    return (
      <div className="border border-line bg-surface p-6">
        <p className="text-sm font-medium text-ink">Belum ada kategori Spending atau Bills.</p>
        <p className="mt-2 text-sm text-ink-muted">
          Anggaran ditetapkan per kategori pengeluaran.{' '}
          <a href="/pengaturan#kategori" className="text-accent underline underline-offset-2">
            Buat dulu satu di Pengaturan
          </a>
          .
        </p>
      </div>
    )
  }

  /*
    Rolled up by category id rather than by name, which the rollup does without
    a second implementation: the name it groups on is whatever is handed to it,
    and here that is the id. Keying on the name would merge a spending category
    and a bills category that happen to share one.
  */
  const history = rollUpByMonthAndCategory(
    transactions.map((tx) => ({ ...tx, categoryName: tx.categoryId })),
  )

  const plan = buildBudgetPlan({
    period,
    previous,
    categories: budgetable,
    history,
    saved: Object.fromEntries(saved.map((row) => [row.categoryId, row.amount])),
    previousSaved: Object.fromEntries(previousSaved.map((row) => [row.categoryId, row.amount])),
  })

  return (
    <div className="space-y-5">
      <MonthNav period={period} thisMonth={thisMonth} />
      <BudgetTable plan={plan} />
    </div>
  )
}

export default async function AnggaranPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await getUser()
  if (!user) redirect('/login')

  const params = await searchParams

  return (
    <AppShell
      title="Anggaran"
      email={user.email ?? ''}
      current="/anggaran"
      lead="Tetapkan batas per kategori untuk satu bulan. Biasanya dan bulan lalu ada di samping kolomnya supaya angkanya tidak ditebak dari kosong."
    >
      <Suspense key={JSON.stringify(params)} fallback={<BudgetSkeleton />}>
        <Budgets params={params} />
      </Suspense>
    </AppShell>
  )
}
