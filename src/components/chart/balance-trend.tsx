import { buildSpanScale } from '@/lib/ledger/scale'
import { buildBalanceTrend, type TrendPoint } from '@/lib/ledger/trend'
import type { MonthlySeries } from '@/lib/ledger/monthly'
import { formatIdr, formatIdrCompact } from '@/lib/money'
import { nudge } from './axis'

/**
 * The balance at the end of each month, drawn as one line.
 *
 * Every other chart here answers a question about a single month. This is the
 * one that answers whether the pile is growing, which no month can answer on
 * its own: three months can each look reasonable and still be three steps down.
 *
 * Drawn as a line, and deliberately not as bars or a filled area, because the
 * axis does not start at zero. A household sitting on Rp27 juta moves by a
 * couple of million and a zero-based chart renders that as six identical
 * columns. Cropping the axis is the only way to show the movement, and a line
 * is the only mark that stays honest once the floor has moved: it claims the
 * points differ by what the axis says, and nothing more. A bar drawn from a
 * cropped floor claims a ratio that is not true.
 */

const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agu',
  'Sep',
  'Okt',
  'Nov',
  'Des',
]

function shortMonth(key: string): string {
  const [, month] = key.split('-')
  return MONTH_LABELS[Number(month) - 1] ?? key
}

/** `Jan '26` at a year boundary, plain `Jan` inside one. */
function labelFor(point: TrendPoint, previous: TrendPoint | null): string {
  const year = point.month.slice(0, 4)
  const turned = !previous || previous.month.slice(0, 4) !== year
  return turned ? `${shortMonth(point.month)} '${year.slice(2)}` : shortMonth(point.month)
}

const WORDS = {
  naik: 'naik',
  turun: 'turun',
  datar: 'praktis datar',
} as const

interface Props {
  series: MonthlySeries[]
  caption: string
}

export function BalanceTrend({ series, caption }: Props) {
  const trend = buildBalanceTrend(series)

  if (!trend) {
    return (
      <figure className="border border-line bg-surface p-6">
        <figcaption className="text-sm font-medium text-ink">{caption}</figcaption>
        <p className="mt-2 text-sm text-ink-muted">
          Perlu dua bulan tercatat sebelum ada arah yang bisa dibaca. Sekarang baru{' '}
          {series.length}.
        </p>
      </figure>
    )
  }

  const { points, low, high, latest, change, direction } = trend
  const scale = buildSpanScale(low.balance, high.balance, { target: 3, includeZero: false })
  const cropped = scale.bottom !== 0n
  const dense = points.length > 12

  const xAt = (index: number) => (index / (points.length - 1)) * 100
  const yAt = (balance: bigint) => 100 - scale.percentOf(balance)

  const line = points.map((point, index) => `${xAt(index)},${yAt(point.balance)}`).join(' ')

  return (
    <figure className="border border-line bg-surface p-4">
      <figcaption className="mb-1 text-sm font-medium text-ink">{caption}</figcaption>
      <p className="mb-4 text-xs text-ink-muted">
        {formatIdrCompact(latest.balance)} pada akhir {labelFor(latest, null)}, {WORDS[direction]}{' '}
        {direction === 'datar'
          ? `sejak ${labelFor(points[0], null)}`
          : `${formatIdrCompact(change < 0n ? -change : change)} sejak ${labelFor(points[0], null)}`}
        . Terendah {formatIdrCompact(low.balance)} di {labelFor(low, null)}.
      </p>

      <div className="grid grid-cols-[3.5rem_1fr] gap-x-2">
        <div className="relative">
          {scale.ticks.map((tick) => (
            <span
              key={String(tick)}
              className="absolute right-0 -translate-y-1/2 whitespace-nowrap text-[0.625rem] leading-none text-ink-faint"
              style={{ top: `${yAt(tick)}%` }}
            >
              {formatIdrCompact(tick)}
            </span>
          ))}
        </div>

        <div className="relative h-44">
          {scale.ticks.map((tick) => (
            <div
              key={String(tick)}
              aria-hidden="true"
              className={`absolute inset-x-0 h-px ${tick === 0n ? 'bg-line-strong' : 'bg-line'}`}
              style={{ top: `${yAt(tick)}%` }}
            />
          ))}

          {/*
            The plot stretches to whatever width it is given, so the drawing has
            no fixed aspect and the viewBox is just percentages. Everything that
            must not stretch with it, the stroke and every dot, is either told
            not to scale or drawn as its own element on top.
          */}
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full"
            aria-hidden="true"
          >
            <polyline
              points={line}
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          {points.map((point, index) => {
            const lowest = point.month === low.month
            const called = lowest || index === points.length - 1
            /*
              Two years of months put a dot every ten pixels. At the ordinary
              size they touch and the line disappears behind its own markers, so
              past a year they shrink and lose their outline. Every month keeps
              its dot rather than being dropped, because the dot is what carries
              the figure on hover.
            */
            const size = called
              ? 'h-2.5 w-2.5 border border-surface'
              : dense
                ? 'h-1 w-1'
                : 'h-1.5 w-1.5 border border-surface'
            return (
              <div
                key={point.month}
                data-point={point.month}
                title={`${labelFor(point, null)}: ${formatIdr(point.balance)}`}
                className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full ${size} ${
                  lowest ? 'bg-warn' : 'bg-accent'
                }`}
                style={{ left: `${xAt(index)}%`, top: `${yAt(point.balance)}%` }}
              />
            )
          })}
        </div>

        <span />
        {/* One label per month is unreadable past a year of data. The ends carry
            the range and every January carries the year, which is the least that
            still lets a reader place any point on the line. */}
        <div className="relative mt-1.5 h-3">
          {points.map((point, index) => {
            const previous = index === 0 ? null : points[index - 1]
            const turned = !previous || previous.month.slice(0, 4) !== point.month.slice(0, 4)
            if (!turned && index !== points.length - 1) return null
            const pct = xAt(index)
            return (
              <span
                key={point.month}
                className="absolute top-0 whitespace-nowrap text-[0.625rem] leading-none text-ink-faint"
                style={{ left: `${pct}%`, transform: nudge(pct) }}
              >
                {labelFor(point, previous)}
              </span>
            )
          })}
        </div>
      </div>

      {cropped ? (
        <p className="mt-3 text-xs text-ink-muted">
          Sumbu tegaknya mulai dari {formatIdrCompact(scale.bottom)}, bukan nol, supaya selisih
          antar bulan kelihatan. Karena itu digambar sebagai garis: panjang batang dari lantai yang
          bukan nol akan membesar-besarkan selisihnya.
        </p>
      ) : null}

      <p className="mt-2 text-xs text-ink-faint">
        Yang dihitung baru uang. Emas dan tanah belum bisa dicatat di app ini, jadi ini bukan
        kekayaan bersih.
      </p>

      {/* Wrapped, because a table ignores the one pixel width sr-only sets. */}
      <div className="sr-only">
        <table>
          <caption>{caption}</caption>
          <thead>
            <tr>
              <th scope="col">Bulan</th>
              <th scope="col">Saldo akhir</th>
            </tr>
          </thead>
          <tbody>
            {points.map((point) => (
              <tr key={point.month}>
                <th scope="row">{point.month}</th>
                <td>{formatIdr(point.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  )
}
