'use client'

import type { LegendGroup } from './view-model'

/**
 * Which category group each dot belongs to, and a switch per group.
 *
 * The swatch alone would be a colour asked to carry a meaning, so every chip
 * prints its group's name and how many places carry it, and a switched-off
 * chip loses its fill as well as its colour. Switching only changes the map:
 * the Kategori filter above is the one that narrows every figure on the page.
 */

interface Props {
  groups: LegendGroup[]
  hidden: readonly string[]
  onToggle: (group: string) => void
  onShowAll: () => void
}

const CHIP =
  'inline-flex h-11 items-center gap-2 rounded-full border px-3 text-footnote transition-colors duration-150 sm:h-9'

export function GroupLegend({ groups, hidden, onToggle, onShowAll }: Props) {
  if (groups.length < 2) return null
  const off = new Set(hidden)

  return (
    <div className="space-y-2">
      <div role="group" aria-label="Kelompok kategori di peta" className="flex flex-wrap gap-2">
        {groups.map((group) => {
          const shown = !off.has(group.name)
          const swatch = `oklch(var(--category-l) var(--category-c) ${group.hue})`
          return (
            <button
              key={group.name}
              type="button"
              aria-pressed={shown}
              onClick={() => onToggle(group.name)}
              className={`${CHIP} ${shown ? 'border-line bg-surface text-ink' : 'border-dashed border-line bg-transparent text-ink-muted'}`}
            >
              <span
                aria-hidden="true"
                className="size-2.5 shrink-0 rounded-full border-2"
                style={{ borderColor: swatch, backgroundColor: shown ? swatch : 'transparent' }}
              />
              <span className={shown ? undefined : 'line-through decoration-ink-faint'}>{group.name}</span>
              <span className="tnum text-ink-faint">{group.places}</span>
            </button>
          )
        })}
      </div>
      <p className="flex flex-wrap items-center gap-x-3 text-footnote text-ink-muted">
        <span>Ketuk kelompok untuk menyembunyikannya dari peta. Daftar Tempat di bawah tetap lengkap.</span>
        {hidden.length > 0 ? (
          <button
            type="button"
            onClick={onShowAll}
            className="inline-flex min-h-11 items-center font-medium text-accent sm:min-h-9"
          >
            Tampilkan semua
          </button>
        ) : null}
      </p>
    </div>
  )
}
