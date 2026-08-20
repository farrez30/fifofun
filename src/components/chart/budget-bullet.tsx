import type { BudgetLine, BudgetReview } from '@/lib/ledger/budget'
import { formatIdr, formatIdrCompact, senToRupiahNumber } from '@/lib/money'

/**
 * Budget against actual, one row per category.
 *
 * A bullet chart rather than a pair of bars: the budget is a line the spending
 * either crosses or does not, which is the question being asked. Two side-by-side
 * bars make the reader do the comparison themselves.
 *
 * A breach is marked three ways at once, by colour, by a glyph and by the bar
 * visibly passing the marker. The source spreadsheet let a category reach 5964%
 * of budget without anything drawing the eye to it, and colour alone would repeat
 * that failure for anyone who cannot separate red from green.
 *
 * The ordering is decided in `reviewBudget`, not here. Sorting inside a chart
 * means the ranking cannot be tested without rendering, and the ranking is the
 * part that decides whether the reader sees the problem at all.
 */

const STATUS = {
  over: { glyph: '▲', bar: 'bg-over', text: 'text-over', label: 'lewat anggaran' },
  unbudgeted: { glyph: '◆', bar: 'bg-warn', text: 'text-warn', label: 'tanpa anggaran' },
  under: { glyph: null, bar: 'bg-accent', text: 'text-ink-faint', label: 'dalam anggaran' },
} as const

interface Props {
  review: BudgetReview
  caption: string
}

export function BudgetBullet({ review, caption }: Props) {
  const { lines } = review

  if (lines.length === 0) {
    return (
      <figure className="border border-line bg-surface p-6">
        <figcaption className="text-sm font-medium text-ink">{caption}</figcaption>
        <p className="mt-2 text-sm text-ink-muted">Belum ada anggaran maupun pengeluaran bulan ini.</p>
      </figure>
    )
  }

  // One shared scale across every row, so bar lengths are comparable between
  // categories rather than each row being normalised to itself.
  const ceiling = lines.reduce((max, line) => {
    const local = line.actual > line.budget ? line.actual : line.budget
    return local > max ? local : max
  }, 1n)
  const ceilingRupiah = senToRupiahNumber(ceiling)
  const percentOf = (sen: bigint) => (senToRupiahNumber(sen) / ceilingRupiah) * 100

  return (
    <figure className="border border-line bg-surface p-4">
      <figcaption className="mb-1 flex flex-wrap items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-ink">{caption}</span>
        <span className="tnum font-mono text-xs text-ink-muted">
          {formatIdrCompact(review.totalActual)}
          <span className="text-ink-faint"> dari {formatIdrCompact(review.totalBudget)}</span>
        </span>
      </figcaption>

      <p className="mb-4 text-xs text-ink-muted">
        {review.source === 'derived'
          ? 'Anggaran ini diturunkan dari median enam bulan terakhirmu, bukan angka yang kamu tetapkan. Ubah kapan saja.'
          : 'Anggaran yang kamu tetapkan sendiri.'}
      </p>

      <ul className="space-y-3">
        {lines.map((line) => (
          <Row key={line.category} line={line} percentOf={percentOf} />
        ))}
      </ul>
    </figure>
  )
}

function Row({ line, percentOf }: { line: BudgetLine; percentOf: (sen: bigint) => number }) {
  const style = STATUS[line.status]

  return (
    <li>
      <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
        <span className="flex items-center gap-1.5 text-ink">
          {style.glyph ? (
            <span aria-hidden="true" className={style.text}>
              {style.glyph}
            </span>
          ) : null}
          {line.category}
        </span>
        <span className="tnum font-mono text-xs text-ink-muted">
          {formatIdr(line.actual)}
          <span className="text-ink-faint">
            {' / '}
            {line.budget === 0n ? 'belum dianggarkan' : formatIdr(line.budget)}
          </span>
          {line.share === null ? null : (
            <span className={`ml-2 ${style.text}`}>{Math.round(line.share)}%</span>
          )}
        </span>
      </div>

      <div className="relative h-4 bg-sunken">
        <div className={`h-full ${style.bar}`} style={{ width: `${percentOf(line.actual)}%` }} />
        {/* The budget marker sits above the bar so crossing it is visible even
            where the two colours are indistinguishable. */}
        {line.budget > 0n ? (
          <div
            className="absolute inset-y-0 w-0.5 bg-ink"
            style={{ left: `${percentOf(line.budget)}%` }}
            aria-hidden="true"
          />
        ) : null}
      </div>

      <span className="sr-only">
        {line.category}: terpakai {formatIdr(line.actual)}
        {line.budget === 0n
          ? ', tanpa anggaran'
          : ` dari anggaran ${formatIdr(line.budget)}, ${style.label}`}
      </span>
    </li>
  )
}
