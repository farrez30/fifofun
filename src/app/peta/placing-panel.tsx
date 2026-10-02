'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { BUTTON_PRIMARY, BUTTON_QUIET, BUTTON_TINTED, CONTROL } from '@/components/field-base'
import { useActionToast } from '@/components/use-action-toast'
import type { ActionResult } from '@/lib/actions'
import type { Candidate } from '@/lib/places/nominatim'
import { saveMerchantLocation, searchPlace, type SearchResult } from './actions'

/**
 * Putting one merchant on the map: a search on OpenStreetMap, or a point
 * clicked on the map, then a name and a save. The map itself lives in
 * place-workspace.tsx; this panel only hears where the point is.
 */

export interface Pending {
  lat: number
  lng: number
  address: string | null
  source: 'manual' | 'osm'
}

interface Props {
  merchantKey: string
  /** The stored point being moved; absent when placing a merchant afresh. */
  locationId: string | null
  validFrom: string | null
  validTo: string | null
  /** What the statement calls it, for the heading and the search box. */
  query: string
  pending: Pending | null
  label: string
  onLabel: (label: string) => void
  onChoose: (candidate: Candidate) => void
  /** `saved` tells the workspace where focus should go next. */
  onDone: (saved: boolean) => void
}

export function PlacingPanel({
  merchantKey,
  locationId,
  validFrom,
  validTo,
  query,
  pending,
  label,
  onLabel,
  onChoose,
  onDone,
}: Props) {
  const heading = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    /*
      A jump, one frame late. The panel has just been inserted above the map,
      and a smooth scroll started while the page is still settling overshoots:
      the browser's scroll anchoring moves the page under it.
    */
    const frame = requestAnimationFrame(() => {
      heading.current?.scrollIntoView({ block: 'start' })
      heading.current?.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(frame)
  }, [merchantKey])

  return (
    <section aria-labelledby="atur" className="squircle space-y-4 rounded-md bg-surface p-4 shadow-xs">
      <div>
        <h2 id="atur" ref={heading} tabIndex={-1} className="scroll-mt-4 text-subhead font-medium text-ink">
          Menaruh {query}
        </h2>
        <p className="mt-1 text-subhead text-ink-muted">
          Cari namanya di OpenStreetMap, atau klik langsung di peta. Titiknya bisa diseret sebelum disimpan.
        </p>
      </div>

      <SearchPanel key={merchantKey} query={query} onChoose={onChoose} />

      <SaveForm
        key={locationId ?? merchantKey}
        merchantKey={merchantKey}
        locationId={locationId}
        validFrom={validFrom}
        validTo={validTo}
        pending={pending}
        label={label}
        onLabel={onLabel}
        onSaved={() => onDone(true)}
        onCancel={() => onDone(false)}
      />
    </section>
  )
}

/** "BOGA RASAA" as a starting name; the household corrects it in the field. */
export function tidy(name: string): string {
  return name.toLowerCase().replace(/(^|[\s(/-])(\p{L})/gu, (_, gap: string, letter: string) => gap + letter.toUpperCase())
}

function SearchPanel({ query, onChoose }: { query: string; onChoose: (candidate: Candidate) => void }) {
  const [result, action, searching] = useActionState<SearchResult | null, FormData>(searchPlace, null)
  const [chosen, setChosen] = useState<number | null>(null)
  useActionToast(result?.ok === false ? result : null, false)

  return (
    <div>
      <form action={action} role="search" className="flex gap-2">
        <label htmlFor="cari-tempat" className="sr-only">
          Nama tempat
        </label>
        <input
          id="cari-tempat"
          name="q"
          type="search"
          defaultValue={query}
          maxLength={100}
          autoComplete="off"
          className={CONTROL}
        />
        <button type="submit" aria-busy={searching} className={`${BUTTON_QUIET} shrink-0`}>
          {searching ? 'Mencari…' : 'Cari'}
        </button>
      </form>

      {result?.ok ? (
        <div className="mt-3">
          <p role="status" className="text-footnote text-ink-muted">
            {result.message} {result.detail}
          </p>
          {result.candidates.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {result.candidates.map((candidate, index) => (
                <li key={`${candidate.lat},${candidate.lng}`}>
                  <button
                    type="button"
                    aria-pressed={chosen === index}
                    onClick={() => {
                      setChosen(index)
                      onChoose(candidate)
                    }}
                    className={`w-full rounded-sm px-3 py-2 text-left transition-colors duration-150 ${chosen === index ? 'bg-accent-wash' : 'hover:bg-fill-quaternary'}`}
                  >
                    <span className="block text-subhead text-ink">{candidate.label}</span>
                    <span className="block text-footnote text-ink-muted line-clamp-2">{candidate.address}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

interface SaveProps {
  merchantKey: string
  locationId: string | null
  validFrom: string | null
  validTo: string | null
  pending: Pending | null
  label: string
  onLabel: (label: string) => void
  onSaved: () => void
  onCancel: () => void
}

function SaveForm({ merchantKey, locationId, validFrom, validTo, pending, label, onLabel, onSaved, onCancel }: SaveProps) {
  const [result, action, saving] = useActionState<ActionResult | null, FormData>(saveMerchantLocation, null)
  useActionToast(result, saving)

  useEffect(() => {
    if (result?.ok) onSaved()
  }, [result, onSaved])

  return (
    <form action={action} className="space-y-3 border-t border-line pt-4">
      <input type="hidden" name="merchantKey" value={merchantKey} />
      <input type="hidden" name="lat" value={pending ? pending.lat.toFixed(7) : ''} />
      <input type="hidden" name="lng" value={pending ? pending.lng.toFixed(7) : ''} />
      <input type="hidden" name="address" value={pending?.address ?? ''} />
      <input type="hidden" name="source" value={pending?.source ?? 'manual'} />
      {locationId ? <input type="hidden" name="id" value={locationId} /> : null}

      <div>
        <label htmlFor="nama-tempat" className="block text-subhead font-medium text-ink">
          Nama di peta
        </label>
        <input
          id="nama-tempat"
          name="label"
          value={label}
          onChange={(event) => onLabel(event.target.value)}
          required
          maxLength={120}
          className={`${CONTROL} mt-1`}
        />
      </div>

      {/*
        For a merchant whose place changed over time, such as electricity
        tokens for one house and later another. Left empty, the point holds
        for every date.
      */}
      <details open={Boolean(validFrom || validTo)} className="rounded-sm bg-fill-quaternary px-3">
        <summary className="flex min-h-11 cursor-pointer items-center text-subhead text-ink">
          Hanya untuk periode tertentu
        </summary>
        <div className="grid grid-cols-1 gap-3 pb-3 sm:grid-cols-2">
          <label>
            <span className="block text-footnote text-ink-muted">Berlaku dari</span>
            <input type="date" name="validFrom" defaultValue={validFrom ?? ''} className={CONTROL} />
          </label>
          <label>
            <span className="block text-footnote text-ink-muted">Sampai</span>
            <input type="date" name="validTo" defaultValue={validTo ?? ''} className={CONTROL} />
          </label>
        </div>
        <p className="pb-3 text-footnote text-ink-muted">
          Contoh: token listrik untuk rumah lama sampai Des 2025, lalu kos baru sejak Jun 2026. Transaksi di luar
          periode mana pun kembali ke antrean.
        </p>
      </details>

      <p className="text-footnote text-ink-muted" aria-live="polite">
        {pending
          ? `Titik: ${pending.lat.toFixed(5)}, ${pending.lng.toFixed(5)}${pending.address ? ` · ${pending.address}` : ' · dipilih di peta'}`
          : 'Belum ada titik. Pilih hasil pencarian atau klik di peta.'}
      </p>

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={!pending} aria-busy={saving} className={BUTTON_PRIMARY}>
          Simpan lokasi
        </button>
        <button type="button" onClick={onCancel} className={BUTTON_TINTED}>
          Batal
        </button>
      </div>
    </form>
  )
}
