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
import { FoldedCategories, Sankey } from '@/components/chart/sankey'
import { BalanceTrend } from '@/components/chart/balance-trend'
import { CategorySparks } from '@/components/chart/category-sparks'
import { Waterfall } from '@/components/chart/waterfall'
import { FundsPanel } from '@/app/dana/funds-panel'
import { reviewBudget } from '@/lib/ledger/budget'
import { buildCategoryTrends } from '@/lib/ledger/category-trend'
import { buildFlow } from '@/lib/ledger/flow'
import { reviewFunds } from '@/lib/ledger/funds'
import type { MonthlySeries, MonthlyStatement } from '@/lib/ledger/monthly'
import { parseIdAmount as idr } from '@/lib/money'
import { AdherenceBullet } from '@/components/chart/adherence-bullet'
import { assessAdherence } from '@/lib/planning/adherence'
import type { FinancialSnapshot } from '@/lib/planning/ratios'
import { GoalGlidepath } from '@/components/chart/goal-glidepath'
import { projectFamily } from '@/lib/planning/children'
import { monthlyContribution, suggestInstrument } from '@/lib/planning/goals'
import { AllocationPanel } from '@/components/plan/allocation-panel'
import { ChildrenPanel } from '@/components/plan/children-panel'
import { GapPanel } from '@/components/plan/gap-panel'
import { GoalsPanel } from '@/components/plan/goals-panel'
import { RatioPanel } from '@/components/plan/ratio-panel'
import type { HouseholdProfile } from '@/lib/planning/allocation'
import type { ChildPlan } from '@/lib/planning/children'
import { templateProfile } from '@/lib/planning/lifestyle'
import { AccountMark, CashflowChip, CategoryMark, DirectionMark } from '@/components/marks'
import { QueueControls } from '@/app/tinjau/queue-controls'
import { ReviewQueue } from '@/app/tinjau/review-queue'
import { EntryForm } from '@/app/catat/entry-form'
import { AdjustBalanceForm, type BalanceRow } from '@/app/catat/adjust-balance'
import { DuplicatesPanel } from '@/app/catat/duplicates-panel'
import type { DuplicateView } from '@/app/catat/duplicates-view'
import { Balances } from '@/components/balances'
import { AccountScope } from '@/components/account-scope'
import type { AccountMovement } from '@/lib/ledger/monthly'
import { categoryHue } from '@/lib/ledger/palette'
import { formatIdr } from '@/lib/money'
import { groupBySuggestion } from '@/lib/ledger/rules'
import type { UnconfirmedRow } from '@/lib/queries/household'
import { ACCOUNT_KINDS, CASHFLOW_TYPES } from '@/lib/ledger/types'
import { ACCOUNT_KIND_LABELS, DIRECTION_LABELS, type Direction } from '@/lib/ledger/direction'
import { SEED_PALETTE } from '@/lib/ledger/palette'
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

/**
 * Three pots in the three states that matter: a goal whose deadline the current
 * rate will miss, a goal with a target and no deadline, and a pot with neither.
 */
const FUNDS = reviewFunds(
  [
    ledgerRow('2026-01-15', 'Dana Menikah', idr('2.000.000,00'), 'financial_goal'),
    ledgerRow('2026-02-15', 'Dana Menikah', idr('2.000.000,00'), 'financial_goal'),
    ledgerRow('2026-03-15', 'Dana Menikah', idr('2.000.000,00'), 'financial_goal'),
    ledgerRow('2026-01-15', 'Dana Rumah', idr('1.000.000,00'), 'financial_goal'),
    ledgerRow('2026-03-15', 'Dana Rumah', idr('3.000.000,00'), 'financial_goal'),
    ledgerRow('2026-02-15', 'Tabungan', idr('500.000,00'), 'invest_savings'),
    // Money taken back out again, which no panel in the app used to subtract.
    ledgerRow('2026-03-15', 'Tabungan', idr('200.000,00'), 'from_asset'),
  ],
  [
    {
      name: 'Dana Menikah',
      cashflow: 'financial_goal',
      openingBalance: 0n,
      target: idr('50.000.000,00'),
      targetMonth: '2027-03',
    },
    {
      name: 'Dana Rumah',
      cashflow: 'financial_goal',
      openingBalance: idr('10.000.000,00'),
      target: idr('200.000.000,00'),
      targetMonth: null,
    },
    {
      name: 'Tabungan',
      cashflow: 'invest_savings',
      openingBalance: 0n,
      target: null,
      targetMonth: null,
    },
  ],
  { asOf: '2026-03' },
)

const FUNDS_UNTOUCHED = reviewFunds(
  [],
  [
    {
      name: 'Dana Darurat',
      cashflow: 'invest_savings',
      openingBalance: 0n,
      target: null,
      targetMonth: null,
    },
    {
      name: 'Reksadana',
      cashflow: 'invest_savings',
      openingBalance: 0n,
      target: null,
      targetMonth: null,
    },
  ],
  { asOf: '2026-07' },
)


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

/*
  March 2026 as it really was: Rp6,17jt earned against Rp8,29jt of spending and
  nothing set aside. The month the whole quality problem was found in, and the
  one every bound in every framework fails at once.
*/
const TIGHT_MONTH: FinancialSnapshot = {
  monthlyIncome: idr('6.172.514,00'),
  monthlyDebtService: 0n,
  monthlySavings: 0n,
  monthlyExpenses: idr('8.287.460,00'),
  liquidAssets: idr('3.980.551,31'),
  totalAssets: idr('3.980.551,31'),
  totalDebt: 0n,
}

const ROOMY: FinancialSnapshot = {
  monthlyIncome: idr('20.000.000,00'),
  monthlyDebtService: idr('2.000.000,00'),
  monthlySavings: idr('5.000.000,00'),
  monthlyExpenses: idr('11.000.000,00'),
  liquidAssets: idr('100.000.000,00'),
  totalAssets: idr('100.000.000,00'),
  totalDebt: idr('50.000.000,00'),
}

/*
  A real month put through the real pipeline, so the fixture cannot drift into a
  diagram the dashboard would never draw. Eight spending categories, two more
  than get drawn by name, so the folded tail and its way out both exist.
*/
const SPEND_NAMES = [
  'Makan/minum',
  'Transport',
  'Belanja',
  'Jajan',
  'Hiburan',
  'Kesehatan',
  'Bensin',
  'Dating',
]

const FLOW = buildFlow(
  {
    saldoAwal: idr('3.398.413,00'),
    income: idr('8.171.629,00'),
    fromAsset: 0n,
    investSavings: idr('500.000,00'),
    bills: idr('2.690.151,00'),
    sinkingFund: 0n,
    financialGoals: 0n,
    debtPayment: 0n,
    spending: idr('3.600.000,00'),
    piutang: 0n,
    sisaUang: idr('4.779.891,00'),
  },
  SPEND_NAMES.map((name, index) => ({
    id: `flow-${index}`,
    occurredAt: new Date('2026-02-10T05:00:00.000Z'),
    description: name,
    amount: idr(`${800 - index * 100}.000,00`),
    cashflow: 'spending' as CashflowType,
    categoryId: null,
    categoryName: name,
    fromAccountId: 'acc',
    toAccountId: null,
    source: 'manual' as const,
  })),
)

/*
  The planner's own panels, which had never been rendered here at all.

  Everything under src/components/chart was covered and everything under
  src/components/plan was not, so a whole page of the app had never been through
  axe. The first thing checking it found was a ten pixel label sitting at 3.9:1
  against its own selected row, in dark mode only.

  The callbacks are inert. A static render never calls them, and giving them
  behaviour would be testing React rather than the markup.
*/
const inert = () => undefined

const PROFILE: HouseholdProfile = { adults: 2, children: 1, debtServiceRatio: 0.18 }

const CHILD_PLANS: ChildPlan[] = [
  { label: 'Anak pertama', birthYear: 2027, track: 'negeri' },
  // Four years apart: past BKKBN's minimum and clear of every entry fee that
  // would otherwise land in the same year as another.
  { label: 'Anak kedua', birthYear: 2031, track: 'negeri' },
]

const LIFESTYLE = templateProfile('seimbang')

/*
  Every mark at once, which is the only way to see whether eleven cashflow
  chips are still legible against their own washes in both colour schemes. The
  contrast failures this corpus has caught were all small text on a wash.
*/
const MARKED_CATEGORIES: { name: string; cashflow: CashflowType }[] = [
  { name: 'Makan/minum', cashflow: 'spending' },
  { name: 'Belanja', cashflow: 'spending' },
  { name: 'Wifi', cashflow: 'bills' },
  { name: 'Gaji', cashflow: 'income' },
  { name: 'Dana Menikah', cashflow: 'financial_goal' },
]

const MARKS = (
  <div className="space-y-6">
    <section aria-labelledby="marks-arah">
      <h2 id="marks-arah" className="mb-2 text-sm font-medium text-ink">
        Arah
      </h2>
      <ul className="flex flex-wrap gap-4 text-sm text-ink">
        {(['in', 'out', 'neither'] as Direction[]).map((direction) => (
          <li key={direction} className="flex items-center gap-1.5">
            <DirectionMark direction={direction} />
            {DIRECTION_LABELS[direction]}
          </li>
        ))}
      </ul>
    </section>

    <section aria-labelledby="marks-cashflow">
      <h2 id="marks-cashflow" className="mb-2 text-sm font-medium text-ink">
        Cashflow
      </h2>
      <ul className="flex flex-wrap gap-2">
        {CASHFLOW_TYPES.map((cashflow) => (
          <li key={cashflow}>
            <CashflowChip cashflow={cashflow} />
          </li>
        ))}
      </ul>
    </section>

    <section aria-labelledby="marks-kategori">
      <h2 id="marks-kategori" className="mb-2 text-sm font-medium text-ink">
        Kategori
      </h2>
      <ul className="flex flex-wrap gap-4 text-sm">
        {MARKED_CATEGORIES.map((category) => (
          <li key={category.name}>
            <CategoryMark
              name={category.name}
              cashflow={category.cashflow}
              icon={SEED_PALETTE[category.name].icon}
              hue={SEED_PALETTE[category.name].hue}
            />
          </li>
        ))}
        {/* A category the seed never heard of: hashed hue, cashflow icon. */}
        <li>
          <CategoryMark name="Kopi Sore" cashflow="spending" icon={null} hue={null} />
        </li>
      </ul>
    </section>

    <section aria-labelledby="marks-akun">
      <h2 id="marks-akun" className="mb-2 text-sm font-medium text-ink">
        Akun
      </h2>
      <ul className="flex flex-wrap gap-4 text-sm">
        {ACCOUNT_KINDS.map((kind) => (
          <li key={kind}>
            <AccountMark name={ACCOUNT_KIND_LABELS[kind]} kind={kind} />
          </li>
        ))}
      </ul>
    </section>
  </div>
)

/*
  A queue with the two shapes that used to be invisible: one counterparty that
  both takes money and gives it back, which has to be two decisions, and rows
  from two different accounts, which is half of remembering what a payment was.
*/
const idrText = (amount: string) => formatIdr(idr(amount))

const BALANCE_MOVEMENTS: AccountMovement[] = [
  {
    accountId: 'acc-mandiri',
    name: 'Bank Mandiri',
    opening: 0n,
    credit: idr('22.000.000,00'),
    debit: idr('17.818.332,00'),
    closing: idr('4.181.668,00'),
  },
  {
    accountId: 'acc-cash',
    name: 'Cash',
    opening: 0n,
    credit: idr('1.500.000,00'),
    debit: idr('1.320.000,00'),
    closing: idr('180.000,00'),
  },
  {
    accountId: 'acc-gopay',
    name: 'GoPay',
    opening: 0n,
    credit: idr('9.036.795,00'),
    debit: 0n,
    closing: idr('9.036.795,00'),
  },
  {
    accountId: 'acc-emoney',
    name: 'e-Money',
    opening: 0n,
    credit: idr('400.000,00'),
    debit: idr('355.000,00'),
    closing: idr('45.000,00'),
  },
]

const QUEUE_ACCOUNTS = [
  { id: 'acc-mandiri', name: 'Bank Mandiri', kind: 'bank' as const },
  { id: 'acc-gopay', name: 'GoPay', kind: 'ewallet' as const },
]

const QUEUE_CATEGORIES = [
  { id: 'cat-keluarga', name: 'Keluarga', cashflow: 'spending' as CashflowType },
  { id: 'cat-makan', name: 'Makan/minum', cashflow: 'spending' as CashflowType },
  { id: 'cat-wifi', name: 'Wifi', cashflow: 'bills' as CashflowType },
  { id: 'cat-gaji', name: 'Gaji', cashflow: 'income' as CashflowType },
  { id: 'cat-penyesuaian', name: 'Penyesuaian Income', cashflow: 'income' as CashflowType },
]

let queueSeq = 0
function queueRow(
  description: string,
  amount: bigint,
  cashflow: CashflowType,
  when: string,
  accountId: string,
): UnconfirmedRow {
  queueSeq += 1
  const incoming = cashflow === 'income'
  return {
    id: `q${queueSeq}`,
    description,
    rawDescription: `Transfer ke BANK MANDIRI\n${description.toUpperCase()}\ncatatan`,
    amount,
    cashflow,
    categoryName: null,
    occurredAt: new Date(when),
    fromAccountId: incoming ? null : accountId,
    toAccountId: incoming ? accountId : null,
    source: 'xlsx',
  }
}

const QUEUE_ROWS: UnconfirmedRow[] = [
  queueRow('ANIS RENGGANIS - arisan mei', idr('3.000.000,00'), 'spending', '2026-05-02T05:00:00.000Z', 'acc-mandiri'),
  queueRow('ANIS RENGGANIS - arisan juni', idr('3.000.000,00'), 'spending', '2026-06-02T05:00:00.000Z', 'acc-mandiri'),
  // The same counterparty paying back: a second group, and a second decision.
  queueRow('ANIS RENGGANIS - kembalian', idr('1.500.000,00'), 'income', '2026-07-04T05:00:00.000Z', 'acc-mandiri'),
  queueRow('KOPI KENANGAN', idr('42.000,00'), 'spending', '2026-07-11T03:00:00.000Z', 'acc-gopay'),
  queueRow('KOPI KENANGAN', idr('38.000,00'), 'spending', '2026-07-19T04:00:00.000Z', 'acc-gopay'),
  queueRow('INDOMARET AEROPOLIS', idr('126.500,00'), 'spending', '2026-08-01T06:00:00.000Z', 'acc-mandiri'),
]

const QUEUE_REMAINING = {
  count: QUEUE_ROWS.length,
  total: QUEUE_ROWS.reduce((sum, entry) => sum + entry.amount, 0n),
}

/* Four accounts of four kinds, which is what the chips have to stay legible at. */
const CATAT_ACCOUNTS = [
  { id: 'acc-mandiri', name: 'Bank Mandiri', kind: 'bank' as const },
  { id: 'acc-cash', name: 'Cash', kind: 'cash' as const },
  { id: 'acc-gopay', name: 'GoPay', kind: 'ewallet' as const },
  { id: 'acc-emoney', name: 'e-Money', kind: 'emoney' as const },
]

const CATAT_CATEGORIES = [
  { id: 'cat-makan', name: 'Makan/minum', cashflow: 'spending' as CashflowType },
  { id: 'cat-jajan', name: 'Jajan', cashflow: 'spending' as CashflowType },
  { id: 'cat-bensin', name: 'Bensin', cashflow: 'spending' as CashflowType },
  { id: 'cat-wifi', name: 'Wifi', cashflow: 'bills' as CashflowType },
  { id: 'cat-tabungan', name: 'Tabungan', cashflow: 'invest_savings' as CashflowType },
  { id: 'cat-gaji', name: 'Gaji', cashflow: 'income' as CashflowType },
  { id: 'cat-antar', name: 'Antar Account', cashflow: 'transfer' as CashflowType },
]

const BALANCE_ROWS: BalanceRow[] = [
  {
    accountId: 'acc-mandiri',
    name: 'Bank Mandiri',
    kind: 'bank',
    stalled: false,
    credit: idrText('9.912.000,00'),
    debit: idrText('8.002.215,00'),
    closing: idrText('4.181.668,00'),
    closingSen: idr('4.181.668,00').toString(),
    reconciled: true,
    today: '2026-08-22',
    entryKey: '00000000-0000-4000-8000-000000000010',
  },
  {
    // The wallet the dashboard warns about: topped up, never spent from.
    accountId: 'acc-gopay',
    name: 'GoPay',
    kind: 'ewallet',
    stalled: true,
    credit: idrText('9.036.795,00'),
    debit: idrText('0,00'),
    closing: idrText('9.036.795,00'),
    closingSen: idr('9.036.795,00').toString(),
    reconciled: false,
    today: '2026-08-22',
    entryKey: '00000000-0000-4000-8000-000000000011',
  },
]

const DUPLICATE_PAIRS: DuplicateView[] = [
  {
    manualId: '00000000-0000-4000-8000-000000000021',
    importedId: '00000000-0000-4000-8000-000000000022',
    drift: '2 hari',
    manual: {
      when: '10 Agu 2026 12:30:00',
      description: 'Makan siang Warung Bu Tini',
      amount: idrText('45.000,00'),
      categoryName: 'Makan/minum',
      note: 'patungan berdua',
      confirmed: true,
    },
    imported: {
      when: '12 Agu 2026 09:14:00',
      description: 'QRIS WARUNG BU TINI',
      amount: idrText('45.000,00'),
      categoryName: 'Belum berkategori',
      note: null,
      confirmed: false,
    },
  },
  {
    manualId: '00000000-0000-4000-8000-000000000023',
    importedId: '00000000-0000-4000-8000-000000000024',
    drift: '5 jam',
    manual: {
      when: '15 Agu 2026 08:00:00',
      description: 'Bensin',
      amount: idrText('120.000,00'),
      categoryName: 'Bensin',
      note: null,
      confirmed: true,
    },
    imported: {
      when: '15 Agu 2026 13:02:00',
      description: 'KD20 MPM SPBU 34-152',
      amount: idrText('120.000,00'),
      categoryName: 'Bensin',
      note: null,
      confirmed: true,
    },
  },
]

/*
  A month with every category the household actually uses, which is the picture
  the dashboard now draws: twenty spending names, four bills, a savings pot and
  a sinking fund with one category, because a destination holding one category
  is exactly what the single-drill version used to skip.
*/
const FULL_SPEND = [
  ['Makan/minum', '1.593.177,00'],
  ['Belanja', '2.225.031,00'],
  ['Other spending', '4.138.307,00'],
  ['Transport', '420.000,00'],
  ['Jajan', '380.000,00'],
  ['Bensin', '350.000,00'],
  ['Kesehatan', '310.000,00'],
  ['Hiburan', '295.000,00'],
  ['Keluarga', '280.000,00'],
  ['Rumah', '265.000,00'],
  ['Sedekah', '250.000,00'],
  ['Dating', '230.000,00'],
  ['Kendaraan', '215.000,00'],
  ['Edukasi', '200.000,00'],
  ['Hadiah', '185.000,00'],
  ['Skin & Body Care', '170.000,00'],
  ['Kosan', '155.000,00'],
  ['Internet', '140.000,00'],
  ['Penyesuaian Spending', '95.000,00'],
  ['Biaya Bank', '45.700,00'],
] as const

const FULL_BILLS = [
  ['Wifi', '271.950,00'],
  ['Listrik', '385.000,00'],
  ['Langganan Spotify', '104.900,00'],
  ['Langganan Youtube', '25.925,00'],
] as const

let fullSeq = 0
const fullRow = (name: string, amount: string, cashflow: CashflowType) => {
  fullSeq += 1
  return {
    id: `full-${fullSeq}`,
    occurredAt: new Date('2026-07-10T05:00:00.000Z'),
    description: name,
    amount: idr(amount),
    cashflow,
    categoryId: null,
    categoryName: name,
    fromAccountId: 'acc-mandiri',
    toAccountId: null,
    source: 'xlsx' as const,
  }
}

const FULL_ROWS = [
  ...FULL_SPEND.map(([name, amount]) => fullRow(name, amount, 'spending')),
  ...FULL_BILLS.map(([name, amount]) => fullRow(name, amount, 'bills')),
  fullRow('Tabungan', '1.000.000,00', 'invest_savings'),
  fullRow('Pajak Kendaraan', '500.000,00', 'sinking_fund'),
]

const sumOf = (cashflow: CashflowType) =>
  FULL_ROWS.filter((row) => row.cashflow === cashflow).reduce((sum, row) => sum + row.amount, 0n)

const FULL_STATEMENT: MonthlyStatement = {
  saldoAwal: idr('3.398.413,00'),
  income: idr('14.500.000,00'),
  fromAsset: 0n,
  investSavings: sumOf('invest_savings'),
  bills: sumOf('bills'),
  sinkingFund: sumOf('sinking_fund'),
  financialGoals: 0n,
  debtPayment: 0n,
  spending: sumOf('spending'),
  piutang: 0n,
  sisaUang: 0n,
}
FULL_STATEMENT.sisaUang =
  FULL_STATEMENT.saldoAwal +
  FULL_STATEMENT.income -
  FULL_STATEMENT.investSavings -
  FULL_STATEMENT.bills -
  FULL_STATEMENT.sinkingFund -
  FULL_STATEMENT.spending

const FULL_FLOW = buildFlow(FULL_STATEMENT, FULL_ROWS, {
  drill: 'all',
  namedLimit: null,
  hueOf: (name) => categoryHue({ name, hue: null }),
})

/* The month behind the cashflow chart's last column, so its detail has rows. */
const DETAIL_ROWS = [
  fullRow('Gaji', '9.300.000,00', 'income'),
  ...FULL_SPEND.slice(0, 5).map(([name, amount]) => fullRow(name, amount, 'spending')),
  {
    ...fullRow('Antar Account', '500.000,00', 'transfer'),
    toAccountId: 'acc-gopay',
  },
]

const SPARKS_MANY = buildCategoryTrends(
  [
    {
      month: '2026-05',
      byCategory: Object.fromEntries(FULL_SPEND.map(([name, amount]) => [name, idr(amount)])),
    },
    {
      month: '2026-06',
      byCategory: Object.fromEntries(
        FULL_SPEND.map(([name, amount]) => [name, idr(amount) + idr('20.000,00')]),
      ),
    },
    {
      month: '2026-07',
      byCategory: Object.fromEntries(FULL_SPEND.map(([name, amount]) => [name, idr(amount)])),
    },
  ],
  { top: 4 },
)

export const FIXTURES = {
  marks: MARKS,
  'sankey-all': (
    <Sankey
      nodes={FULL_FLOW.nodes}
      links={FULL_FLOW.links}
      caption="Aliran uang 2026-07"
      id="alur-penuh"
      note={<FoldedCategories folded={FULL_FLOW.folded} into={FULL_FLOW.foldedInto} />}
    />
  ),
  'account-scope': (
    <AccountScope
      accounts={CATAT_ACCOUNTS}
      current="acc-gopay"
    />
  ),
  'category-sparks-many': (
    <CategorySparks review={SPARKS_MANY} caption="Tiap kategori sepanjang bulan-bulan terakhir" />
  ),
  'catat-entry': (
    <EntryForm
      accounts={CATAT_ACCOUNTS}
      categories={CATAT_CATEGORIES}
      defaults={{ date: '2026-08-22', time: '12:30' }}
      entryKey="00000000-0000-4000-8000-000000000000"
    />
  ),
  'catat-adjust': (
    <div className="space-y-6">
      {BALANCE_ROWS.map((row) => (
        <AdjustBalanceForm key={row.accountId} row={row} />
      ))}
    </div>
  ),
  'catat-duplicates': <DuplicatesPanel pairs={DUPLICATE_PAIRS} />,
  balances: (
    <Balances
      movements={BALANCE_MOVEMENTS}
      reconciliation={{
        accountId: 'acc-mandiri',
        ok: true,
        computed: idr('4.181.668,00'),
        printed: idr('4.181.668,00'),
        difference: 0n,
      }}
      stalled={[{ ...BALANCE_MOVEMENTS[2], stranded: idr('9.036.795,00') }]}
      statementDate={new Date('2026-07-31T17:00:00.000Z')}
      accounts={BALANCE_MOVEMENTS.map((movement, index) => ({
        id: movement.accountId,
        kind: (['bank', 'cash', 'ewallet', 'emoney'] as const)[index],
      }))}
      today="2026-08-22"
      entryKeys={Object.fromEntries(
        BALANCE_MOVEMENTS.map((movement, index) => [
          movement.accountId,
          `00000000-0000-4000-8000-00000000003${index}`,
        ]),
      )}
    />
  ),
  'review-queue': (
    <ReviewQueue
      groups={groupBySuggestion(QUEUE_ROWS)}
      categories={QUEUE_CATEGORIES}
      accounts={QUEUE_ACCOUNTS}
      remaining={QUEUE_REMAINING}
      options={{ urut: 'nominal', kelompok: 'lawan' }}
    />
  ),
  'review-queue-bulan': (
    <div className="space-y-5">
      <QueueControls options={{ urut: 'waktu', kelompok: 'bulan' }} />
      <ReviewQueue
        groups={groupBySuggestion(QUEUE_ROWS, [], { by: 'month', order: 'time' })}
        categories={QUEUE_CATEGORIES}
        accounts={QUEUE_ACCOUNTS}
        remaining={QUEUE_REMAINING}
        options={{ urut: 'waktu', kelompok: 'bulan' }}
      />
    </div>
  ),
  bills: <BillsPanel review={BILLS} />,
  'bills-untouched': <BillsPanel review={BILLS_UNTOUCHED} />,
  receivables: <ReceivablesPanel review={RECEIVABLES} />,
  cashflow: (
    <CashflowChart
      series={SERIES}
      entries={DETAIL_ROWS}
      look={(name) => ({ hue: categoryHue({ name, hue: null }), icon: null })}
    />
  ),
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
  funds: (
    <FundsPanel
      review={FUNDS}
      idOf={(fund) => `id-${fund.name}`}
      caption="Targetnya satu-satunya angka di halaman ini yang diketik sendiri."
    />
  ),
  // The state a household is actually in on arrival: every pot set up, not one
  // of them ever fed. Seven rows of Rp0 and no way out is a dead end.
  'funds-untouched': (
    <FundsPanel
      review={FUNDS_UNTOUCHED}
      idOf={(fund) => `id-${fund.name}`}
      caption="Targetnya satu-satunya angka di halaman ini yang diketik sendiri."
    />
  ),
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
  // Half a milliard over a decade, the panel's own default, with the marker.
  glidepath: (
    <GoalGlidepath
      {...goal(idr('500.000.000,00'), 10)}
      onYearsChange={() => undefined}
      caption="Jalan ke targetnya"
    />
  ),
  // Forty years, where the return does most of the work and money left alone
  // never gets there at all. The chart has to say so rather than draw nothing.
  'glidepath-patient': (
    <GoalGlidepath {...goal(idr('500.000.000,00'), 40)} caption="Jangka terpanjang" />
  ),
  // Two years, which is below the narrowest axis the chart will draw, and where
  // the two arrivals sit close enough to collide.
  'glidepath-soon': (
    <GoalGlidepath
      {...goal(idr('35.000.000,00'), 2)}
      onYearsChange={() => undefined}
      caption="Tujuan dekat"
    />
  ),
  // Already paid for, so there is no instalment and no second arrival.
  'glidepath-covered': (
    <GoalGlidepath
      {...goal(idr('35.000.000,00'), 5, idr('40.000.000,00'))}
      caption="Sudah tertutup"
    />
  ),
  // Every bound missed at once, on the household's own worst real month.
  adherence: (
    <AdherenceBullet
      adherence={assessAdherence(TIGHT_MONTH, '50-30-20')}
      observedIncome={TIGHT_MONTH.monthlyIncome}
      caption="Anjurannya dibandingkan dengan yang sebenarnya terjadi"
    />
  ),
  // Inside every bound, and with instalments readable on their own because OJK
  // is one of the frameworks that lets them be.
  'adherence-healthy': (
    <AdherenceBullet
      adherence={assessAdherence(ROOMY, 'ojk-10-20-30-40')}
      observedIncome={ROOMY.monthlyIncome}
      caption="Anjurannya dibandingkan dengan yang sebenarnya terjadi"
    />
  ),
  // Run against an income somebody typed rather than one the ledger saw, which
  // has to be said out loud or the verdict flatters a salary that does not exist.
  'adherence-hypothetical': (
    <AdherenceBullet
      adherence={assessAdherence({ ...TIGHT_MONTH, monthlyIncome: idr('30.000.000,00') }, '50-30-20')}
      observedIncome={TIGHT_MONTH.monthlyIncome}
      caption="Anjurannya dibandingkan dengan yang sebenarnya terjadi"
    />
  ),
  // The same diagram the dashboard draws, folded tail and all, so the way out
  // of that tail is exercised rather than only the picture.
  'sankey-real': (
    <Sankey
      nodes={FLOW.nodes}
      links={FLOW.links}
      caption="Aliran uang 2026-02"
      note={<FoldedCategories folded={FLOW.folded} into={FLOW.foldedInto} />}
    />
  ),
  // The framework picker, and the household measured against whatever it picks.
  'plan-allocation': (
    <AllocationPanel
      income={ROOMY.monthlyIncome}
      frameworkId="ojk-10-20-30-40"
      onFrameworkChange={inert}
      profile={PROFILE}
      snapshot={ROOMY}
      observedIncome={ROOMY.monthlyIncome}
    />
  ),
  // Five ratios against their OJK thresholds. Both months, because the failing
  // verdicts and the healthy ones are drawn in different colours.
  'plan-ratios': <RatioPanel snapshot={TIGHT_MONTH} />,
  'plan-ratios-healthy': <RatioPanel snapshot={ROOMY} />,
  // Two children, which is what draws the selected spacing row: the state that
  // carried the contrast failure and that nothing had ever rendered.
  'plan-children': (
    <ChildrenPanel
      plans={CHILD_PLANS}
      onPlansChange={inert}
      track="negeri"
      onTrackChange={inert}
      currentYear={2026}
    />
  ),
  'plan-gap': (
    <GapPanel
      currentProfile={LIFESTYLE}
      currentIncome={ROOMY.monthlyIncome}
      targetTier="nyaman"
      onTargetTierChange={inert}
      targetSavings={(ROOMY.monthlyIncome * 20n) / 100n}
      onTargetSavingsChange={inert}
      adults={2}
      childCount={1}
      currentYear={2026}
    />
  ),
  'plan-goals': (
    <GoalsPanel monthlyExpenses={LIFESTYLE.total} profile={PROFILE} currentYear={2026} />
  ),
}


/*
  Built the way the panel builds it, so a fixture cannot drift into showing a
  contribution the app would never produce for that target and horizon.
*/
function goal(target: bigint, years: number, saved = 0n) {
  const rate = suggestInstrument(years * 12).instrument.base
  return {
    target,
    years,
    startingBalance: saved,
    annualRate: rate,
    monthly: monthlyContribution(target, years * 12, rate, saved).monthly,
    currentYear: 2026,
  }
}

async function write() {
  await mkdir(FIXTURE_DIR, { recursive: true })
  for (const [name, element] of Object.entries(FIXTURES)) {
    await writeFile(`${FIXTURE_DIR}/${name}.html`, await documentFor(element), 'utf8')
  }
  console.log(`${Object.keys(FIXTURES).length} fixture pages written to ${FIXTURE_DIR}`)
}

void write()
