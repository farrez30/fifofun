import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { AppShell } from '@/components/app-shell'
import { PeriodReport } from '@/components/period-report'
import { summarisePeriod, type PeriodFilter } from '@/lib/ledger/period'
import { CASHFLOW_TYPES, type CashflowType } from '@/lib/ledger/types'
import { getAccounts, getAllTransactions, getCategories, getHousehold } from '@/lib/queries/household'
import { getUser } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Laporan' }

/**
 * The spreadsheet's Period Summary, with the month restriction lifted.
 *
 * Every filter lives in the query string rather than in component state. That
 * costs a round trip per change and buys three things a client-side filter does
 * not have: the back button undoes a filter, a particular view can be sent to
 * somebody, and the page works before any JavaScript arrives.
 */

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? ''
}

/** A date input gives `YYYY-MM-DD` or nothing; anything else is ignored. */
function asDate(value: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? undefined : date
}

const MAX_SEARCH = 100

export function buildFilter(params: Record<string, string | string[] | undefined>): PeriodFilter {
  const cashflow = first(params.cashflow)
  const category = first(params.kategori)
  const account = first(params.akun)

  return {
    from: asDate(first(params.dari)),
    to: asDate(first(params.sampai)),
    // Validated against the enum rather than passed through, so the query string
    // cannot introduce a cashflow the ledger has never heard of.
    cashflows: CASHFLOW_TYPES.includes(cashflow as CashflowType)
      ? [cashflow as CashflowType]
      : undefined,
    categories: category ? [category] : undefined,
    accounts: account ? [account] : undefined,
    search: first(params.cari).slice(0, MAX_SEARCH) || undefined,
    includePassThrough: first(params.titipan) === 'ya',
  }
}

function ReportSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Memuat laporan">
      <div className="skeleton h-32 border border-line" />
      <div className="skeleton h-24 border border-line" />
      <div className="skeleton h-64 border border-line" />
    </div>
  )
}

async function Report({ params }: { params: Record<string, string | string[] | undefined> }) {
  const household = await getHousehold()
  if (!household) {
    return (
      <p className="border border-line bg-surface p-6 text-sm text-ink-muted">
        Akun ini belum terhubung ke rumah tangga mana pun.
      </p>
    )
  }

  const [transactions, categories, accounts] = await Promise.all([
    getAllTransactions(household.id),
    getCategories(household.id),
    getAccounts(household.id),
  ])

  const accountNameById = new Map(accounts.map((account) => [account.id, account.name]))
  const enriched = transactions.map((tx) => ({
    ...tx,
    fromAccountName: tx.fromAccountId ? (accountNameById.get(tx.fromAccountId) ?? null) : null,
    toAccountName: tx.toAccountId ? (accountNameById.get(tx.toAccountId) ?? null) : null,
  }))

  const filter = buildFilter(params)

  return (
    <PeriodReport
      summary={summarisePeriod(enriched, filter)}
      filter={filter}
      raw={params}
      categories={categories.map((category) => category.name)}
      accounts={accounts.map((account) => account.name)}
      ledgerSize={transactions.length}
    />
  )
}

export default async function LaporanPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await getUser()
  if (!user) redirect('/login')

  const params = await searchParams

  return (
    <AppShell
      title="Laporan"
      email={user.email ?? ''}
      current="/laporan"
      lead="Potong catatanmu menurut tanggal, cashflow, kategori, atau akun. Setiap pilihan tersimpan di alamat halaman, jadi bisa ditandai dan dikirim."
    >
      <Suspense key={JSON.stringify(params)} fallback={<ReportSkeleton />}>
        <Report params={params} />
      </Suspense>
    </AppShell>
  )
}
