'use client'

import { useActionState, useState } from 'react'
import { BUTTON_PLAIN, BUTTON_PRIMARY, BUTTON_QUIET, BUTTON_TINTED, CONTROL } from '@/components/field-base'
import { useActionToast } from '@/components/use-action-toast'
import type { ActionResult } from '@/lib/actions'
import { markPlaceless } from './actions'
import type { WaitingMerchant } from './view-model'

/** Rows shown before "Tampilkan semua"; the list is sorted by money, so the rest is the long tail. */
const FIRST_ROWS = 15

interface Props {
  waiting: WaitingMerchant[]
  /** The merchant being placed right now, if any. */
  placing: string | null
  onPlace: (key: string) => void
}

/** Merchants paid at a counter that have no point yet, biggest first. */
export function WaitingList({ waiting, placing, onPlace }: Props) {
  const [showAll, setShowAll] = useState(false)
  const [query, setQuery] = useState('')
  const needle = query.trim().toLowerCase()
  const matching = needle ? waiting.filter((merchant) => merchant.label.toLowerCase().includes(needle)) : waiting
  const visible = showAll || needle ? matching : matching.slice(0, FIRST_ROWS)

  return (
    <section aria-labelledby="belum-berlokasi">
      <h2 id="belum-berlokasi" tabIndex={-1} className="mb-1 text-subhead font-medium text-ink">
        Semua yang menunggu
      </h2>
      <p className="mb-3 text-footnote text-ink-muted">
        {waiting.length === 0
          ? 'Semua pedagang di pilihan ini sudah ditaruh di peta.'
          : `${waiting.length} pedagang dibayar di kasir tapi belum punya titik, terbesar dulu. Toko online yang menerima QRIS bisa ditandai tanpa tempat.`}
      </p>

      {waiting.length > FIRST_ROWS ? (
        <div className="mb-3">
          <label htmlFor="cari-pedagang" className="sr-only">
            Cari pedagang yang belum berlokasi
          </label>
          <input
            id="cari-pedagang"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
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
                <button
                  type="button"
                  data-place-key={merchant.key}
                  onClick={() => onPlace(merchant.key)}
                  aria-pressed={placing === merchant.key}
                  aria-label={`Taruh ${merchant.label} di peta`}
                  className={placing === merchant.key ? BUTTON_PRIMARY : BUTTON_TINTED}
                >
                  Taruh
                </button>
                <PlacelessButton merchantKey={merchant.key} label={merchant.label} />
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {!needle && waiting.length > FIRST_ROWS ? (
        <button type="button" onClick={() => setShowAll(!showAll)} className={`${BUTTON_PLAIN} mt-2`}>
          {showAll ? 'Tampilkan lebih sedikit' : `Tampilkan semua ${waiting.length}`}
        </button>
      ) : null}
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
