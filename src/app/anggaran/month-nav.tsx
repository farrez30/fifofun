import Link from 'next/link'
import { formatMonthKey } from '@/lib/datetime'
import { addMonths } from '@/lib/ledger/funds'

/**
 * Which month is being budgeted.
 *
 * Two steps and a jump. The steps are what gets used, because budgeting is
 * almost always about the month next to the one on screen; the month field is
 * there for the once a year somebody goes back to check what December looked
 * like.
 *
 * A GET form rather than a picker that navigates on change: a form submits
 * without JavaScript, and a select that navigates on change traps a keyboard
 * user on whichever option they arrow past first.
 */

export function MonthNav({ period, thisMonth }: { period: string; thisMonth: string }) {
  const previous = addMonths(period, -1)
  const next = addMonths(period, 1)

  return (
    <nav aria-label="Bulan anggaran" className="flex flex-wrap items-center gap-3">
      <Link
        href={`/anggaran?bulan=${previous}`}
        rel="prev"
        className="inline-flex h-11 items-center rounded-sm border border-line px-3 text-sm text-ink transition-colors duration-150 hover:border-line-strong hover:bg-sunken"
      >
        {formatMonthKey(previous)}
      </Link>

      <p aria-current="date" className="text-sm font-medium text-ink">
        {formatMonthKey(period)}
      </p>

      <Link
        href={`/anggaran?bulan=${next}`}
        rel="next"
        className="inline-flex h-11 items-center rounded-sm border border-line px-3 text-sm text-ink transition-colors duration-150 hover:border-line-strong hover:bg-sunken"
      >
        {formatMonthKey(next)}
      </Link>

      {period === thisMonth ? null : (
        <Link
          href="/anggaran"
          className="inline-flex h-11 items-center rounded-sm border border-line px-3 text-sm text-ink transition-colors duration-150 hover:border-line-strong hover:bg-sunken"
        >
          Bulan ini
        </Link>
      )}

      <form action="/anggaran" method="get" className="flex items-center gap-2">
        <label htmlFor="bulan" className="text-xs text-ink-muted">
          Buka bulan
        </label>
        <input
          id="bulan"
          type="month"
          name="bulan"
          defaultValue={period}
          className="h-11 rounded-sm border border-line bg-surface px-2 text-sm text-ink"
        />
        <button
          type="submit"
          className="h-11 rounded-sm border border-line px-3 text-sm text-ink transition-colors duration-150 hover:border-line-strong hover:bg-sunken"
        >
          Buka
        </button>
      </form>
    </nav>
  )
}
