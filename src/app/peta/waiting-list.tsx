'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useActionState, useState } from 'react'
import { BUTTON_QUIET, BUTTON_TINTED, CONTROL } from '@/components/field-base'
import { Pager } from '@/components/pager'
import { useActionToast } from '@/components/use-action-toast'
import type { ActionResult } from '@/lib/actions'
import { pageCount, pageSlice } from '@/lib/paging'
import { markPlaceless } from './actions'
import type { WaitingMerchant } from './view-model'

interface Props {
  /** Biggest first, each with the address that opens its placing panel on the map. */
  waiting: (WaitingMerchant & { href: string })[]
  /** The search and page in the address, so Back from the map returns to them. */
  initialQuery?: string
  initialPage?: number
}

/**
 * Merchants paid at a counter that have no point yet, biggest first.
 *
 * Its own view of the map page, a page of twenty at a time. It used to sit
 * under the map and unfold all of them on "Tampilkan semua", which made the
 * page thirty phone screens long. Taruh is a link back to the map with the
 * merchant picked, because placing is a click on the map and the map is the
 * other view; the queue above the map still walks them one by one.
 *
 * The search runs in the browser over every merchant, not the page on screen,
 * and starts again from the first page of what it found. Both are mirrored
 * into the address with replaceState, without a round trip: Taruh leaves for
 * the map, and Back has to land on the same page of the same search.
 */
function mirror(query: string, page: number) {
  const url = new URL(window.location.href)
  if (query.trim()) url.searchParams.set('cari', query.trim())
  else url.searchParams.delete('cari')
  if (page > 1) url.searchParams.set('hal', String(page))
  else url.searchParams.delete('hal')
  window.history.replaceState(window.history.state, '', url)
}

export function WaitingList({ waiting, initialQuery = '', initialPage = 1 }: Props) {
  /*
    Read from the address as it is now, not only from the server's props: Back
    restores the router's cached render of this view, made before the search
    was typed, while the address itself already carries it.
  */
  const params = useSearchParams()
  const [query, setQuery] = useState(() => params?.get('cari') ?? initialQuery)
  const [page, setPage] = useState(() => {
    const asked = Number(params?.get('hal'))
    return Number.isInteger(asked) && asked > 1 ? asked : initialPage
  })
  const needle = query.trim().toLowerCase()
  const matching = needle ? waiting.filter((merchant) => merchant.label.toLowerCase().includes(needle)) : waiting
  const pages = pageCount(matching.length)
  const shown = Math.min(page, pages)
  const visible = pageSlice(matching, shown)

  return (
    <section aria-labelledby="belum-berlokasi">
      <h2 id="belum-berlokasi" tabIndex={-1} className="mb-1 text-subhead font-medium text-ink">
        Semua yang menunggu
      </h2>
      <p className="max-w-2xl mb-3 text-footnote text-ink-muted">
        {waiting.length === 0
          ? 'Semua pedagang di pilihan ini sudah ditaruh di peta.'
          : `${waiting.length} pedagang dibayar di kasir tapi belum punya titik, terbesar dulu. Toko online yang menerima QRIS bisa ditandai tanpa tempat.`}
      </p>

      {waiting.length > visible.length || needle ? (
        <div className="mb-3">
          <label htmlFor="cari-pedagang" className="sr-only">
            Cari pedagang yang belum berlokasi
          </label>
          <input
            id="cari-pedagang"
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setPage(1)
              mirror(event.target.value, 1)
            }}
            placeholder="Cari pedagang, misalnya spbu"
            autoComplete="off"
            className={CONTROL}
          />
          {needle ? (
            <p role="status" className="mt-1 text-footnote text-ink-muted">
              {matching.length === 0 ? 'Tidak ada pedagang dengan nama itu.' : `${matching.length} pedagang cocok.`}
            </p>
          ) : null}
        </div>
      ) : null}

      {visible.length > 0 ? (
        <ul className="squircle rows-inset divide-y divide-line rounded-md bg-surface shadow-xs">
          {visible.map((merchant) => (
            <li key={merchant.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
              {/* A floor on the name's column, so on a phone the buttons wrap
                  under it instead of squeezing the name to a few letters. */}
              <div className="min-w-48 flex-1">
                <p className="truncate text-subhead text-ink">{merchant.label}</p>
                <p className="text-footnote text-ink-muted">
                  <span className="tnum font-mono">{merchant.total}</span> · {merchant.visits} kali · terakhir{' '}
                  {merchant.last}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {/* Taruh is the job here, so it carries the tint; Tanpa tempat is the exception. */}
                <Link
                  href={merchant.href}
                  data-place-key={merchant.key}
                  aria-label={`Taruh ${merchant.label} di peta`}
                  className={BUTTON_TINTED}
                >
                  Taruh
                </Link>
                <PlacelessButton merchantKey={merchant.key} label={merchant.label} />
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <Pager
        label="Halaman pedagang yang menunggu"
        page={shown}
        pages={pages}
        onPage={(next) => {
          setPage(next)
          mirror(query, next)
          document.getElementById('belum-berlokasi')?.focus()
        }}
      />
    </section>
  )
}

export function PlacelessButton({ merchantKey, label }: { merchantKey: string; label: string }) {
  const [result, action, saving] = useActionState<ActionResult | null, FormData>(markPlaceless, null)
  useActionToast(result, saving)

  return (
    <form action={action}>
      <input type="hidden" name="merchantKey" value={merchantKey} />
      <input type="hidden" name="label" value={label} />
      <button type="submit" aria-busy={saving} className={BUTTON_QUIET} aria-label={`Tandai ${label} tanpa tempat`}>
        Tanpa tempat
      </button>
    </form>
  )
}
