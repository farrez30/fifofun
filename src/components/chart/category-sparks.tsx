import type { CategoryMovement, CategoryTrend, CategoryTrendReview } from '@/lib/ledger/category-trend'
import { formatMonthKey } from '@/lib/datetime'
import { formatIdr, formatIdrCompact, senToRupiahNumber } from '@/lib/money'
import { SparkCard, type SparkView } from './spark-card'

/**
 * One small chart per spending category, all on the same page.
 *
 * The budget panel answers whether a category is above its usual this month.
 * This one answers the question that decides what to do about it, which is
 * whether the month is an accident or the fourth step of a climb. Both readings
 * come from the same ledger, and until now only the first was drawn.
 *
 * Each category is scaled to its own peak rather than to a shared axis. Sharing
 * one would make the shape of every category except the largest a flat line, and
 * shape is the entire content here; the figures beside each chart carry the size.
 * Nothing in a card is ever compared to another card by length.
 *
 * The cards are client islands and everything else here is not. The bars had a
 * `title` and nothing else, so the figures were unreachable by keyboard and on
 * a phone; the reading now happens in the card. Which categories exist and
 * which were left out is decided here, on the server, where the amounts are
 * still exact.
 */

const MOVEMENT: Record<CategoryMovement, { glyph: string | null; tone: string; words: string }> = {
  melonjak: { glyph: '▲', tone: 'text-over', words: 'jauh di atas biasanya' },
  mereda: { glyph: '▼', tone: 'text-under', words: 'jauh di bawah biasanya' },
  baru: { glyph: '◆', tone: 'text-warn', words: 'baru muncul bulan ini' },
  biasa: { glyph: null, tone: 'text-ink-faint', words: 'seperti biasa' },
}

interface Props {
  review: CategoryTrendReview
  caption: string
}

function toView(trend: CategoryTrend): SparkView {
  const style = MOVEMENT[trend.movement]
  const peak = senToRupiahNumber(trend.peak > 0n ? trend.peak : 1n)
  const heightOf = (amount: bigint) => (senToRupiahNumber(amount) / peak) * 100

  return {
    category: trend.category,
    latestAmount: formatIdr(trend.latest),
    usualPct: trend.usual > 0n ? heightOf(trend.usual) : null,
    points: trend.points.map((point, index) => ({
      month: point.month,
      label: formatMonthKey(point.month),
      pct: heightOf(point.amount),
      amount: formatIdr(point.amount),
      // Against the household's own usual for this category, which is the only
      // comparison that means anything at this scale.
      share:
        trend.usual > 0n ? Number((point.amount * 100n) / trend.usual) : null,
      latest: index === trend.points.length - 1,
    })),
    glyph: style.glyph,
    tone: style.tone,
    words: `${style.words}${trend.usual > 0n ? `, ${formatIdrCompact(trend.usual)}` : ''}`,
    latestFill: trend.movement === 'melonjak' ? 'bg-over' : 'bg-accent',
  }
}

export function CategorySparks({ review, caption }: Props) {
  const { trends, months, omitted, omittedTotal, rest } = review

  if (trends.length === 0) {
    return (
      <figure className="border border-line bg-surface p-6">
        <figcaption className="text-sm font-medium text-ink">{caption}</figcaption>
        <p className="mt-2 text-sm text-ink-muted">
          Belum ada pengeluaran berkategori untuk dibandingkan antar bulan.
        </p>
      </figure>
    )
  }

  const moving = trends.filter((trend) => trend.movement !== 'biasa')

  return (
    <figure className="border border-line bg-surface p-4">
      <figcaption className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-sm font-medium text-ink">{caption}</span>
        <span className="text-xs text-ink-muted">
          {months.length} bulan, {trends.length} kategori terbesar
        </span>
      </figcaption>

      <p className="mb-4 text-xs text-ink-muted">
        {moving.length === 0
          ? 'Tidak ada kategori yang bulan ini jauh berbeda dari kebiasaannya.'
          : `${moving.length} kategori bulan ini jauh berbeda dari kebiasaannya: ${moving
              .map((trend) => trend.category)
              .join(', ')}.`}
      </p>

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {trends.map((trend) => (
          <SparkCard key={trend.category} view={toView(trend)} />
        ))}
      </ul>

      {omitted > 0 ? (
        /* Native disclosure rather than state: opening a list needs no
           JavaScript, and the cards inside are the same client islands. */
        <details className="mt-4 border-t border-line pt-3">
          <summary className="cursor-pointer text-xs text-accent underline underline-offset-2">
            Tampilkan {omitted} kategori lain, bersama-sama {formatIdrCompact(omittedTotal)}{' '}
            sepanjang {months.length} bulan ini
          </summary>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {rest.map((trend) => (
              <SparkCard key={trend.category} view={toView(trend)} />
            ))}
          </ul>
        </details>
      ) : null}

      <p className="mt-3 text-xs text-ink-faint">
        Arahkan kursor atau pakai tombol panah untuk membaca bulan tertentu. Garis putus-putus itu
        kebiasaan kategori ini, bukan anggaran.
      </p>

      {/* Wrapped, because a table ignores the one pixel width sr-only sets. */}
      <div className="sr-only">
        <table>
          <caption>{caption}</caption>
          <thead>
            <tr>
              <th scope="col">Kategori</th>
              {months.map((month) => (
                <th key={month} scope="col">
                  {month}
                </th>
              ))}
              <th scope="col">Biasanya</th>
            </tr>
          </thead>
          <tbody>
            {[...trends, ...rest].map((trend) => (
              <tr key={trend.category}>
                <th scope="row">{trend.category}</th>
                {trend.points.map((point) => (
                  <td key={point.month}>{formatIdr(point.amount)}</td>
                ))}
                <td>{formatIdr(trend.usual)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  )
}
