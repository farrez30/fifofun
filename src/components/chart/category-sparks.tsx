import type { CategoryMovement, CategoryTrend, CategoryTrendReview } from '@/lib/ledger/category-trend'
import { formatIdr, formatIdrCompact, senToRupiahNumber } from '@/lib/money'

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

export function CategorySparks({ review, caption }: Props) {
  const { trends, months, omitted, omittedTotal } = review

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
          <Card key={trend.category} trend={trend} />
        ))}
      </ul>

      {omitted > 0 ? (
        <p className="mt-4 border-t border-line pt-3 text-xs text-ink-faint">
          {omitted} kategori lain tidak digambar, semuanya bersama-sama{' '}
          {formatIdrCompact(omittedTotal)} sepanjang {months.length} bulan ini.
        </p>
      ) : null}

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
            {trends.map((trend) => (
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

function Card({ trend }: { trend: CategoryTrend }) {
  const style = MOVEMENT[trend.movement]
  const peak = senToRupiahNumber(trend.peak > 0n ? trend.peak : 1n)
  const heightOf = (amount: bigint) => (senToRupiahNumber(amount) / peak) * 100

  return (
    <li className="border border-line bg-sunken p-3">
      <p className="truncate text-sm text-ink" title={trend.category}>
        {trend.category}
      </p>
      <p className="tnum mt-0.5 font-mono text-sm text-ink">{formatIdr(trend.latest)}</p>

      {/*
        The row has a height of its own and each column stretches to fill it,
        which is what gives the percentage inside something to resolve against.
        Sized to their content instead, the columns collapse and every bar in
        the app draws zero pixels tall while still type checking.
      */}
      <div className="relative mt-2 flex h-12 gap-px" data-spark={trend.category}>
        {trend.usual > 0n ? (
          <div
            aria-hidden="true"
            className="absolute inset-x-0 border-t border-dashed border-ink-faint"
            style={{ bottom: `${heightOf(trend.usual)}%` }}
          />
        ) : null}

        {trend.points.map((point, index) => {
          const last = index === trend.points.length - 1
          return (
            <div key={point.month} className="flex flex-1 flex-col justify-end">
              <div
                data-month={point.month}
                title={`${point.month}: ${formatIdr(point.amount)}`}
                className={
                  last
                    ? trend.movement === 'melonjak'
                      ? 'bg-over'
                      : 'bg-accent'
                    : 'bg-line-strong'
                }
                // A month that really spent nothing gets nothing. Everything
                // else keeps a hairline, so a quiet month and an empty one do
                // not look the same.
                style={{
                  height: point.amount === 0n ? '0' : `max(1px, ${heightOf(point.amount)}%)`,
                }}
              />
            </div>
          )
        })}
      </div>

      <p className={`mt-1.5 text-xs ${style.tone}`}>
        {style.glyph ? (
          <span aria-hidden="true" className="mr-1">
            {style.glyph}
          </span>
        ) : null}
        <span className="text-ink-muted">
          {style.words}
          {trend.usual > 0n ? `, ${formatIdrCompact(trend.usual)}` : ''}
        </span>
      </p>
    </li>
  )
}
