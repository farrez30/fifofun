import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { AppShell } from '@/components/app-shell'
import { FUND_CASHFLOWS, reviewFunds, type FundCashflow, type FundCategory } from '@/lib/ledger/funds'
import { getAllTransactions, getCategories, getHousehold } from '@/lib/queries/household'
import { getUser } from '@/lib/supabase/server'
import { FundsPanel } from './funds-panel'

export const metadata: Metadata = { title: 'Dana' }

/**
 * Savings, sinking funds and goals, with their progress read from the ledger.
 *
 * The spreadsheet's Financial Goals and Sinking Fund recaps, minus the part
 * where the progress figure is typed in beside the target and drifts away from
 * the transactions that were supposed to produce it.
 */

function FundsSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-busy="true" aria-label="Memuat pos dana">
      <div className="skeleton h-20 border border-line" />
      <div className="skeleton h-96 border border-line" />
    </div>
  )
}

async function Funds() {
  const household = await getHousehold()
  if (!household) {
    return (
      <div className="border border-line bg-surface p-10 text-center">
        <h2 className="text-base font-medium text-ink">Akun belum terhubung ke rumah tangga</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-ink-muted">
          Jalankan seed dengan alamat email akun ini untuk menautkannya.
        </p>
      </div>
    )
  }

  const [categories, transactions] = await Promise.all([
    getCategories(household.id),
    getAllTransactions(household.id),
  ])

  const pots = categories.filter((category) =>
    (FUND_CASHFLOWS as readonly string[]).includes(category.cashflow),
  )

  const funds: FundCategory[] = pots.map((category) => ({
    name: category.name,
    cashflow: category.cashflow as FundCashflow,
    openingBalance: category.openingBalance,
    target: category.target,
    targetMonth: category.targetMonth,
  }))

  const review = reviewFunds(transactions, funds)

  // Keyed on both, because the categories table lets the same name exist under
  // two cashflow types and a goal called Tabungan is not the savings pot.
  const idByKey = new Map(pots.map((category) => [`${category.cashflow}|${category.name}`, category.id]))

  return (
    <FundsPanel
      review={review}
      idOf={(fund) => idByKey.get(`${fund.cashflow}|${fund.name}`)}
      caption="Setoran dihitung dari transaksi bercashflow Invest/Savings, Sinking Fund dan Financial Goals. Pengambilan dihitung dari transaksi Dari Asset/Saving dengan nama pos yang sama. Targetnya satu-satunya angka di halaman ini yang kamu ketik sendiri."
    />
  )
}

export default async function DanaPage() {
  const user = await getUser()
  if (!user) redirect('/login')

  return (
    <AppShell
      title="Dana"
      email={user.email ?? ''}
      current="/dana"
      lead="Tabungan, sinking fund dan tujuan, beserta laju setorannya."
    >
      <Suspense fallback={<FundsSkeleton />}>
        <Funds />
      </Suspense>
    </AppShell>
  )
}
