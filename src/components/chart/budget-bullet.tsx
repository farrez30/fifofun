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

const ALARM = {
  over: { glyph: '▲', bar: 'bg-over', text: 'text-over' },
  unbudgeted: { glyph: '◆', bar: 'bg-warn', text: 'text-warn' },
} as const

const QUIET = { glyph: null, bar: 'bg-accent', text: 'text-ink-faint' } as const

/**
 * A derived figure is not a plan, and must not borrow the word for one.
 *
 * The panel used to tell a household it had gone "lewat anggaran" on bank
 * charges against a Rp36.500 budget nobody ever set: that figure was the median
 * of their own past six months. Reporting a broken plan where no plan exists
 * asks someone to answer for a decision they never made.
 */
const WORDING = {
  manual: {
    against: (amount: string) => `anggaran ${amount}`,
    none: 'belum dianggarkan',
    over: 'lewat anggaran',
    unbudgeted: 'tanpa anggaran',
    under: 'dalam anggaran',
  },
  derived: {
    against: (amount: string) => `biasanya ${amount}`,
    none: 'belum pernah muncul',
    over: 'di atas kebiasaan',
    unbudgeted: 'kategori baru bulan ini',
    under: 'seperti biasa',
  },
} as const

function styleFor(line: BudgetLine) {
  if (line.status === 'under' || !line.material) return QUIET
  return ALARM[line.status]
}

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

  const quiet = lines.filter((line) => line.status !== 'under' && !line.material).length

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
          ? 'Pembandingnya median enam bulan terakhirmu, bukan angka yang kamu tetapkan sendiri. Tetapkan anggaranmu kapan saja untuk menggantinya.'
          : 'Pembandingnya anggaran yang kamu tetapkan sendiri.'}
      </p>

      <ul className="space-y-3">
        {lines.map((line) => (
          <Row key={line.category} line={line} percentOf={percentOf} source={review.source} />
        ))}
      </ul>

      {quiet > 0 ? (
        <p className="mt-4 border-t border-line pt-3 text-xs text-ink-faint">
          {quiet} kategori lewat sedikit tanpa ditandai. Selisih di bawah satu persen pengeluaran
          bulan ini tidak diberi tanda, supaya tanda yang ada tetap berarti.
        </p>
      ) : null}
    </figure>
  )
}

function Row({
  line,
  percentOf,
  source,
}: {
  line: BudgetLine
  percentOf: (sen: bigint) => number
  source: BudgetReview['source']
}) {
  const style = styleFor(line)
  const words = WORDING[source]
  const label = words[line.status]

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
            {' · '}
            {line.budget === 0n ? words.none : words.against(formatIdr(line.budget))}
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
        {line.budget === 0n ? '' : `, ${words.against(formatIdr(line.budget))}`}, {label}
      </span>
    </li>
  )
}
