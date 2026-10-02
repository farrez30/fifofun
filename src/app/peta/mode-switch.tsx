'use client'

import { useSearchParams } from 'next/navigation'
import { SEGMENT, SEGMENTED, SEGMENT_ON } from '@/components/field-base'
import type { PlaceMode } from '@/lib/ledger/places'
import { MODES, modeHref, modeOf } from './filter'
import { topPlaces, type PlacePoint } from './view-model'

/**
 * How the map weighs a place, switched in the browser.
 *
 * The reading only changes how big a dot is and how bright the glow is, and
 * every point already carries its weight under all three, so a switch needs
 * nothing from the server. It used to be three links: each click rendered the
 * whole page again (every transaction, every place), scrolled back to the top
 * and showed nothing until it came back.
 *
 * The reading still lives in the address bar, through `history.pushState`,
 * which Next.js folds into `useSearchParams` without a request. So a view can
 * still be bookmarked, and Back still undoes a switch the way it undid a link.
 */

/** The reading the address bar names. */
export function useMapMode(): PlaceMode {
  return modeOf(useSearchParams().get('mode'))
}

/** How a place reads under a reading: its money, its visits, or one visit's cost. */
function figure(point: PlacePoint, mode: PlaceMode): string {
  if (mode === 'visits') return `${point.visits}×`
  return mode === 'average' ? point.average : point.total
}

export function ModeSwitch({ mode, points }: { mode: PlaceMode; points: readonly PlacePoint[] }) {
  const choose = (next: PlaceMode) => {
    if (next === mode) return
    window.history.pushState(null, '', modeHref(location.search, location.hash, next))
  }
  const option = MODES.find((candidate) => candidate.value === mode)
  const legend = option?.legend
  const top = topPlaces(points, mode)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="peta-heading" className="text-subhead font-medium text-ink">
          Peta
        </h2>
        <div role="radiogroup" aria-label="Cara menimbang" className={SEGMENTED}>
          {MODES.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={mode === option.value}
              onClick={() => choose(option.value)}
              className={`${SEGMENT} ${mode === option.value ? SEGMENT_ON : ''}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-footnote text-ink-muted">
        <span
          aria-hidden="true"
          className="h-2 w-16 rounded-full bg-[linear-gradient(to_right,color-mix(in_oklch,var(--color-ink)_15%,transparent),var(--color-ink-muted),var(--color-ink))]"
        />
        <span>
          Makin pekat dan makin besar titiknya, makin banyak {legend}. Warna titik menurut kelompok kategorinya.
        </span>
      </p>
      {top.length > 0 ? (
        // Spoken on change, so a switch says what it did and not only that it happened.
        <p aria-live="polite" className="text-subhead text-ink-muted">
          <span className="text-ink">Teratas menurut {option?.label.toLowerCase()}:</span>{' '}
          {top.map((point, index) => (
            <span key={point.pointId}>
              {index > 0 ? ' · ' : ''}
              {point.label} <span className="tnum font-mono text-ink">{figure(point, mode)}</span>
            </span>
          ))}
        </p>
      ) : null}
    </div>
  )
}

/** The filter form's carrier for the reading, current even after a switch the server never saw. */
export function ModeField() {
  const param = useSearchParams().get('mode')
  return param && modeOf(param) !== 'total' ? <input type="hidden" name="mode" value={param} /> : null
}
