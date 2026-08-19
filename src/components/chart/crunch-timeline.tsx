import { formatIdr, formatIdrCompact, senToRupiahNumber } from '@/lib/money'
import type { FamilyProjection } from '@/lib/planning/children'

/**
 * The cost of children, year by calendar year.
 *
 * The argument about spacing is impossible to feel from a total and obvious from
 * this picture. Entry fees are lumpy, and two of them landing in the same year is
 * a spike the household has to absorb in twelve months. Marking those years is
 * the entire point of drawing this at all.
 */

/*
  A small ordered palette rather than a colour per child chosen at random. Two
  children are the common case and these two are separable for every kind of
  colour blindness, since they differ in lightness as well as hue.
*/
const CHILD_FILLS = [
  'var(--color-accent)',
  'var(--color-under)',
  'var(--color-warn)',
  'var(--color-line-strong)',
]

interface Props {
  projection: FamilyProjection
  caption: string
}

export function CrunchTimeline({ projection, caption }: Props) {
  const { years, children, crunchYears } = projection

  if (years.length === 0) {
    return (
      <figure className="border border-line bg-surface p-6">
        <figcaption className="text-sm font-medium text-ink">{caption}</figcaption>
        <p className="mt-2 text-sm text-ink-muted">
          Tambahkan rencana anak untuk melihat sebaran biayanya per tahun.
        </p>
      </figure>
    )
  }

  const peak = years.reduce((max, year) => (year.total > max ? year.total : max), 1n)
  const peakRupiah = senToRupiahNumber(peak)
  const crunchSet = new Set(crunchYears.map((year) => year.year))
  const labels = children.map((child) => child.label)

  return (
    <figure className="border border-line bg-surface p-4">
      <figcaption className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-ink">{caption}</span>
        <span className="flex flex-wrap items-center gap-3 text-xs text-ink-muted">
          {labels.map((label, index) => (
            <span key={label} className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="inline-block h-2.5 w-2.5"
                style={{ backgroundColor: CHILD_FILLS[index % CHILD_FILLS.length] }}
              />
              {label}
            </span>
          ))}
          {crunchYears.length > 0 ? (
            <span className="flex items-center gap-1.5 text-over">
              <span aria-hidden="true">▲</span>
              Dua biaya masuk bertabrakan
            </span>
          ) : null}
        </span>
      </figcaption>

      <div className="overflow-x-auto pb-1">
        <div className="flex min-w-full items-end gap-px" style={{ height: '13rem' }}>
          {years.map((year) => {
            const crunch = crunchSet.has(year.year)
            return (
              <div key={year.year} className="flex min-w-6 flex-1 flex-col items-center gap-1">
                <span
                  className={`text-[0.625rem] leading-none ${crunch ? 'text-over' : 'text-transparent'}`}
                  aria-hidden="true"
                >
                  ▲
                </span>

                <div className="flex h-full w-full flex-col justify-end">
                  {children.map((child, index) => {
                    const amount = year.byChild[child.label] ?? 0n
                    if (amount === 0n) return null
                    return (
                      <div
                        key={child.label}
                        style={{
                          height: `${(senToRupiahNumber(amount) / peakRupiah) * 100}%`,
                          backgroundColor: CHILD_FILLS[index % CHILD_FILLS.length],
                        }}
                        title={`${child.label}, ${year.year}: ${formatIdrCompact(amount)}`}
                      />
                    )
                  })}
                </div>

                <span
                  className={`text-[0.5625rem] tabular-nums ${crunch ? 'font-medium text-over' : 'text-ink-faint'}`}
                >
                  {String(year.year).slice(2)}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {crunchYears.length > 0 ? (
        <ul className="mt-3 space-y-1 border-t border-line pt-3 text-sm text-ink-muted">
          {crunchYears.map((year) => (
            <li key={year.year}>
              <span className="tnum font-mono text-ink">{year.year}</span>{' '}
              {year.entryFees
                .map((fee) => `${fee.child} masuk ${fee.stage.toUpperCase()}`)
                .join(' dan ')}
              , total {formatIdr(year.total)} dalam satu tahun.
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 border-t border-line pt-3 text-sm text-ink-muted">
          Tidak ada tahun dengan dua biaya masuk sekaligus. Ini yang membuat jarak
          kelahiran terasa di keuangan, bukan totalnya.
        </p>
      )}

      <table className="sr-only">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Tahun</th>
            {labels.map((label) => (
              <th key={label} scope="col">
                {label}
              </th>
            ))}
            <th scope="col">Total</th>
          </tr>
        </thead>
        <tbody>
          {years.map((year) => (
            <tr key={year.year}>
              <th scope="row">{year.year}</th>
              {labels.map((label) => (
                <td key={label}>{formatIdr(year.byChild[label] ?? 0n)}</td>
              ))}
              <td>{formatIdr(year.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}
