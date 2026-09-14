import Link from 'next/link'
import { NavHint } from '@/components/nav-hint'
import { formatMonthKey } from '@/lib/datetime'
import { addMonths } from '@/lib/ledger/funds'
import { BUTTON_QUIET, CONTROL } from '@/components/field-base'

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
        className={BUTTON_QUIET}
      >
        {formatMonthKey(previous)}
        <NavHint className="ml-1.5" />
      </Link>

      <p aria-current="date" className="text-subhead font-medium text-ink">
        {formatMonthKey(period)}
      </p>

      <Link
        href={`/anggaran?bulan=${next}`}
        rel="next"
        className={BUTTON_QUIET}
      >
        {formatMonthKey(next)}
        <NavHint className="ml-1.5" />
      </Link>

      {period === thisMonth ? null : (
        <Link
          href="/anggaran"
          className={BUTTON_QUIET}
        >
          Bulan ini
          <NavHint className="ml-1.5" />
        </Link>
      )}

      <form action="/anggaran" method="get" className="flex items-center gap-2">
        <label htmlFor="bulan" className="text-footnote text-ink-muted">
          Buka bulan
        </label>
        <input
          id="bulan"
          type="month"
          name="bulan"
          defaultValue={period}
          className={CONTROL}
        />
        <button
          type="submit"
          className={BUTTON_QUIET}
        >
          Buka
        </button>
      </form>
    </nav>
  )
}
