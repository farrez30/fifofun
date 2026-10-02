'use client'

import { useState } from 'react'
import { PlaceMap } from './place-map'
import { PlacingPanel, tidy, type Pending } from './placing-panel'
import type { PlacePoint, WaitingMerchant } from './view-model'
import { WaitingList } from './waiting-list'

/**
 * The map and everything that puts a merchant on it.
 *
 * One island because the pieces share one decision, which merchant is being
 * placed: the list picks it, the map takes a click for it, the search offers
 * points for it, and the save writes it. Everything that only reads (the
 * stats, the table) stays on the server and arrives as `children`.
 */

interface Props {
  points: PlacePoint[]
  waiting: WaitingMerchant[]
  /** From a "Pindahkan" link: start with this merchant being placed. */
  initial: string | null
  /** Rendered between the map and the waiting list: the server's table of places. */
  children?: React.ReactNode
}

interface Placing {
  key: string
  query: string
}

export function PlaceWorkspace({ points, waiting, initial, children }: Props) {
  const find = (key: string): Placing | null => {
    const label =
      points.find((point) => point.key === key)?.label ?? waiting.find((merchant) => merchant.key === key)?.label
    return label ? { key, query: label } : null
  }
  const nameFor = (next: Placing) => points.find((point) => point.key === next.key)?.label ?? tidy(next.query)

  const [placing, setPlacing] = useState<Placing | null>(() => (initial ? find(initial) : null))
  const [pending, setPending] = useState<Pending | null>(null)
  const [label, setLabel] = useState(() => (placing ? nameFor(placing) : ''))

  const start = (key: string) => {
    const next = find(key)
    if (!next) return
    setPlacing(next)
    setPending(null)
    setLabel(nameFor(next))
  }

  /*
    Focus goes back where the person came from: the row's Taruh after a
    cancel, the list's heading after a save, since a saved row leaves the list.
  */
  const done = (saved: boolean) => {
    const key = placing?.key
    setPlacing(null)
    setPending(null)
    requestAnimationFrame(() => {
      const row = !saved && key ? document.querySelector<HTMLElement>(`[data-place-key="${CSS.escape(key)}"]`) : null
      ;(row ?? document.getElementById('belum-berlokasi'))?.focus()
    })
  }

  return (
    <div className="space-y-6">
      {/*
        While placing, the map and the panel have to be on screen together:
        the panel asks for a click on the map. Side by side where there is
        room, the panel first on a phone.
      */}
      <div className={placing ? 'grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start' : undefined}>
        <PlaceMap
          points={points}
          placing={placing !== null}
          draft={pending}
          onPick={(draft) => setPending({ ...draft, address: null, source: 'manual' })}
          onMove={start}
        />

        {placing ? (
          <div className="order-first lg:sticky lg:top-4 lg:order-none">
            <PlacingPanel
              merchantKey={placing.key}
              query={placing.query}
              pending={pending}
              label={label}
              onLabel={setLabel}
              onChoose={(candidate) => {
                setPending({ lat: candidate.lat, lng: candidate.lng, address: candidate.address, source: 'osm' })
                setLabel(candidate.label)
              }}
              onDone={done}
            />
          </div>
        ) : null}
      </div>

      {children}

      <WaitingList waiting={waiting} placing={placing?.key ?? null} onPlace={start} />
    </div>
  )
}
