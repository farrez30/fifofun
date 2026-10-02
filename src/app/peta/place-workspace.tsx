'use client'

import { useState } from 'react'
import { PlaceMap } from './place-map'
import { PlacingPanel, tidy, type Pending } from './placing-panel'
import { QueueCard } from './queue-card'
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
  /** And the stored point that link moves, if the merchant has several. */
  initialPoint: string | null
  /** Whole percent of the chosen spending already on the map, for the queue. */
  mapped: number
  /** The map's heading, reading modes and legend: drawn by the server, placed under the queue. */
  header: React.ReactNode
  /** Rendered between the map and the waiting list: the server's table of places. */
  children?: React.ReactNode
}

interface Placing {
  key: string
  query: string
  /** The stored point being moved, with its period. */
  point: PlacePoint | null
}

export function PlaceWorkspace({ points, waiting, initial, initialPoint, mapped, header, children }: Props) {
  const find = (key: string, pointId?: string | null): Placing | null => {
    const point = pointId ? (points.find((candidate) => candidate.pointId === pointId || candidate.id === pointId) ?? null) : null
    // From the waiting list, a merchant that already has points is placed afresh, for the dates it is missing.
    const label = point?.label ?? waiting.find((merchant) => merchant.key === key)?.label ?? points.find((p) => p.key === key)?.label
    return label ? { key, query: label, point } : null
  }
  const nameFor = (next: Placing) => next.point?.label ?? tidy(next.query)

  const [placing, setPlacing] = useState<Placing | null>(() => (initial ? find(initial, initialPoint) : null))
  const [pending, setPending] = useState<Pending | null>(null)
  const [label, setLabel] = useState(() => (placing ? nameFor(placing) : ''))
  // Skipped for this visit only: a skip is "not now", not a decision worth storing.
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(() => new Set())
  const next = waiting.find((merchant) => !skipped.has(merchant.key)) ?? null

  const start = (key: string, pointId?: string | null) => {
    const next = find(key, pointId)
    if (!next) return
    setPlacing(next)
    setPending(null)
    setLabel(nameFor(next))
  }

  /*
    Focus goes back where the person came from: the row's Taruh after a
    cancel, and "Taruh berikutnya" after a save, so the queue can be walked
    with Enter alone; the saved row itself leaves the list.
  */
  const done = (saved: boolean) => {
    const key = placing?.key
    setPlacing(null)
    setPending(null)
    requestAnimationFrame(() => {
      const row = !saved && key ? document.querySelector<HTMLElement>(`[data-place-key="${CSS.escape(key)}"]`) : null
      const queue = document.getElementById('taruh-berikutnya')
      ;(row ?? queue ?? document.getElementById('belum-berlokasi'))?.focus()
    })
  }

  const skip = (key: string) => {
    setSkipped((before) => new Set([...before, key]))
    if (placing?.key === key) done(false)
  }

  return (
    <div className="space-y-6">
      <QueueCard
        next={next}
        remaining={waiting.length}
        mapped={mapped}
        placing={placing?.key ?? null}
        onPlace={start}
        onSkip={skip}
      />

      {header}

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
          onMove={(pointId) => {
            const point = points.find((candidate) => candidate.pointId === pointId)
            if (point) start(point.key, pointId)
          }}
        />

        {placing ? (
          <div className="order-first lg:sticky lg:top-4 lg:order-none">
            <PlacingPanel
              merchantKey={placing.key}
              locationId={placing.point?.id ?? null}
              validFrom={placing.point?.validFrom ?? null}
              validTo={placing.point?.validTo ?? null}
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
