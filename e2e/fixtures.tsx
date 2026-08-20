import { mkdir, writeFile } from 'node:fs/promises'
import { BillsPanel } from '@/components/bills-panel'
import { ReceivablesPanel } from '@/components/receivables-panel'
import { Stat } from '@/components/money'
import { reviewBills } from '@/lib/ledger/bills'
import { reviewReceivables } from '@/lib/ledger/receivables'
import type { CashflowType, LedgerEntry } from '@/lib/ledger/types'
import { CashflowChart } from '@/components/cashflow-chart'
import { BudgetBullet } from '@/components/chart/budget-bullet'
import { CrunchTimeline } from '@/components/chart/crunch-timeline'
import { Sankey } from '@/components/chart/sankey'
import { BalanceTrend } from '@/components/chart/balance-trend'
import { CategorySparks } from '@/components/chart/category-sparks'
import { Waterfall } from '@/components/chart/waterfall'
import { reviewBudget } from '@/lib/ledger/budget'
import { buildCategoryTrends } from '@/lib/ledger/category-trend'
import type { MonthlySeries, MonthlyStatement } from '@/lib/ledger/monthly'
import { parseIdAmount as idr } from '@/lib/money'
import { projectFamily } from '@/lib/planning/children'
import { documentFor, FIXTURE_DIR } from './render'

/**
 * Every chart, rendered to a page of its own before the browser tests run.
 *
 * The rendering happens here rather than inside a spec because the Playwright
 * runner compiles JSX with the factory belonging to its component-testing mode,
 * which produces objects React declines to render. Rendering in a plain `tsx`
 * script sidesteps that entirely and costs one line in the test command.
 *
 * The numbers are real ones taken from the ledger. A chart that behaves for
 * tidy round figures and badly for a household whose months differ by a factor
 * of forty should fail here, not on the dashboard.
 */

function statement(income: bigint, spending: bigint): MonthlyStatement {
  return {
    saldoAwal: 0n,
    income,
    fromAsset: 0n,
    investSavings: 0n,
    bills: 0n,
    sinkingFund: 0n,
    financialGoals: 0n,
    debtPayment: 0n,
    spending,
    piutang: 0n,
    sisaUang: income - spending,
  }
}

// The first month is the one that matters: Rp224rb of spending against Rp6,1jt
// of income is the flattest bar in the series, and the first to disappear if
// the scale is wrong.
const SERIES: MonthlySeries[] = [
  { month: '2024-09', statement: statement(idr('6.100.000,00'), idr('224.000,00')) },
  { month: '2024-10', statement: statement(idr('8.100.000,00'), idr('11.700.000,00')) },
  { month: '2024-11', statement: statement(idr('11.400.000,00'), idr('8.600.000,00')) },
  { month: '2026-07', statement: statement(idr('9.300.000,00'), idr('8.002.215,00')) },
]

const DERIVED_REVIEW = reviewBudget(
  '2026-07',
  {
    'Other spending': idr('2.149.081,00'),
    Belanja: idr('1.855.653,00'),
    'Biaya Bank': idr('36.500,00'),
  },
  {
    'Other spending': idr('4.138.307,00'),
    Belanja: idr('2.225.031,00'),
    'Biaya Bank': idr('45.700,00'),
  },
  'derived',
)

/** A budget somebody actually set, with Rp1,2 juta of the month still unassigned. */
const MANUAL_REVIEW = reviewBudget(
  '2026-07',
  { Belanja: idr('4.000.000,00'), Jajan: idr('500.000,00'), Wifi: idr('300.000,00') },
  { Belanja: idr('4.225.031,00'), Jajan: idr('120.000,00'), Wifi: idr('271.950,00') },
  'manual',
)

/** The same household having budgeted more than it earns. */
const OVERCOMMITTED = reviewBudget(
  '2026-07',
  { Belanja: idr('4.000.000,00'), Kosan: idr('2.500.000,00'), Kendaraan: idr('1.000.000,00') },
  { Belanja: idr('4.225.031,00') },
  'manual',
)

const FAMILY = projectFamily(
  [
    { label: 'Anak pertama', birthYear: 2028, track: 'swasta' },
    { label: 'Anak kedua', birthYear: 2031, track: 'swasta' },
  ],
  2026,
)

/** March 2026, where three bills were paid and eight were not. */
let seq = 0
function ledgerRow(
  date: string,
  category: string,
  amount: bigint,
  cashflow: CashflowType,
  extra: Record<string, unknown> = {},
): LedgerEntry & { categoryName: string; accountName?: string | null } {
  seq += 1
  return {
    id: `f${seq}`,
    occurredAt: new Date(`${date}T05:00:00.000Z`),
    description: category,
    amount,
    cashflow,
    categoryId: null,
    fromAccountId: null,
    toAccountId: null,
    source: 'xlsx',
    externalRef: null,
    note: null,
    categoryName: category,
    ...extra,
  }
}

const BILLS = reviewBills(
  [
    ledgerRow('2026-02-05', 'Wifi', idr('271.950,00'), 'bills'),
    ledgerRow('2026-03-05', 'Wifi', idr('271.950,00'), 'bills', { accountName: 'Bank Mandiri' }),
    ledgerRow('2026-03-06', 'Langganan Youtube', idr('25.925,00'), 'bills', {
      accountName: 'Bank Mandiri',
    }),
    ledgerRow('2026-02-08', 'Langganan Spotify', idr('104.900,00'), 'bills'),
    ledgerRow('2025-09-01', 'Langganan DanceFitMe', idr('49.000,00'), 'bills'),
  ],
  '2026-03',
  { known: ['Bayar Kontrakan', 'Aeropolis Gym & Pool'] },
)

const RECEIVABLES = reviewReceivables(
  [
    ledgerRow('2026-03-01', 'Patungan Spotify - Alma', idr('17.500,00'), 'receivable_new'),
    ledgerRow('2026-03-01', 'Patungan Spotify - Alma', idr('17.500,00'), 'receivable_settled'),
    ledgerRow('2026-03-01', 'Patungan Spotify - Hafidz', idr('17.500,00'), 'receivable_new'),
    ledgerRow('2026-01-04', 'Sambal Bakar Om Ben - Wafi', idr('120.000,00'), 'receivable_new'),
    ledgerRow('2026-02-01', 'Sambal Bakar Om Ben - Wafi', idr('40.000,00'), 'receivable_settled'),
  ],
  { asOf: new Date('2026-03-31T05:00:00.000Z') },
)

/**
 * The state this household is actually in: every bill set up, none of them yet
 * recognised in the ledger. It reported itself as "semua tagihan sudah dibayar,
 * Rp0" until the headline learned to tell nothing-due from nothing-recorded.
 */
const BILLS_UNTOUCHED = reviewBills([], '2026-07', {
  known: ['Wifi', 'Langganan Spotify', 'Bayar Kontrakan'],
})

/** February 2026 exactly as the spreadsheet has it, receivable coming back and all. */
const FEBRUARY: MonthlyStatement = {
  saldoAwal: idr('3.398.413,00'),
  income: idr('8.171.629,00'),
  fromAsset: 0n,
  investSavings: 0n,
  bills: idr('2.690.151,00'),
  sinkingFund: 0n,
  financialGoals: 0n,
  debtPayment: 0n,
  spending: idr('3.830.737,00'),
  piutang: -idr('102.000,00'),
  sisaUang: idr('5.151.154,00'),
}

/**
 * Closing balances either side of a year boundary, ending on the three the
 * spreadsheet actually recorded for January to March 2026. February is the peak
 * and March is the low, which is the pair the chart has to call out.
 */
const BALANCES: MonthlySeries[] = (
  [
    ['2025-11', '4.010.000,00'],
    ['2025-12', '4.317.549,00'],
    ['2026-01', '3.398.413,00'],
    ['2026-02', '5.151.154,00'],
    ['2026-03', '2.450.825,00'],
  ] as const
).map(([month, closing]) => ({
  month,
  statement: { ...statement(0n, 0n), sisaUang: idr(closing) },
}))

/**
 * Twenty three months, the length of the household's real import.
 *
 * A dot every ten pixels is where markers start colliding with each other and
 * hiding the line they sit on, which is the case a five month fixture never
 * reaches. Walked deterministically rather than at random so a failure here is
 * the same failure tomorrow.
 */
const LONG_RUN: MonthlySeries[] = Array.from({ length: 23 }, (_, index) => {
  const year = 2024 + Math.floor((8 + index) / 12)
  const month = ((8 + index) % 12) + 1
  const climb = BigInt(index) * idr('900.000,00')
  const wobble = index % 3 === 0 ? idr('1.400.000,00') : 0n
  return {
    month: `${year}-${String(month).padStart(2, '0')}`,
    statement: { ...statement(0n, 0n), sisaUang: idr('4.000.000,00') + climb - wobble },
  }
})

/**
 * The failure that started this project: Jajan runs about Rp80 ribu a month and
 * one month reached Rp4,8 juta with nothing anywhere saying so. Bank charges sit
 * beside it as the control, moving by Rp9.200 and deserving no alarm at all.
 */
const CATEGORY_TRENDS = buildCategoryTrends([
  {
    month: '2026-01',
    byCategory: {
      Jajan: idr('80.500,00'),
      Belanja: idr('1.855.653,00'),
      'Biaya Bank': idr('36.500,00'),
    },
  },
  {
    month: '2026-02',
    byCategory: {
      Jajan: idr('92.000,00'),
      Belanja: idr('1.700.000,00'),
      'Biaya Bank': idr('36.500,00'),
    },
  },
  {
    month: '2026-03',
    byCategory: {
      Jajan: idr('4.801.400,00'),
      Belanja: idr('1.900.000,00'),
      'Biaya Bank': idr('45.700,00'),
      Kendaraan: idr('350.000,00'),
    },
  },
])

/** A month that ends overdrawn, so the axis has to hold both sides of zero. */
const OVERDRAWN: MonthlyStatement = {
  ...FEBRUARY,
  saldoAwal: idr('200.000,00'),
  income: idr('100.000,00'),
  bills: 0n,
  spending: idr('900.000,00'),
  piutang: 0n,
  sisaUang: -idr('600.000,00'),
}

export const FIXTURES = {
  bills: <BillsPanel review={BILLS} />,
  'bills-untouched': <BillsPanel review={BILLS_UNTOUCHED} />,
  receivables: <ReceivablesPanel review={RECEIVABLES} />,
  cashflow: <CashflowChart series={SERIES} />,
  'budget-derived': <BudgetBullet review={DERIVED_REVIEW} caption="Per kategori" />,
  'budget-manual': (
    <BudgetBullet review={MANUAL_REVIEW} caption="Per kategori" income={idr('6.000.000,00')} />
  ),
  'budget-overcommitted': (
    <BudgetBullet review={OVERCOMMITTED} caption="Per kategori" income={idr('6.000.000,00')} />
  ),
  stats: (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Stat
        label="Pemasukan"
        sen={idr('8.171.629,00')}
        previous={idr('6.587.500,00')}
        previousLabel="2026-01"
      />
      <Stat
        label="Pengeluaran"
        sen={idr('3.830.737,00')}
        previous={idr('4.324.411,00')}
        previousLabel="2026-01"
      />
      {/* Unchanged from one month to the next, which is a third thing to say
          and not a rise of nothing. */}
      <Stat label="Tagihan" sen={idr('2.690.151,00')} previous={idr('2.690.151,00')} />
      {/* No earlier month at all, on the first month a household records. */}
      <Stat label="Sisa uang" sen={idr('5.151.154,00')} emphasis />
    </div>
  ),
  waterfall: <Waterfall statement={FEBRUARY} caption="Sisa uang Februari" />,
  'balance-trend': <BalanceTrend series={BALANCES} caption="Saldo di akhir tiap bulan" />,
  'balance-trend-long': <BalanceTrend series={LONG_RUN} caption="Saldo dua tahun" />,
  'category-sparks': (
    <CategorySparks review={CATEGORY_TRENDS} caption="Tiap kategori sepanjang bulan terakhir" />
  ),
  'waterfall-overdrawn': <Waterfall statement={OVERDRAWN} caption="Bulan yang berakhir minus" />,
  crunch: <CrunchTimeline projection={FAMILY} caption="Biaya anak" />,
  // The same chart with its markers, so axe sees the sliders and the geometry
  // check sees whether they landed on their columns.
  'crunch-interactive': (
    <CrunchTimeline
      projection={FAMILY}
      caption="Biaya anak"
      onBirthYearChange={() => undefined}
    />
  ),
  sankey: (
    <Sankey
      caption="Ke mana uangnya"
      nodes={[
        { id: 'in', label: 'Masuk', column: 0, tone: 'income' },
        { id: 'spend', label: 'Pengeluaran', column: 1, tone: 'spend' },
        { id: 'fee', label: 'Biaya Bank', column: 1, tone: 'warn' },
        { id: 'left', label: 'Sisa', column: 1, tone: 'neutral' },
      ]}
      links={[
        { source: 'in', target: 'spend', value: idr('8.002.215,00') },
        { source: 'in', target: 'fee', value: idr('45.700,00') },
        { source: 'in', target: 'left', value: idr('1.900.000,00') },
      ]}
    />
  ),
}

async function write() {
  await mkdir(FIXTURE_DIR, { recursive: true })
  for (const [name, element] of Object.entries(FIXTURES)) {
    await writeFile(`${FIXTURE_DIR}/${name}.html`, await documentFor(element), 'utf8')
  }
  console.log(`${Object.keys(FIXTURES).length} fixture pages written to ${FIXTURE_DIR}`)
}

void write()
