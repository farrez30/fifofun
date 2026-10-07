'use client'

import { useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { CONTROL } from '@/components/field-base'
import { Pager } from '@/components/pager'
import { pageCount, pageSlice } from '@/lib/paging'
import { PlaceTable } from './place-table'
import type { PlacePoint } from './view-model'

/**
 * Every placed merchant, searched and paged in the browser.
 *
 * The map already holds every point, so the list is cut from the same array
 * instead of asking the server for each page: a search answers as it is typed
 * and a page turns at once. Both are mirrored into the address
 * (`tempat-cari`, `tempat-hal`, apart from the waiting list's own `cari` and
 * `hal`, since both lists live on the page at once) so Back from a Pindahkan
 * lands on the same page of the same search.
 */

interface Props {
  /** Biggest first, each with the address that moves its point on the map. */
  points: (PlacePoint & { moveHref: string })[]
}

function mirror(query: string, page: number) {
  const url = new URL(window.location.href)
  if (query.trim()) url.searchParams.set('tempat-cari', query.trim())
  else url.searchParams.delete('tempat-cari')
  if (page > 1) url.searchParams.set('tempat-hal', String(page))
  else url.searchParams.delete('tempat-hal')
  window.history.replaceState(window.history.state, '', url)
}

export function PlaceList({ points }: Props) {
  const params = useSearchParams()
  const [query, setQuery] = useState(() => params?.get('tempat-cari') ?? '')
  const [page, setPage] = useState(() => {
    const asked = Number(params?.get('tempat-hal'))
    return Number.isInteger(asked) && asked > 1 ? asked : 1
  })

  const needle = query.trim().toLowerCase()
  const matching = needle
    ? points.filter((point) => `${point.label} ${point.address ?? ''}`.toLowerCase().includes(needle))
    : points
  const pages = pageCount(matching.length)
  const shown = Math.min(page, pages)
  const hrefs = new Map(points.map((point) => [point.pointId, point.moveHref]))

  return (
    <div className="space-y-3">
      {points.length > 0 ? (
        <div>
          <label htmlFor="cari-tempat" className="sr-only">
            Cari tempat
          </label>
          <input
            id="cari-tempat"
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setPage(1)
              mirror(event.target.value, 1)
            }}
            placeholder="Cari tempat atau alamat"
            autoComplete="off"
            className={CONTROL}
          />
        </div>
      ) : null}
      <PlaceTable
        points={pageSlice(matching, shown)}
        total={points.length}
        matched={needle ? matching.length : null}
        moveHref={(point) => hrefs.get(point.pointId) ?? '/peta'}
      />
      <Pager
        label="Halaman daftar tempat"
        page={shown}
        pages={pages}
        onPage={(next) => {
          setPage(next)
          mirror(query, next)
          document.getElementById('tempat')?.focus()
        }}
      />
    </div>
  )
}
