import type { Metadata } from 'next'
import { randomUUID } from 'node:crypto'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { AppShell } from '@/components/app-shell'
import { TransactionTable } from '@/components/transaction-table'
import { Balances } from '@/components/balances'
import { CashflowChart } from '@/components/cashflow-chart'
import { BudgetBullet } from '@/components/chart/budget-bullet'
import { FoldedCategories, Sankey } from '@/components/chart/sankey'
import { BalanceTrend } from '@/components/chart/balance-trend'
import { CategorySparks } from '@/components/chart/category-sparks'
import { Waterfall } from '@/components/chart/waterfall'
import { BillsPanel } from '@/components/bills-panel'
import { Money, Stat } from '@/components/money'
import { ReceivablesPanel } from '@/components/receivables-panel'
import { formatJakarta, formatMonthKey } from '@/lib/datetime'
import { reviewBills } from '@/lib/ledger/bills'
import { reviewReceivables } from '@/lib/ledger/receivables'
import { proposeBudget, reviewBudget } from '@/lib/ledger/budget'
import { AccountScope } from '@/components/account-scope'
import { asMonthlySeries, computeAccountSeries } from '@/lib/ledger/account-series'
import { buildCategoryTrends } from '@/lib/ledger/category-trend'
import { categoryHue, categoryIcon } from '@/lib/ledger/palette'
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

async function Dashboard({ akun }: { akun: string }) {
  const household = await getHousehold()
  if (!household) {
    // An account with no household has nothing to show and, until /gabung
    // existed, nothing to do about it either. One of these used to tell whoever
    // read it to run the seed script, which is an instruction for the person
    // who built the app shown to the person who did not.
    redirect('/gabung')
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

  /*
    The trend, scoped to one account when asked.

    The account list is the allow-list: an id nobody owns simply means every
    account, because a household should not be able to ask about somebody
    else's wallet by editing the address bar, and a page that errors on a stale
    link is worse than one that shows the default.
  */
  const scoped = accounts.find((account) => account.id === akun) ?? null
  const scopedPoints = scoped ? computeAccountSeries(transactions, scoped) : []
  const shownSeries = scoped ? asMonthlySeries(scopedPoints) : series
  const scopedEntries = scoped
    ? transactions.filter(
        (row) => row.fromAccountId === scoped.id || row.toAccountId === scoped.id,
      )
    : transactions

  // Every category the month touched gets its own ribbon, named and coloured.
  // Six named categories and a node called "9 kategori lain" answered the
  // question with a number rather than with the names it stood for.
  const flow = buildFlow(latest.statement, latestEntries, {
    drill: 'all',
    namedLimit: null,
    hueOf: (name) => look(name).hue,
  })

  // One place decides what a category looks like, so the flow diagram, the
  // month breakdown and the review queue cannot disagree about Belanja.
  const categoryByName = new Map(categories.map((category) => [category.name, category]))
  const look = (name: string) => {
    const row = categoryByName.get(name)
    return {
      hue: categoryHue(row ?? { name, hue: null }),
      icon: row ? categoryIcon(row) : null,
    }
  }

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
          {scoped ? (
            <Stat
              label={`Saldo ${scoped.name}`}
              sen={scopedPoints[scopedPoints.length - 1]?.closing ?? 0n}
              emphasis
              previous={scopedPoints[scopedPoints.length - 2]?.closing}
              previousLabel={scopedPoints[scopedPoints.length - 2]?.month}
              hint={`Saldo akhir ${latest.month} menurut catatan, termasuk perpindahan antar akun.`}
            />
          ) : (
            <Stat
              /*
                Not "Sisa uang". The figure is every account added together,
                and the wallets in it are top-ups the statement saw with
                payments it never did, so the total reads as money on hand when
                some of it is money already spent. The label says what it is,
                and the split below says how much of it can be vouched for.
              */
              label="Uang bisa dipakai"
              sen={latest.statement.sisaUang}
              emphasis
              previous={previous?.statement.sisaUang}
              previousLabel={previous?.month}
              hint="Semua akun, turunan dari bulan sebelumnya. Berapa yang dipastikan bank ada di bagian Uangnya ada di mana."
            />
          )}
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
          accounts={accounts.map((account) => ({ id: account.id, kind: account.kind }))}
          today={formatJakarta(new Date(), 'iso-date')}
          entryKeys={Object.fromEntries(accounts.map((account) => [account.id, randomUUID()]))}
        />
      </section>

      <section aria-labelledby="anggaran">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="anggaran" className="text-sm font-medium text-ink">
            Anggaran dan realisasi
            <span className="ml-2 font-normal text-ink-muted">{latest.month}</span>
          </h2>
          {/* The panel judges spending against a budget. Until this link
              existed, the only way to set one was a database client. */}
          <a
            href={`/anggaran?bulan=${latest.month}`}
            className="text-sm text-accent underline underline-offset-2"
          >
            Atur anggaran {formatMonthKey(latest.month)}
          </a>
        </div>
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
        <p className="mt-2 text-xs text-ink-muted">
          Setiap kategori yang terpakai bulan ini punya pitanya sendiri, dengan warna yang sama
          seperti di rincian bulan dan di antrean tinjau.
        </p>
      </section>

      <section aria-labelledby="tren">
        <h2 id="tren" className="mb-3 text-sm font-medium text-ink">
          Tren {shownSeries.length} bulan
          <span className="ml-2 font-normal text-ink-muted">{scoped?.name ?? 'Semua akun'}</span>
        </h2>
        <AccountScope
          accounts={accounts.map((account) => ({
            id: account.id,
            name: account.name,
            kind: account.kind,
          }))}
          current={scoped?.id ?? null}
        />
        <div className="space-y-4">
          <CashflowChart
            series={shownSeries}
            entries={scoped ? scopedEntries : transactions}
            look={look}
            scope={scoped ? { id: scoped.id, name: scoped.name } : undefined}
            caption={scoped ? `Masuk dan keluar ${scoped.name}` : 'Pemasukan dan pengeluaran'}
          />
          {/* The flows above, the level here. A month can look reasonable on its
              own while being the fourth in a row that ended lower. */}
          <BalanceTrend
            series={shownSeries}
            caption={
              scoped ? `Saldo ${scoped.name} di akhir tiap bulan` : 'Saldo di akhir tiap bulan'
            }
          />
          {scoped && stalled.some((account) => account.accountId === scoped.id) ? (
            <p className="text-xs text-ink-muted">
              Akun ini hampir tidak pernah mengeluarkan uang di catatan, jadi garisnya kemungkinan
              besar lebih tinggi daripada saldo sebenarnya.
            </p>
          ) : null}
        </div>
      </section>

      <section aria-labelledby="transaksi">
        <h2 id="transaksi" className="mb-3 text-sm font-medium text-ink">
          Transaksi terakhir
        </h2>
        <TransactionTable
          rows={[...transactions].slice(-20).reverse()}
          accounts={accounts}
          categories={categories}
          caption="Dua puluh transaksi terakhir"
          emptyText="Belum ada transaksi tercatat."
        />
        <p className="mt-2 text-xs text-ink-muted">
          Klik keterangannya untuk mengubahnya. Semua transaksi ada di Laporan.
        </p>
      </section>
    </div>
  )
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await getUser()
  if (!user) redirect('/login')

  const params = await searchParams
  const raw = Array.isArray(params.akun) ? params.akun[0] : params.akun
  const akun = raw?.trim() ?? ''

  return (
    <AppShell title="Ringkasan" email={user.email ?? ''} current="/">
      {/* Keyed on the scope, so switching account re-suspends rather than
          showing one account's chart under another one's heading. */}
      <Suspense key={akun} fallback={<DashboardSkeleton />}>
        <Dashboard akun={akun} />
      </Suspense>
    </AppShell>
  )
}
