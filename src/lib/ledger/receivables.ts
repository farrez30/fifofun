import type { LedgerEntry } from './types'

/**
 * Money lent out, and whether it came back.
 *
 * The spreadsheet tracks this by writing the state into the name: a category
 * called "Patungan Spotify - Alma (3/26-NOT PAID)" that stays called NOT PAID
 * after Alma pays, because renaming it would break every formula pointing at it.
 * March 2026 has six of those, three of them settled the same day, all six still
 * announcing themselves as unpaid.
 *
 * Here the state is derived from the two entries instead. A `receivable_new`
 * puts money out, a `receivable_settled` brings it back, and the pair is matched
 * on the category they share, exactly as the spreadsheet matches them. Nothing
 * is written down twice, so nothing can contradict itself, and a name is only
 * ever a name.
 */

export type ReceivableState = 'outstanding' | 'partial' | 'settled' | 'overpaid'

export interface Receivable {
  /** The category both sides carry, which is the debt's name. */
  name: string
  lent: bigint
  returned: bigint
  /** Lent minus returned. Negative means more came back than went out. */
  outstanding: bigint
  state: ReceivableState
  lentOn: Date
  settledOn: Date | null
  /** Days between lending and either settlement or the reference date. */
  age: number
}

export interface ReceivableReview {
  receivables: Receivable[]
  /** Still owed to the household, across everything unsettled. */
  outstanding: bigint
  lent: bigint
  returned: bigint
  /** The unsettled ones, worst first, which is what the panel shows. */
  open: Receivable[]
  /** Open for longer than `staleAfter` days. */
  stale: Receivable[]
}

type Entry = LedgerEntry & { categoryName?: string | null }

const DAY = 24 * 60 * 60 * 1000

export interface ReceivableOptions {
  /** What "now" means, so the ages in a test are not tied to the clock. */
  asOf?: Date
  /** Beyond this many days an open debt is worth mentioning by itself. */
  staleAfter?: number
}

function daysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / DAY))
}

/**
 * Ranked by what is still owed, then by age.
 *
 * Rupiah first for the same reason the budget panel ranks that way: five people
 * owing Rp17.500 each is a smaller problem than one owing Rp400.000, however
 * much longer the small ones have been outstanding. Age breaks the tie, because
 * between two equal debts the older one is the one going bad.
 */
function byExposure(a: Receivable, b: Receivable): number {
  if (a.outstanding !== b.outstanding) return b.outstanding > a.outstanding ? 1 : -1
  if (a.age !== b.age) return b.age - a.age
  return a.name.localeCompare(b.name, 'id')
}

export function reviewReceivables(
  entries: Entry[],
  options: ReceivableOptions = {},
): ReceivableReview {
  const staleAfter = options.staleAfter ?? 30

  interface Bucket {
    lent: bigint
    returned: bigint
    lentOn: Date | null
    lastReturn: Date | null
  }

  const buckets = new Map<string, Bucket>()
  let latest = options.asOf ?? new Date(0)

  for (const entry of entries) {
    if (entry.cashflow !== 'receivable_new' && entry.cashflow !== 'receivable_settled') continue

    const name = entry.categoryName ?? entry.description
    const bucket = buckets.get(name) ?? { lent: 0n, returned: 0n, lentOn: null, lastReturn: null }

    if (entry.cashflow === 'receivable_new') {
      bucket.lent += entry.amount
      // The earliest outlay is when the household's money left, and that is
      // what an age should be measured from.
      if (!bucket.lentOn || entry.occurredAt < bucket.lentOn) bucket.lentOn = entry.occurredAt
    } else {
      bucket.returned += entry.amount
      if (!bucket.lastReturn || entry.occurredAt > bucket.lastReturn) {
        bucket.lastReturn = entry.occurredAt
      }
    }

    buckets.set(name, bucket)
    if (!options.asOf && entry.occurredAt > latest) latest = entry.occurredAt
  }

  const asOf = options.asOf ?? (latest.getTime() === 0 ? new Date() : latest)

  const receivables = [...buckets.entries()]
    .map<Receivable>(([name, bucket]) => {
      const outstanding = bucket.lent - bucket.returned
      const settled = outstanding <= 0n

      const state: ReceivableState =
        outstanding < 0n
          ? 'overpaid'
          : outstanding === 0n
            ? 'settled'
            : bucket.returned > 0n
              ? 'partial'
              : 'outstanding'

      const lentOn = bucket.lentOn ?? bucket.lastReturn ?? asOf
      const settledOn = settled ? bucket.lastReturn : null

      return {
        name,
        lent: bucket.lent,
        returned: bucket.returned,
        outstanding,
        state,
        lentOn,
        settledOn,
        age: daysBetween(lentOn, settledOn ?? asOf),
      }
    })
    .sort(byExposure)

  const open = receivables.filter((item) => item.outstanding > 0n)

  return {
    receivables,
    outstanding: open.reduce((sum, item) => sum + item.outstanding, 0n),
    lent: receivables.reduce((sum, item) => sum + item.lent, 0n),
    returned: receivables.reduce((sum, item) => sum + item.returned, 0n),
    open,
    stale: open.filter((item) => item.age > staleAfter),
  }
}
