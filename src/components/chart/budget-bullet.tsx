import { formatIdr, senToRupiahNumber } from '@/lib/money'

/**
 * Budget against actual, one row per category.
 *
 * A bullet chart rather than a pair of bars: the budget is a line the spending
 * either crosses or does not, which is the question being asked. Two side-by-side
 * bars make the reader do the comparison themselves.
 *
 * Overspending is marked three ways at once, by colour, by a glyph and by the
 * bar visibly passing the marker. The source spreadsheet let a category reach
 * 5964% of budget without anything drawing the eye to it, and colour alone would
 * repeat that failure for anyone who cannot separate red from green.
 */

export interface BudgetRow {
  category: string
  budget: bigint
  actual: bigint
}

interface Props {
  rows: BudgetRow[]
  caption: string
}

export function BudgetBullet({ rows, caption }: Props) {
  if (rows.length === 0) {
    return (
      <figure className="border border-line bg-surface p-6">
        <figcaption className="text-sm font-medium text-ink">{caption}</figcaption>
        <p className="mt-2 text-sm text-ink-muted">Belum ada anggaran yang ditetapkan.</p>
      </figure>
    )
  }

  // One shared scale across every row, so bar lengths are comparable between
  // categories rather than each row being normalised to itself.
  const ceiling = rows.reduce((max, row) => {
    const local = row.actual > row.budget ? row.actual : row.budget
    return local > max ? local : max
  }, 1n)
  const ceilingRupiah = senToRupiahNumber(ceiling)
  const percentOf = (sen: bigint) => (senToRupiahNumber(sen) / ceilingRupiah) * 100

  const sorted = [...rows].sort((a, b) => {
    const overshoot = (row: BudgetRow) =>
      row.budget === 0n ? 0 : senToRupiahNumber(row.actual) / senToRupiahNumber(row.budget)
    return overshoot(b) - overshoot(a)
  })

  return (
    <figure className="border border-line bg-surface p-4">
      <figcaption className="mb-4 text-sm font-medium text-ink">{caption}</figcaption>

      <ul className="space-y-3">
        {sorted.map((row) => {
          const over = row.actual > row.budget && row.budget > 0n
          const share =
            row.budget === 0n
              ? null
              : Math.round(
                  (senToRupiahNumber(row.actual) / senToRupiahNumber(row.budget)) * 100,
                )

          return (
            <li key={row.category}>
              <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                <span className="flex items-center gap-1.5 text-ink">
                  {over ? (
                    <span aria-hidden="true" className="text-over">
                      ▲
                    </span>
                  ) : null}
                  {row.category}
                </span>
                <span className="tnum font-mono text-xs text-ink-muted">
                  {formatIdr(row.actual)}
                  <span className="text-ink-faint"> / {formatIdr(row.budget)}</span>
                  {share === null ? null : (
                    <span className={over ? 'ml-2 text-over' : 'ml-2 text-ink-faint'}>
                      {share}%
                    </span>
                  )}
                </span>
              </div>

              <div className="relative h-4 bg-sunken">
                <div
                  className={over ? 'h-full bg-over' : 'h-full bg-accent'}
                  style={{ width: `${percentOf(row.actual)}%` }}
                />
                {/* The budget marker sits above the bar so crossing it is visible
                    even where the two colours are indistinguishable. */}
                {row.budget > 0n ? (
                  <div
                    className="absolute inset-y-0 w-0.5 bg-ink"
                    style={{ left: `${percentOf(row.budget)}%` }}
                    aria-hidden="true"
                  />
                ) : null}
              </div>

              <span className="sr-only">
                {row.category}: terpakai {formatIdr(row.actual)} dari anggaran{' '}
                {formatIdr(row.budget)}
                {over ? ', melebihi anggaran' : ''}
              </span>
            </li>
          )
        })}
      </ul>
    </figure>
  )
}
