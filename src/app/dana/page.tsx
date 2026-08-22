import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { AppShell } from '@/components/app-shell'
import { FUND_CASHFLOWS, reviewFunds, type FundCashflow, type FundCategory } from '@/lib/ledger/funds'
import { monthKeyOf, monthKeyToString, computeMonthlySeries } from '@/lib/ledger/monthly'
import { typicalIncome } from '@/lib/ledger/snapshot'
import {
  getAllTransactions,
  getCategories,
  getHousehold,
  getOpeningBalance,
} from '@/lib/queries/household'
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
    // An account with no household has nothing to show and, until /gabung
    // existed, nothing to do about it either. One of these used to tell whoever
    // read it to run the seed script, which is an instruction for the person
    // who built the app shown to the person who did not.
    redirect('/gabung')
  }

  const [categories, transactions, openingBalance] = await Promise.all([
    getCategories(household.id),
    getAllTransactions(household.id),
    getOpeningBalance(household.id),
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
    plannedMonthly: category.plannedMonthly,
    plannedShareBp: category.plannedShareBp,
  }))

  /*
    The median income from the ledger, which is what a contribution written as
    a share of income is a share of. Nobody types their salary on this page,
    and asking them to would be asking for a figure the app already knows.
  */
  const income = typicalIncome(computeMonthlySeries(transactions, openingBalance))
  const asOf = transactions.reduce(
    (latest, entry) => {
      const month = monthKeyToString(monthKeyOf(entry.occurredAt))
      return month > latest ? month : latest
    },
    '',
  )

  const review = reviewFunds(transactions, funds, { income })

  // Keyed on both, because the categories table lets the same name exist under
  // two cashflow types and a goal called Tabungan is not the savings pot.
  const idByKey = new Map(pots.map((category) => [`${category.cashflow}|${category.name}`, category.id]))

  return (
    <FundsPanel
      review={review}
      idOf={(fund) => idByKey.get(`${fund.cashflow}|${fund.name}`)}
      income={income}
      asOf={asOf}
      caption="Setoran dihitung dari transaksi bercashflow Invest/Savings, Sinking Fund dan Financial Goals. Pengambilan dihitung dari transaksi Dari Asset/Saving dengan nama pos yang sama. Yang kamu ketik sendiri hanya targetnya dan rencana setorannya."
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
      lead="Tabungan, sinking fund dan tujuan, beserta laju setorannya. Targetnya boleh ditentukan dari tenggat, atau dari setoran per bulan yang kamu sanggup."
    >
      <Suspense fallback={<FundsSkeleton />}>
        <Funds />
      </Suspense>
    </AppShell>
  )
}
