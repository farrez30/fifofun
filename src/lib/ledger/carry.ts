import { ID_MONTH_LABELS, JAKARTA_OFFSET_MINUTES, formatMonthKey } from '@/lib/datetime'
import type { MonthCategoryTotals } from './categories'

/**
 * What happens to a category's leftover when its period closes.
 *
 * A budget is a ceiling per period, and a period that ends under it leaves a
 * question the stored figures do not answer: does the rest roll into the next
 * period, go into savings, or simply lapse? Nothing here is stored. The three
 * answers are worked out from the same budgets and the same spending, so they
 * can be compared side by side before anyone decides to live by one.
 *
 * Pure and client-safe: the chart re-runs it on every toggle, in bigint, from
 * the string figures the server sent.
 */

export type CarryPolicy = 'bawa' | 'tabung' | 'biarkan'

export const CARRY_POLICIES: CarryPolicy[] = ['bawa', 'tabung', 'biarkan']

export type CarryStatus = 'aman' | 'pakai-bawaan' | 'lewat' | 'tanpa-anggaran'

export interface CarryPeriodInput {
  key: string
  /** The budget the household set for this period; null when it set none. */
  base: bigint | null
  used: bigint
  /** Still running (or not started): it is judged, but not closed. */
  open: boolean
}

export interface CarryPeriod extends CarryPeriodInput {
  /** Brought in from the period before; negative when that one overran. */
  carryIn: bigint
  /** Base plus carry; null when the period has no budget. */
  effective: bigint | null
  /** Effective minus used; negative is an overrun. */
  left: bigint | null
  status: CarryStatus
  /** Savings after this period closed, for the `tabung` policy. */
  savedAfter: bigint
}

export interface CarryRun {
  policy: CarryPolicy
  periods: CarryPeriod[]
  saved: bigint
  /** Periods whose spending went past their effective budget. */
  over: number
  /** Periods that had a budget at all, the denominator for `over`. */
  budgeted: number
}

/**
 * Runs one policy across the periods, oldest first.
 *
 * The chain starts fresh at the first budgeted period: carry from before the
 * window is unknown here, and inventing it would be worse than starting at
 * zero. A period with no budget breaks the chain (nothing to carry from or
 * into) but keeps the savings. An open period is judged and never closed, so
 * the periods after it start from zero carry.
 */
export function runCarry(periods: CarryPeriodInput[], policy: CarryPolicy): CarryRun {
  let carry = 0n
  let saved = 0n
  let over = 0
  let budgeted = 0

  const out = periods.map<CarryPeriod>((period) => {
    if (period.base === null) {
      carry = 0n
      return {
        ...period,
        carryIn: 0n,
        effective: null,
        left: null,
        status: 'tanpa-anggaran',
        savedAfter: saved,
      }
    }

    const carryIn = carry
    const effective = period.base + carryIn
    const left = effective - period.used
    const status: CarryStatus =
      period.used > effective ? 'lewat' : period.used > period.base ? 'pakai-bawaan' : 'aman'
    budgeted++
    if (status === 'lewat') over++

    if (period.open) {
      carry = 0n
    } else if (policy === 'bawa') {
      carry = left
    } else if (policy === 'biarkan') {
      carry = 0n
    } else if (left >= 0n) {
      saved += left
      carry = 0n
    } else {
      // An overrun is paid from savings as far as they go; the rest still rolls.
      const covered = -left < saved ? -left : saved
      saved -= covered
      carry = left + covered
    }

    return { ...period, carryIn, effective, left, status, savedAfter: saved }
  })

  return { policy, periods: out, saved, over, budgeted }
}

/* ---------------------------------------------------------------- weeks */

const DAY_MS = 86_400_000

/** The Monday of the Jakarta week an instant falls in, as `YYYY-MM-DD`. */
export function weekStartOf(instant: Date): string {
  const shifted = new Date(instant.getTime() + JAKARTA_OFFSET_MINUTES * 60_000)
  const sinceMonday = (shifted.getUTCDay() + 6) % 7
  const monday = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate())
  return new Date(monday - sinceMonday * DAY_MS).toISOString().slice(0, 10)
}

export function addWeeks(weekStart: string, delta: number): string {
  return new Date(Date.parse(`${weekStart}T00:00:00Z`) + delta * 7 * DAY_MS)
    .toISOString()
    .slice(0, 10)
}

export function isMonday(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false
  const time = Date.parse(`${iso}T00:00:00Z`)
  if (Number.isNaN(time)) return false
  // Date.parse rolls 2026-02-30 over to March; a real date round-trips.
  return new Date(time).toISOString().slice(0, 10) === iso && new Date(time).getUTCDay() === 1
}

function dayAndMonth(iso: string): { day: number; month: string; year: number } {
  const date = new Date(`${iso}T00:00:00Z`)
  return {
    day: date.getUTCDate(),
    month: ID_MONTH_LABELS[date.getUTCMonth()],
    year: date.getUTCFullYear(),
  }
}

/** "16 sampai 22 Nov 2026", or "30 Nov sampai 6 Des 2026" across a month. */
export function formatWeek(weekStart: string): string {
  const from = dayAndMonth(weekStart)
  const sunday = dayAndMonth(
    new Date(Date.parse(`${weekStart}T00:00:00Z`) + 6 * DAY_MS).toISOString().slice(0, 10),
  )
  const head =
    from.year !== sunday.year
      ? `${from.day} ${from.month} ${from.year}`
      : from.month === sunday.month
        ? `${from.day}`
        : `${from.day} ${from.month}`
  return `${head} sampai ${sunday.day} ${sunday.month} ${sunday.year}`
}

export interface WeeklyBudgetRow {
  categoryId: string
  weekStart: string
  amount: bigint
  ongoing: boolean
}

/**
 * The budget a week carries for one category: its own exception if it has
 * one, otherwise the latest standing figure at or before it. A standing zero
 * means the weekly budget was stopped; an exception of zero means "nothing
 * this week", which is a budget.
 */
export function weeklyBudgetFor(rows: WeeklyBudgetRow[], weekStart: string): bigint | null {
  let standing: WeeklyBudgetRow | null = null
  for (const row of rows) {
    if (!row.ongoing) {
      if (row.weekStart === weekStart) return row.amount
      continue
    }
    if (row.weekStart <= weekStart && (!standing || row.weekStart > standing.weekStart)) {
      standing = row
    }
  }
  if (!standing || standing.amount === 0n) return null
  return standing.amount
}

/* ------------------------------------------------------- series builder */

/** One period as it crosses to the client: strings, because bigint cannot. */
export interface CarryPeriodWire {
  key: string
  /** Under the column: "Nov", or the Monday's day of the month. */
  tick: string
  /** In the readout: "Nov 2026", or "16 sampai 22 Nov 2026". */
  label: string
  base: string | null
  used: string
  open: boolean
}

export interface CarrySeries {
  categoryId: string
  monthly: CarryPeriodWire[]
  weekly: CarryPeriodWire[]
  /** The weekly rows as stored, for the form to say what it would replace. */
  weeklyRows: { weekStart: string; amount: string; ongoing: boolean }[]
}

export interface CarrySeriesInput {
  categoryIds: string[]
  /** `YYYY-MM`, oldest first. */
  months: string[]
  /** Mondays, oldest first. */
  weeks: string[]
  /** Month and week keys at or after these are still open. */
  thisMonth: string
  thisWeek: string
  /** Spending rolled up by month, keyed by category id. */
  monthlyUsed: MonthCategoryTotals[]
  /** Spending rolled up by Monday, keyed by category id. */
  weeklyUsed: MonthCategoryTotals[]
  monthlyBudgets: { period: string; categoryId: string; amount: bigint }[]
  weeklyBudgets: WeeklyBudgetRow[]
}

export function buildCarrySeries(input: CarrySeriesInput): CarrySeries[] {
  const usedIn = (rollup: MonthCategoryTotals[]) =>
    new Map(rollup.map((bucket) => [bucket.month, bucket.byCategory]))
  const byMonth = usedIn(input.monthlyUsed)
  const byWeek = usedIn(input.weeklyUsed)

  const monthBudget = new Map<string, bigint>()
  for (const row of input.monthlyBudgets) {
    monthBudget.set(`${row.period}|${row.categoryId}`, row.amount)
  }

  return input.categoryIds.map((categoryId) => {
    const rows = input.weeklyBudgets.filter((row) => row.categoryId === categoryId)

    const monthly = input.months.map<CarryPeriodWire>((month) => {
      const base = monthBudget.get(`${month}|${categoryId}`)
      return {
        key: month,
        tick: formatMonthKey(month).slice(0, 3),
        label: formatMonthKey(month),
        base: base === undefined ? null : base.toString(),
        used: (byMonth.get(month)?.[categoryId] ?? 0n).toString(),
        open: month >= input.thisMonth,
      }
    })

    const weekly = input.weeks.map<CarryPeriodWire>((week) => {
      const base = weeklyBudgetFor(rows, week)
      return {
        key: week,
        tick: String(Number(week.slice(8))),
        label: formatWeek(week),
        base: base === null ? null : base.toString(),
        used: (byWeek.get(week)?.[categoryId] ?? 0n).toString(),
        open: week >= input.thisWeek,
      }
    })

    return {
      categoryId,
      monthly,
      weekly,
      weeklyRows: rows
        .slice()
        .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
        .map((row) => ({
          weekStart: row.weekStart,
          amount: row.amount.toString(),
          ongoing: row.ongoing,
        })),
    }
  })
}

/** Back to bigint, on the client. */
export function fromWire(periods: CarryPeriodWire[]): CarryPeriodInput[] {
  return periods.map((period) => ({
    key: period.key,
    base: period.base === null ? null : BigInt(period.base),
    used: BigInt(period.used),
    open: period.open,
  }))
}

/**
 * Which category the chart opens on: the one whose months most often went
 * past their budget, then the bigger spender, then by name order given. The
 * point of the chart is the category that needs it.
 */
export function pickDefaultCategory(series: CarrySeries[]): string | null {
  let best: { id: string; over: number; used: bigint } | null = null
  for (const one of series) {
    const run = runCarry(fromWire(one.monthly), 'biarkan')
    if (run.budgeted === 0) continue
    const used = run.periods.reduce((sum, period) => sum + period.used, 0n)
    if (
      !best ||
      run.over > best.over ||
      (run.over === best.over && used > best.used)
    ) {
      best = { id: one.categoryId, over: run.over, used }
    }
  }
  return best?.id ?? series[0]?.categoryId ?? null
}
