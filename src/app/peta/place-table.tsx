import Link from 'next/link'
import { ForgetButton } from './forget-button'
import type { PlacePoint } from './view-model'

/**
 * Every placed merchant as text: the map's figures for anyone who cannot or
 * would rather not read a map, and the place to move or forget a point.
 *
 * A list in a narrow column and a table in a wide one, by the width this
 * section actually gets (see DESIGN.md §4), never by the screen's.
 */

interface Props {
  points: PlacePoint[]
  /** The address of this page with a merchant to place, keeping the filters. */
  moveHref: (key: string) => string
}

const LINK = 'inline-flex min-h-11 items-center px-2 text-subhead font-medium text-accent'

export function PlaceTable({ points, moveHref }: Props) {
  return (
    <section aria-labelledby="tempat" className="@container">
      <h2 id="tempat" className="mb-1 text-subhead font-medium text-ink">
        Tempat
      </h2>
      <p className="mb-3 text-footnote text-ink-muted">
        {points.length === 0
          ? 'Belum ada tempat di pilihan ini. Taruh pedagang dari daftar Belum berlokasi di bawah.'
          : `${points.length} tempat, urut dari yang paling banyak menghabiskan uang.`}
      </p>

      {points.length > 0 ? (
        <>
          <ul aria-label="Tempat" className="rows-inset squircle rounded-md bg-surface shadow-xs @5xl:hidden">
            {points.map((point) => (
              <li key={point.key} className="px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 flex-1 truncate text-subhead text-ink">{point.label}</span>
                  <span className="tnum shrink-0 font-mono text-subhead text-ink">{point.total}</span>
                </div>
                <p className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-footnote text-ink-muted">
                  <span>{point.visits} kali</span>
                  <span aria-hidden="true" className="text-ink-faint">·</span>
                  <span>
                    <span className="tnum font-mono">{point.average}</span> per kunjungan
                  </span>
                  {point.topCategory ? (
                    <>
                      <span aria-hidden="true" className="text-ink-faint">·</span>
                      <span>{point.topCategory}</span>
                    </>
                  ) : null}
                  {point.usualTime ? (
                    <>
                      <span aria-hidden="true" className="text-ink-faint">·</span>
                      <span>biasanya {point.usualTime}</span>
                    </>
                  ) : null}
                </p>
                {point.address ? <p className="mt-0.5 truncate text-footnote text-ink-faint">{point.address}</p> : null}
                <div className="mt-1 -ml-2 flex items-center gap-1">
                  <Link href={moveHref(point.key)} className={LINK} aria-label={`Pindahkan titik ${point.label}`}>
                    Pindahkan
                  </Link>
                  {point.id ? <ForgetButton id={point.id} label={point.label} /> : null}
                </div>
              </li>
            ))}
          </ul>

          <div className="relative hidden overflow-x-auto squircle rounded-md bg-surface shadow-xs @5xl:block">
            <table className="w-full text-subhead">
              <caption className="sr-only">Tempat, dengan total, kunjungan, dan rata-rata per kunjungan</caption>
              <thead>
                <tr className="border-b border-line text-left text-caption1 uppercase tracking-wide text-ink-faint">
                  <th scope="col" className="px-4 py-2.5 font-medium">Tempat</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Total</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Kunjungan</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Per kunjungan</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Kategori</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    <span className="sr-only">Tindakan</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {points.map((point) => (
                  <tr key={point.key} className="border-b border-line last:border-0">
                    <th scope="row" className="max-w-64 px-4 py-2.5 text-left font-normal">
                      <span className="block truncate text-ink">{point.label}</span>
                      {point.address ? (
                        <span className="block truncate text-footnote text-ink-faint">{point.address}</span>
                      ) : null}
                    </th>
                    <td className="tnum whitespace-nowrap px-4 py-2.5 text-right font-mono text-ink">{point.total}</td>
                    <td className="tnum whitespace-nowrap px-4 py-2.5 text-right font-mono text-ink-muted">{point.visits}</td>
                    <td className="tnum whitespace-nowrap px-4 py-2.5 text-right font-mono text-ink-muted">{point.average}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-ink-muted">{point.topCategory ?? '–'}</td>
                    <td className="whitespace-nowrap px-2 py-1 text-right">
                      <span className="inline-flex items-center">
                        <Link href={moveHref(point.key)} className={LINK} aria-label={`Pindahkan titik ${point.label}`}>
                          Pindahkan
                        </Link>
                        {point.id ? <ForgetButton id={point.id} label={point.label} /> : null}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </section>
  )
}
