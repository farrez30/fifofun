import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { AppShell } from '@/components/app-shell'
import { Planner } from '@/components/plan/planner'
import { rollUpByMonthAndCategory } from '@/lib/ledger/categories'
import { computeAccountMovements, computeMonthlySeries } from '@/lib/ledger/monthly'
import { buildSnapshot, typicalIncome } from '@/lib/ledger/snapshot'
import {
  getAccounts,
  getAllTransactions,
  getHousehold,
  getOpeningBalance,
} from '@/lib/queries/household'
import { getUser } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Rencana' }

function PlannerSkeleton() {
  return (
    <div className="space-y-8" role="status" aria-busy="true" aria-label="Menyiapkan simulasi">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-20 border border-line" />
        ))}
      </div>
      <div className="skeleton h-72 border border-line" />
      <div className="skeleton h-96 border border-line" />
    </div>
  )
}

function NoData({ reason }: { reason: string }) {
  return (
    <div className="border border-line bg-surface p-10 text-center">
      <h2 className="text-base font-medium text-ink">Simulasi butuh data dulu</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-ink-muted">{reason}</p>
      <a
        href="/impor"
        className="mt-4 inline-block rounded-sm border border-line px-3 py-2 text-sm text-ink transition-colors duration-150 hover:border-line-strong hover:bg-sunken"
      >
        Impor e-Statement
      </a>
    </div>
  )
}

async function PlannerData() {
  const household = await getHousehold()
  if (!household) {
    // An account with no household has nothing to show and, until /gabung
    // existed, nothing to do about it either. One of these used to tell whoever
    // read it to run the seed script, which is an instruction for the person
    // who built the app shown to the person who did not.
    redirect('/gabung')
  }

  const [accounts, transactions, openingBalance] = await Promise.all([
    getAccounts(household.id),
    getAllTransactions(household.id),
    getOpeningBalance(household.id),
  ])

  if (transactions.length === 0) {
    return (
      <NoData reason="Simulasi ini berangkat dari kebiasaan belanjamu yang sebenarnya, bukan dari formulir kosong. Impor satu e-Statement dan semuanya terisi sendiri." />
    )
  }

  const series = computeMonthlySeries(transactions, openingBalance)
  const movements = computeAccountMovements(transactions, accounts)
  const history = rollUpByMonthAndCategory(transactions)

  return (
    <Planner
      history={history}
      observedIncome={typicalIncome(series)}
      snapshot={buildSnapshot(series, movements)}
      currentYear={new Date().getUTCFullYear()}
    />
  )
}

export default async function RencanaPage() {
  const user = await getUser()
  if (!user) redirect('/login')

  return (
    <AppShell
      title="Rencana"
      email={user.email ?? ''}
      current="/rencana"
      lead="Setiap angka di sini membawa sumbernya. Yang datang dari OJK, BPS atau Kemenag ditandai sebagai itu; yang diturunkan di aplikasi ini ditandai sebagai itu juga."
    >
      <Suspense fallback={<PlannerSkeleton />}>
        <PlannerData />
      </Suspense>
    </AppShell>
  )
}
