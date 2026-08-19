import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { AppShell } from '@/components/app-shell'
import { CashflowChart } from '@/components/cashflow-chart'
import { Sankey, type SankeyLink, type SankeyNode } from '@/components/chart/sankey'
import { Money, SignedMoney, Stat } from '@/components/money'
import { formatJakarta } from '@/lib/datetime'
import { totalsByCategory } from '@/lib/ledger/categories'
import {
  computeAccountMovements,
  computeMonthlySeries,
  findOverdrawnAccounts,
  groupByMonth,
  type MonthlyStatement,
} from '@/lib/ledger/monthly'
import {
  getAccounts,
  getAllTransactions,
  getHousehold,
  getOpeningBalance,
  type TransactionRow,
} from '@/lib/queries/household'
import { getUser } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Ringkasan' }

function DashboardSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Memuat ringkasan">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-24 border border-line" />
        ))}
      </div>
      <div className="skeleton h-64 border border-line" />
      <div className="skeleton h-80 border border-line" />
    </div>
  )
}

function EmptyState() {
  return (
    <div className="border border-line bg-surface p-10 text-center">
      <h2 className="text-base font-medium text-ink">Belum ada transaksi</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-ink-muted">
        Unggah e-Statement Mandiri dalam format .xlsx untuk mengisi catatanmu. Setiap baris
        dicocokkan dengan saldo yang dicetak bank, jadi kalau ada yang tidak pas kamu akan tahu
        barisnya yang mana.
      </p>
      <Link
        href="/impor"
        className="mt-4 inline-block rounded-sm bg-accent px-4 py-2 text-sm font-medium text-paper transition-colors duration-150 hover:bg-accent-strong"
      >
        Impor e-Statement
      </Link>
    </div>
  )
}

/**
 * Turns one month into the Sankey's nodes and links.
 *
 * Three columns: what came in, where it was earmarked, and what the largest
 * single destination broke down into. Only the top few categories are drawn by
 * name; the rest are gathered into one node, because twenty ribbons a pixel wide
 * carry no information and make the ones that matter unreadable.
 */
function buildFlow(
  statement: MonthlyStatement,
  entries: TransactionRow[],
): { nodes: SankeyNode[]; links: SankeyLink[] } {
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

  const categories = totalsByCategory(entries, { cashflows: ['spending'] })
  const named = categories.slice(0, 6)
  const rest = categories.slice(6).reduce((sum, row) => sum + row.amount, 0n)

  for (const row of named) {
    if (row.amount <= 0n) continue
    nodes.push({ id: `cat-${row.category}`, label: row.category, column: 2, tone: 'spend' })
    links.push({ source: 'spending', target: `cat-${row.category}`, value: row.amount })
  }

  if (rest > 0n) {
    nodes.push({
      id: 'cat-rest',
      label: `${categories.length - named.length} kategori lain`,
      column: 2,
      tone: 'neutral',
    })
    links.push({ source: 'spending', target: 'cat-rest', value: rest })
  }

  return { nodes, links }
}

async function Dashboard() {
  const household = await getHousehold()
  if (!household) {
    return (
      <div className="border border-line bg-surface p-10 text-center">
        <h2 className="text-base font-medium text-ink">Akun belum terhubung ke rumah tangga</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-ink-muted">
          Jalankan seed dengan alamat email akun ini untuk menautkannya, atau buat rumah tangga
          baru.
        </p>
      </div>
    )
  }

  const [accounts, transactions, openingBalance] = await Promise.all([
    getAccounts(household.id),
    getAllTransactions(household.id),
    getOpeningBalance(household.id),
  ])

  if (transactions.length === 0) return <EmptyState />

  const series = computeMonthlySeries(transactions, openingBalance)
  const latest = series[series.length - 1]
  const movements = computeAccountMovements(transactions, accounts)
  const overdrawn = findOverdrawnAccounts(movements)
  const needsReview = transactions.filter((tx) => tx.needsReview).length

  const latestEntries = groupByMonth(transactions).get(latest.month) ?? []
  const flow = buildFlow(latest.statement, latestEntries as TransactionRow[])

  return (
    <div className="space-y-10">
      <section aria-labelledby="ringkasan-bulan">
        <h2 id="ringkasan-bulan" className="mb-3 text-sm font-medium text-ink">
          Bulan terakhir tercatat
          <span className="ml-2 font-normal text-ink-muted">{latest.month}</span>
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Pemasukan" sen={latest.statement.income} />
          <Stat label="Pengeluaran" sen={latest.statement.spending} />
          <Stat label="Tagihan" sen={latest.statement.bills} />
          <Stat
            label="Sisa uang"
            sen={latest.statement.sisaUang}
            emphasis
            hint="Turunan dari bulan sebelumnya, tidak diketik ulang"
          />
        </div>
      </section>

      {overdrawn.length > 0 || needsReview > 0 ? (
        <section
          aria-labelledby="perlu-perhatian"
          className="border border-warn/40 bg-warn-wash p-4"
        >
          <h2 id="perlu-perhatian" className="text-sm font-medium text-ink">
            <span aria-hidden="true" className="mr-1.5 text-warn">
              ▲
            </span>
            Perlu perhatian
          </h2>
          <ul className="mt-2 space-y-1 text-sm text-ink-muted">
            {overdrawn.map((account) => (
              <li key={account.accountId}>
                Saldo {account.name} minus <Money sen={account.closing} />, yang selalu berarti
                ada pencatatan yang salah.
              </li>
            ))}
            {needsReview > 0 ? (
              <li>{needsReview} transaksi belum dipastikan kategorinya oleh manusia.</li>
            ) : null}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="aliran">
        <h2 id="aliran" className="mb-3 text-sm font-medium text-ink">
          Ke mana uangnya pergi
          <span className="ml-2 font-normal text-ink-muted">{latest.month}</span>
        </h2>
        <Sankey
          nodes={flow.nodes}
          links={flow.links}
          caption={`Aliran uang ${latest.month}`}
        />
      </section>

      <section aria-labelledby="tren">
        <h2 id="tren" className="mb-3 text-sm font-medium text-ink">
          Tren {series.length} bulan
        </h2>
        <CashflowChart series={series} />
      </section>

      <section aria-labelledby="transaksi">
        <h2 id="transaksi" className="mb-3 text-sm font-medium text-ink">
          Transaksi terakhir
        </h2>
        <div className="overflow-x-auto border border-line bg-surface">
          <table className="w-full text-sm">
            <caption className="sr-only">Dua puluh transaksi terakhir</caption>
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Waktu
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Keterangan
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Kategori
                </th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">
                  Nominal
                </th>
              </tr>
            </thead>
            <tbody>
              {transactions
                .slice(-20)
                .reverse()
                .map((tx) => {
                  const direction =
                    tx.cashflow === 'income' || tx.cashflow === 'from_asset'
                      ? 'in'
                      : tx.cashflow === 'transfer'
                        ? 'neutral'
                        : 'out'
                  return (
                    <tr key={tx.id} className="border-b border-line last:border-0">
                      <td className="whitespace-nowrap px-4 py-2.5 tnum text-ink-muted">
                        {formatJakarta(tx.occurredAt, 'date')}
                      </td>
                      <td className="px-4 py-2.5 text-ink">
                        {tx.description}
                        {tx.needsReview ? (
                          <span className="ml-2 rounded-xs border border-warn/40 bg-warn-wash px-1.5 py-0.5 text-[0.625rem] text-ink-muted">
                            perlu ditinjau
                          </span>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-ink-muted">
                        {tx.categoryName ?? 'Belum berkategori'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right">
                        <SignedMoney sen={tx.amount} direction={direction} />
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

export default async function HomePage() {
  const user = await getUser()
  if (!user) redirect('/login')

  return (
    <AppShell title="Ringkasan" email={user.email ?? ''} current="/">
      <Suspense fallback={<DashboardSkeleton />}>
        <Dashboard />
      </Suspense>
    </AppShell>
  )
}
