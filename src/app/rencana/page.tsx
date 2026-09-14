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
  getPlan,
} from '@/lib/queries/household'
import { getUser } from '@/lib/supabase/server'
import { PlannerSkeleton } from './skeleton'
import { Target } from '@phosphor-icons/react/dist/ssr/Target'
import { BUTTON_QUIET } from '@/components/field-base'
import { Unavailable } from '@/components/unavailable'

export const metadata: Metadata = { title: 'Rencana' }
/* Blocks on runtime data by design; the why lives in src/app/page.tsx above `instant`. */
export const instant = false


function NoData({ reason }: { reason: string }) {
  return (
    <Unavailable
      glyph={Target}
      heading
      title="Simulasi butuh data dulu"
      action={
        <a href="/impor" className={BUTTON_QUIET}>
          Impor e-Statement
        </a>
      }
    >
      {reason}
    </Unavailable>
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

  const [accounts, transactions, openingBalance, saved] = await Promise.all([
    getAccounts(household.id),
    getAllTransactions(household.id),
    getOpeningBalance(household.id),
    getPlan(household.id),
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
      // A household that has saved a plan starts from it; one that has not
      // starts from its own ledger. The key rebuilds the form on the first
      // save, which is the one moment the two answers differ.
      key={saved ? 'tersimpan' : 'baru'}
      history={history}
      observedIncome={typicalIncome(series)}
      snapshot={buildSnapshot(series, movements)}
      currentYear={new Date().getUTCFullYear()}
      saved={saved}
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
      lead="Setiap angka di sini membawa sumbernya. Yang datang dari OJK, BPS atau Kemenag ditandai sebagai itu; yang diturunkan di aplikasi ini ditandai sebagai itu juga. Jawabanmu sendiri bisa disimpan, dan akan terisi lagi saat halaman ini dibuka."
    >
      <Suspense fallback={<PlannerSkeleton />}>
        <PlannerData />
      </Suspense>
    </AppShell>
  )
}
