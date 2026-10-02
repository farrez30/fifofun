import { monthKeyOf, monthKeyToString } from './monthly'
import type { CashflowType, LedgerEntry } from './types'

/**
 * Three months on one screen, for showing somebody else across a table.
 *
 * Every rule about what counts lives in `SUMMARY_CONFIG` below rather than in
 * the arithmetic, so the page can print the rules it used and a changed mind
 * is one edit in one place. Category names are never renamed here; a category
 * this config does not name falls into its parent's group, then into the
 * fallback, so a new category shows up somewhere instead of disappearing.
 */

type Entry = LedgerEntry & { categoryName?: string | null; isPassThrough?: boolean }

export interface SummaryGroup {
  label: string
  categories: readonly string[]
}

export interface SummaryConfig {
  income: {
    /** Named lines, in order; an included category none of them names lands in `otherLabel`. */
    lines: readonly SummaryGroup[]
    otherLabel: string
    /** Income that is not earned: shown in the footnote, never in the total. */
    excluded: readonly SummaryGroup[]
    /** Money from family that pays back spending already counted: taken off spending instead. */
    netted: SummaryGroup
  }
  spending: {
    groups: readonly SummaryGroup[]
    fallback: string
    excluded: readonly SummaryGroup[]
    /** A once-a-year payment spread evenly: category name → months it covers. */
    amortised: Readonly<Record<string, number>>
  }
  /** Whole cashflows that are neither earning nor spending, named for the footnote under one side. */
  excludedCashflows: Readonly<Partial<Record<CashflowType, { label: string; side: Side }>>>
  /** Money that only passed through the account, left out of both sides. */
  passThroughLabel: string
}

/** Which footnote an exclusion belongs under. */
export type Side = 'income' | 'spending'

export const SUMMARY_CONFIG: SummaryConfig = {
  income: {
    lines: [
      { label: 'Gaji', categories: ['Gaji'] },
      { label: 'Freelance / proyek', categories: ['Freelance', 'Business'] },
    ],
    otherLabel: 'Lain-lain',
    excluded: [
      { label: 'Kiriman keluarga', categories: ['Transfer Keluarga'] },
      { label: 'Penjualan barang sekali', categories: ['Jual Barang'] },
      { label: 'Pinjaman yang diterima', categories: ['Pinjaman'] },
      { label: 'Koreksi saldo', categories: ['Penyesuaian Income'] },
    ],
    netted: { label: 'Penggantian dari keluarga', categories: ['Penggantian Keluarga'] },
  },
  spending: {
    groups: [
      { label: 'Tempat tinggal', categories: ['Kos & Sewa', 'Kosan', 'Bayar Kontrakan'] },
      {
        label: 'Makan & harian',
        categories: ['Makan & Minum', 'Makan/minum', 'Jajan', 'Belanja Harian', 'Kopi & Snack', 'Warung'],
      },
      {
        label: 'Transport',
        categories: ['Transport', 'Bensin', 'Parkir & Tol', 'Ojek & Taksi Online', 'Kereta & Bus', 'Kendaraan (beli/DP)', 'Kendaraan'],
      },
      {
        label: 'Langganan & alat kerja',
        categories: [
          'Langganan Digital',
          'Langganan AI',
          'Google Workspace',
          'Langganan Gdrive',
          'Langganan Spotify',
          'Langganan Youtube',
          'Pulsa & Data',
          'Internet',
          'Internet & TV',
          'Wifi',
          'Edukasi',
          'Elektronik & Gadget',
        ],
      },
      {
        label: 'Gaya hidup',
        categories: [
          'Dating',
          'Belanja',
          'Belanja Online',
          'Pakaian',
          'Hadiah',
          'Hiburan',
          'Bioskop & Tontonan',
          'Game',
          'Jalan-jalan',
          'Olahraga & Gym',
          'Perawatan Diri',
          'Barbershop & Salon',
          'Skin & Body Care',
        ],
      },
      {
        label: 'Rutin lain',
        categories: [
          'Rumah',
          'Tagihan',
          'Listrik',
          'Air',
          'Laundry',
          'Servis Kendaraan',
          'Pajak & STNK',
          'Pajak Kendaraan',
          'Biaya Bank',
          'Tagihan Lain',
          'Kesehatan',
          'Klinik & Dokter',
          'Obat & Apotek',
          'Other spending',
          'Perabot & Perkakas',
        ],
      },
      { label: 'Keluarga', categories: ['Keluarga', 'Sosial', 'Sedekah'] },
    ],
    fallback: 'Rutin lain',
    excluded: [{ label: 'Koreksi saldo', categories: ['Penyesuaian Spending'] }],
    amortised: { 'Pajak & STNK': 12 },
  },
  excludedCashflows: {
    receivable_new: { label: 'Uang yang dipinjamkan', side: 'spending' },
    receivable_settled: { label: 'Piutang yang kembali', side: 'income' },
    debt_payment: { label: 'Bayar utang', side: 'spending' },
  },
  passThroughLabel: 'Titipan (uang orang lain yang lewat rekening)',
}

export interface SummaryLine {
  label: string
  /** One value per month, in sen. */
  values: bigint[]
  average: bigint
}

export interface SummaryReport {
  /** `YYYY-MM`, oldest first. */
  months: string[]
  income: SummaryLine[]
  incomeTotal: SummaryLine
  /** Largest average first. */
  spending: SummaryLine[]
  /** Family money paying back counted spending, already taken off `spendingTotal`. */
  netted: SummaryLine
  spendingTotal: SummaryLine
  remainder: SummaryLine
  /** What was left out, under the side whose footnote names it, largest first. */
  excluded: { label: string; side: Side; total: bigint }[]
  /** Category names spread over a year, for the footnote. */
  amortised: string[]
}

/** The `count` calendar months ending with `last`, oldest first. */
export function monthsEnding(last: string, count = 3): string[] {
  const [year, month] = last.split('-').map(Number)
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1 - (count - 1 - index), 1))
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
  })
}

/** The last month that has fully ended before `today`, as `YYYY-MM`, in Jakarta time. */
export function lastFullMonth(today: Date): string {
  const current = monthKeyToString(monthKeyOf(today))
  return monthsEnding(current, 2)[0]
}

function line(label: string, values: bigint[]): SummaryLine {
  const sum = values.reduce((total, value) => total + value, 0n)
  const count = BigInt(values.length)
  return { label, values, average: (sum + count / 2n) / count }
}

/** The group a category belongs to: its own name first, then its parent's, then the fallback. */
export function groupOf(
  name: string | null | undefined,
  parentOf: (name: string) => string | null,
  config: SummaryConfig = SUMMARY_CONFIG,
): string {
  const find = (candidate: string | null | undefined) =>
    candidate ? config.spending.groups.find((group) => group.categories.includes(candidate))?.label : undefined
  return find(name) ?? find(name ? parentOf(name) : null) ?? config.spending.fallback
}

export function summariseMonths(
  entries: readonly Entry[],
  months: readonly string[],
  parentOf: (name: string) => string | null = () => null,
  config: SummaryConfig = SUMMARY_CONFIG,
): SummaryReport {
  const index = new Map(months.map((month, position) => [month, position]))
  const blank = () => months.map(() => 0n)
  const incomeBy = new Map<string, bigint[]>()
  const spendingBy = new Map<string, bigint[]>(config.spending.groups.map((group) => [group.label, blank()]))
  const netted = blank()
  const excludedBy = new Map<string, { side: Side; total: bigint }>()
  const exclude = (label: string, side: Side, amount: bigint) =>
    excludedBy.set(label, { side, total: (excludedBy.get(label)?.total ?? 0n) + amount })
  const named = (groups: readonly SummaryGroup[], category: string) =>
    groups.find((group) => group.categories.includes(category))

  const amortisedNames = Object.keys(config.spending.amortised)
  const monthOf = (entry: Entry) => monthKeyToString(monthKeyOf(entry.occurredAt))

  for (const entry of entries) {
    const category = entry.categoryName ?? ''

    // A once-a-year payment lands in every month whose window covers it, a
    // twelfth at a time, so the month the tax was paid does not look ruined.
    if (amortisedNames.includes(category) && !entry.isPassThrough) {
      const span = config.spending.amortised[category]
      const paid = monthOf(entry)
      for (const month of months) {
        const window = monthsEnding(month, span)
        if (!window.includes(paid)) continue
        const target = spendingBy.get(groupOf(category, parentOf, config)) ?? blank()
        target[index.get(month)!] += entry.amount / BigInt(span)
        spendingBy.set(groupOf(category, parentOf, config), target)
      }
      continue
    }

    const position = index.get(monthOf(entry))
    if (position === undefined) continue
    if (entry.isPassThrough) {
      exclude(config.passThroughLabel, 'spending', entry.amount)
      continue
    }

    const byCashflow = config.excludedCashflows[entry.cashflow]
    if (byCashflow) {
      exclude(byCashflow.label, byCashflow.side, entry.amount)
      continue
    }

    if (entry.cashflow === 'income') {
      if (config.income.netted.categories.includes(category)) {
        netted[position] += entry.amount
        continue
      }
      const left = named(config.income.excluded, category)
      if (left) {
        exclude(left.label, 'income', entry.amount)
        continue
      }
      const label = named(config.income.lines, category)?.label ?? config.income.otherLabel
      const values = incomeBy.get(label) ?? blank()
      values[position] += entry.amount
      incomeBy.set(label, values)
      continue
    }

    if (entry.cashflow === 'spending' || entry.cashflow === 'bills') {
      const left = named(config.spending.excluded, category)
      if (left) {
        exclude(left.label, 'spending', entry.amount)
        continue
      }
      const group = groupOf(category, parentOf, config)
      const values = spendingBy.get(group) ?? blank()
      values[position] += entry.amount
      spendingBy.set(group, values)
    }
    // Transfers between own accounts and money put into savings pots are
    // neither: the pots are their own section.
  }

  const incomeLabels = [...config.income.lines.map((group) => group.label), config.income.otherLabel]
  const income = incomeLabels.map((label) => line(label, incomeBy.get(label) ?? blank()))
  const sum = (lines: SummaryLine[]) => months.map((_, position) => lines.reduce((total, row) => total + row.values[position], 0n))
  const incomeTotal = line('Total pemasukan', sum(income))

  const spending = [...spendingBy]
    .map(([label, values]) => line(label, values))
    .sort((a, b) => (b.average > a.average ? 1 : b.average < a.average ? -1 : 0))
  const nettedLine = line(config.income.netted.label, netted)
  const gross = sum(spending)
  const spendingTotal = line(
    'Total pengeluaran',
    gross.map((value, position) => value - netted[position]),
  )
  const remainder = line(
    'Sisa',
    months.map((_, position) => incomeTotal.values[position] - spendingTotal.values[position]),
  )

  return {
    months: [...months],
    income,
    incomeTotal,
    spending,
    netted: nettedLine,
    spendingTotal,
    remainder,
    excluded: [...excludedBy]
      .map(([label, { side, total }]) => ({ label, side, total }))
      .sort((a, b) => (b.total > a.total ? 1 : b.total < a.total ? -1 : 0)),
    amortised: amortisedNames,
  }
}
