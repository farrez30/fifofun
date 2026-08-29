import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { AppShell } from '@/components/app-shell'
import { PeriodReport } from '@/components/period-report'
import { TablePager, TransactionTable } from '@/components/transaction-table'
import { matchesFilter, summarisePeriod, UNCATEGORISED, type PeriodFilter } from '@/lib/ledger/period'
import { CASHFLOW_TYPES, type CashflowType } from '@/lib/ledger/types'
import {
  countLedger,
  getAccounts,
  getCategories,
  getHousehold,
  getMatchingTransactions,
} from '@/lib/queries/household'
import { getUser } from '@/lib/supabase/server'
import { pageCount, pageHref, pageSlice, parsePage } from './paging'

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

/**
 * Midnight after the given day. `matchesFilter` keeps a row up to 23:59:59.999
 * of the `to` date; the query's `to` is exclusive, so the same range is asked
 * for as "strictly before the next midnight".
 */
function dayAfter(date: Date): Date {
  const copy = new Date(date)
  copy.setHours(24, 0, 0, 0)
  return copy
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
    <div className="space-y-4" role="status" aria-busy="true" aria-label="Memuat laporan">
      <div className="skeleton h-32 border border-line" />
      <div className="skeleton h-24 border border-line" />
      <div className="skeleton h-64 border border-line" />
    </div>
  )
}

async function Report({ params }: { params: Record<string, string | string[] | undefined> }) {
  const household = await getHousehold()
  if (!household) {
    // An account with no household has nothing to show and, until /gabung
    // existed, nothing to do about it either. One of these used to tell whoever
    // read it to run the seed script, which is an instruction for the person
    // who built the app shown to the person who did not.
    redirect('/gabung')
  }

  const [allCategories, accounts] = await Promise.all([
    // Archived categories and accounts too: a report over last year has to be
    // able to name the wallet those rows were paid from, and a filter link
    // saved before a category was retired should keep finding its rows.
    getCategories(household.id, { includeArchived: true }),
    getAccounts(household.id, { includeArchived: true }),
  ])
  // The pickers only offer what is current; the archived rows above exist so
  // a name arriving in the address bar can still be translated to its id.
  const categories = allCategories.filter((category) => category.archivedAt === null)

  const filter = buildFilter(params)

  /*
    The filter speaks in names (they come from the address bar); the query
    speaks in ids. A name that matches nothing the household owns translates
    to an empty list, which getMatchingTransactions answers without a query.
  */
  const categoryIds = filter.categories
    ? [
        ...allCategories
          .filter((category) => filter.categories?.includes(category.name))
          .map((category) => category.id),
        ...(filter.categories.includes(UNCATEGORISED) ? [null] : []),
      ]
    : undefined
  const accountIds = filter.accounts
    ? accounts
        .filter((account) => filter.accounts?.includes(account.name))
        .map((account) => account.id)
    : undefined

  const [transactions, ledgerSize] = await Promise.all([
    getMatchingTransactions(household.id, {
      from: filter.from,
      to: filter.to ? dayAfter(filter.to) : undefined,
      cashflows: filter.cashflows,
      categoryIds,
      accountIds,
      search: filter.search,
      includePassThrough: filter.includePassThrough === true ? undefined : false,
    }),
    countLedger(household.id),
  ])

  const accountNameById = new Map(accounts.map((account) => [account.id, account.name]))
  const enriched = transactions.map((tx) => ({
    ...tx,
    fromAccountName: tx.fromAccountId ? (accountNameById.get(tx.fromAccountId) ?? null) : null,
    toAccountName: tx.toAccountId ? (accountNameById.get(tx.toAccountId) ?? null) : null,
  }))

  /*
    The same predicate the totals above are computed from, so the list can
    never disagree with the figures it sits under: the database narrowed the
    set, this decides it. The rows arrive newest first, which is also the
    order the pages read in.
  */
  const matched = enriched.filter((entry) => matchesFilter(entry, filter))
  const page = parsePage(params.hal)
  const pages = pageCount(matched.length)

  const plain = Object.fromEntries(
    Object.entries(params).map(([key, value]) => [key, first(value)]),
  )

  /*
    Which group each category name belongs to.

    By name because a summary is built from ledger entries, and an entry carries
    the name its category had rather than a link to the row. An entry naming a
    category nobody keeps any more simply stands on its own, which is the same
    thing that happens to a category with no group.
  */
  const nameById = new Map(categories.map((category) => [category.id, category.name]))
  const groupNames = Object.fromEntries(
    categories
      .filter((category) => category.parentId !== null)
      .map((category) => [category.name, nameById.get(category.parentId as string)])
      .filter((pair): pair is [string, string] => pair[1] !== undefined),
  )

  return (
    <div className="space-y-8">
      <PeriodReport
        summary={summarisePeriod(enriched, filter, groupNames)}
        filter={filter}
        raw={params}
        categories={categories.map((category) => category.name)}
        accounts={accounts.map((account) => account.name)}
        ledgerSize={ledgerSize}
      />

      <section aria-labelledby="daftar">
        <h2 id="daftar" className="mb-3 text-sm font-medium text-ink">
          Daftar transaksi
        </h2>
        <TransactionTable
          rows={pageSlice(matched, page)}
          accounts={accounts}
          categories={categories}
          caption={`Transaksi terpilih, halaman ${page} dari ${pages}`}
          emptyText="Tidak ada transaksi yang cocok dengan saringan ini."
        />
        <TablePager page={page} pages={pages} hrefFor={(next) => pageHref(plain, next)} />
        <p className="mt-2 text-xs text-ink-muted">
          Klik keterangannya untuk mengubah kategori, catatan, atau memisahkannya jadi beberapa
          kategori.
        </p>
      </section>
    </div>
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
