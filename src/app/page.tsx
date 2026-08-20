import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { AppShell } from '@/components/app-shell'
import { Balances } from '@/components/balances'
import { CashflowChart } from '@/components/cashflow-chart'
import { BudgetBullet } from '@/components/chart/budget-bullet'
import { FoldedCategories, Sankey } from '@/components/chart/sankey'
import { BalanceTrend } from '@/components/chart/balance-trend'
import { CategorySparks } from '@/components/chart/category-sparks'
import { Waterfall } from '@/components/chart/waterfall'
import { BillsPanel } from '@/components/bills-panel'
import { Money, SignedMoney, Stat } from '@/components/money'
import { ReceivablesPanel } from '@/components/receivables-panel'
import { formatJakarta } from '@/lib/datetime'
import { reviewBills } from '@/lib/ledger/bills'
import { reviewReceivables } from '@/lib/ledger/receivables'
import { proposeBudget, reviewBudget } from '@/lib/ledger/budget'
import { buildCategoryTrends } from '@/lib/ledger/category-trend'
import { rollUpByMonthAndCategory } from '@/lib/ledger/categories'
import { buildFlow } from '@/lib/ledger/flow'
import {
  computeAccountMovements,
  computeMonthlySeries,
  findOverdrawnAccounts,
  findStalledAccounts,
  groupByMonth,
  reconcileBank,
} from '@/lib/ledger/monthly'
import {
  getAccounts,
  getAllTransactions,
  getBudgets,
  getCategories,
  getHousehold,
  getLatestClosingBalance,
  getOpeningBalance,
} from '@/lib/queries/household'
import { getUser } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Ringkasan' }

function DashboardSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-busy="true" aria-label="Memuat ringkasan">
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

  const [accounts, categories, transactions, openingBalance, printed] = await Promise.all([
    getAccounts(household.id),
    getCategories(household.id),
    getAllTransactions(household.id),
    getOpeningBalance(household.id),
    getLatestClosingBalance(household.id),
  ])

  if (transactions.length === 0) return <EmptyState />

  const series = computeMonthlySeries(transactions, openingBalance)
  const latest = series[series.length - 1]
  // The month before, for the comparison beside each headline figure. Undefined
  // on the first month recorded, where there is honestly nothing to compare to.
  const previous = series.length > 1 ? series[series.length - 2] : undefined
  const movements = computeAccountMovements(transactions, accounts)
  const overdrawn = findOverdrawnAccounts(movements)
  const stalled = findStalledAccounts(movements)
  const needsReview = transactions.filter((tx) => tx.needsReview).length

  const bankAccount = accounts.find((account) => account.kind === 'bank')
  const reconciliation =
    bankAccount && printed ? reconcileBank(movements, bankAccount.id, printed.closing) : null

  const latestEntries = groupByMonth(transactions).get(latest.month) ?? []
  const flow = buildFlow(latest.statement, latestEntries)

  // A budget the household set beats one derived from its own history, but an
  // empty panel on the first visit teaches nobody anything, so the median of the
  // recent months stands in until a real budget exists.
  const history = rollUpByMonthAndCategory(transactions)
  // Matched on the month rather than taken from the tail: a month with income
  // and no spending appears in the series and not in the rollup, and the two
  // would quietly drift apart by one.
  const currentIndex = history.findIndex((month) => month.month === latest.month)
  const setBudgets = await getBudgets(household.id, latest.month)
  const hasSetBudgets = Object.keys(setBudgets).length > 0
  const budgetReview = reviewBudget(
    latest.month,
    hasSetBudgets
      ? setBudgets
      : // Derived from the months before this one, never including it. A budget
        // that includes the month it is judging can never be exceeded.
        proposeBudget(currentIndex === -1 ? history : history.slice(0, currentIndex)),
    currentIndex === -1 ? {} : history[currentIndex].byCategory,
    hasSetBudgets ? 'manual' : 'derived',
  )

  // Which account a bill left from is part of the answer, and the ledger carries
  // the id rather than the name. Resolved here from the accounts already loaded
  // instead of joining it onto every transaction query in the app.
  const accountNameById = new Map(accounts.map((account) => [account.id, account.name]))
  const billsReview = reviewBills(
    transactions.map((tx) => ({
      ...tx,
      accountName: tx.fromAccountId ? (accountNameById.get(tx.fromAccountId) ?? null) : null,
    })),
    latest.month,
    // Every bill the household has set up, so one that has never been paid is
    // still visible rather than absent.
    { known: categories.filter((c) => c.cashflow === 'bills').map((c) => c.name) },
  )

  const receivables = reviewReceivables(transactions)
  const categoryTrends = buildCategoryTrends(history)

  return (
    <div className="space-y-10">
      <section aria-labelledby="ringkasan-bulan">
        <h2 id="ringkasan-bulan" className="mb-3 text-sm font-medium text-ink">
          Bulan terakhir tercatat
          <span className="ml-2 font-normal text-ink-muted">{latest.month}</span>
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Pemasukan"
            sen={latest.statement.income}
            previous={previous?.statement.income}
            previousLabel={previous?.month}
          />
          <Stat
            label="Pengeluaran"
            sen={latest.statement.spending}
            previous={previous?.statement.spending}
            previousLabel={previous?.month}
          />
          <Stat
            label="Tagihan"
            sen={latest.statement.bills}
            previous={previous?.statement.bills}
            previousLabel={previous?.month}
          />
          <Stat
            label="Sisa uang"
            sen={latest.statement.sisaUang}
            emphasis
            previous={previous?.statement.sisaUang}
            previousLabel={previous?.month}
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

          <div className="mt-3 space-y-3 text-sm">
            {overdrawn.length > 0 ? (
              <div>
                <p className="text-ink">
                  Saldo minus di {overdrawn.length} akun:{' '}
                  {overdrawn.map((account, index) => (
                    <span key={account.accountId}>
                      {index > 0 ? ', ' : ''}
                      {account.name} <Money sen={account.closing} />
                    </span>
                  ))}
                </p>
                <p className="mt-0.5 text-ink-muted">
                  Saldo negatif selalu berarti ada pencatatan yang salah.
                </p>
              </div>
            ) : null}

            {needsReview > 0 ? (
              <div>
                <p className="text-ink">
                  {needsReview} transaksi belum dipastikan kategorinya.
                </p>
                <p className="mt-0.5 text-ink-muted">
                  Kategorinya diterka dari keterangan bank, dan yang belum yakin ditandai.
                </p>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      <section aria-labelledby="perjalanan">
        <h2 id="perjalanan" className="mb-3 text-sm font-medium text-ink">
          Dari saldo awal ke sisa uang
          <span className="ml-2 font-normal text-ink-muted">{latest.month}</span>
        </h2>
        <Waterfall
          statement={latest.statement}
          caption={`Urutan yang membentuk sisa uang ${latest.month}`}
        />
      </section>

      <section aria-labelledby="saldo">
        <h2 id="saldo" className="mb-3 text-sm font-medium text-ink">
          Uangnya ada di mana
        </h2>
        <Balances
          movements={movements}
          reconciliation={reconciliation}
          stalled={stalled}
          statementDate={printed?.periodEnd ?? null}
        />
      </section>

      <section aria-labelledby="anggaran">
        <h2 id="anggaran" className="mb-3 text-sm font-medium text-ink">
          Anggaran dan realisasi
          <span className="ml-2 font-normal text-ink-muted">{latest.month}</span>
        </h2>
        <div className="space-y-4">
          <BudgetBullet
            review={budgetReview}
            caption={`Per kategori, ${latest.month}`}
            income={latest.statement.income}
          />
          {/* The panel above says a category is above its usual. This says
              whether that is an accident or the fourth month of a climb, which
              is what decides whether anything needs doing about it. */}
          <CategorySparks
            review={categoryTrends}
            caption="Tiap kategori sepanjang bulan-bulan terakhir"
          />
        </div>
      </section>

      <section aria-labelledby="tagihan">
        <h2 id="tagihan" className="mb-3 text-sm font-medium text-ink">
          Tagihan rutin
          <span className="ml-2 font-normal text-ink-muted">{latest.month}</span>
        </h2>
        <BillsPanel review={billsReview} />
      </section>

      {receivables.receivables.length > 0 ? (
        <section aria-labelledby="piutang">
          <h2 id="piutang" className="mb-3 text-sm font-medium text-ink">
            Piutang
          </h2>
          <ReceivablesPanel review={receivables} />
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
          note={<FoldedCategories folded={flow.folded} into={flow.foldedInto} />}
        />
      </section>

      <section aria-labelledby="tren">
        <h2 id="tren" className="mb-3 text-sm font-medium text-ink">
          Tren {series.length} bulan
        </h2>
        <div className="space-y-4">
          <CashflowChart series={series} />
          {/* The flows above, the level here. A month can look reasonable on its
              own while being the fourth in a row that ended lower. */}
          <BalanceTrend series={series} caption="Saldo di akhir tiap bulan" />
        </div>
      </section>

      <section aria-labelledby="transaksi">
        <h2 id="transaksi" className="mb-3 text-sm font-medium text-ink">
          Transaksi terakhir
        </h2>
        <div
          className="relative overflow-x-auto border border-line bg-surface"
          tabIndex={0}
          role="region"
          aria-label="Tabel transaksi terakhir, bisa digeser ke samping"
        >
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
