'use client'

import { BUTTON_PLAIN, BUTTON_PRIMARY } from '@/components/field-base'
import type { WaitingMerchant } from './view-model'
import { PlacelessButton } from './waiting-list'

/**
 * The next merchant to place, at the top of the page.
 *
 * With a few percent of spending on the map, placing is the job this page is
 * for, and the map is what it pays back. So the queue leads: one merchant at a
 * time, biggest first, with the three answers a person can give. After a save
 * focus lands back on "Taruh berikutnya", so the queue can be walked with
 * Enter alone.
 */

interface Props {
  next: WaitingMerchant | null
  /** Merchants still waiting, the skipped ones included. */
  remaining: number
  /** Whole percent of the chosen spending already on the map. */
  mapped: number
  /** The merchant being placed right now, if any. */
  placing: string | null
  onPlace: (key: string) => void
  onSkip: (key: string) => void
}

export function QueueCard({ next, remaining, mapped, placing, onPlace, onSkip }: Props) {
  if (remaining === 0) {
    return (
      <section aria-labelledby="antrean" className="squircle rounded-md bg-surface p-4 shadow-xs">
        <h2 id="antrean" className="text-subhead font-medium text-ink">
          Semua pedagang di pilihan ini sudah punya tempat
        </h2>
        <p className="mt-1 text-subhead text-ink-muted">{mapped}% dari belanjanya tergambar di peta.</p>
      </section>
    )
  }

  return (
    <section aria-labelledby="antrean" className="squircle rounded-md bg-surface p-4 shadow-xs">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="antrean" className="text-subhead font-medium text-ink">
          Antrean menaruh
        </h2>
        <p className="text-footnote text-ink-muted">
          <span className="tnum font-mono text-ink">{mapped}%</span> tergambar ·{' '}
          <span className="tnum font-mono text-ink">{remaining}</span> menunggu
        </p>
      </div>

      {/* A thin bar of the same share, so progress reads at a glance. */}
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-fill-tertiary"
        role="progressbar"
        aria-label="Belanja yang sudah tergambar di peta"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={mapped}
      >
        <div className="h-full rounded-full bg-accent" style={{ width: `${mapped}%` }} />
      </div>

      {next ? (
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="min-w-48 flex-1">
            <p className="text-footnote text-ink-muted">Berikutnya, terbesar dulu</p>
            <p className="truncate text-subhead text-ink">{next.label}</p>
            <p className="text-footnote text-ink-muted">
              <span className="tnum font-mono">{next.total}</span> · {next.visits} kali · terakhir {next.last}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-1">
            <button
              id="taruh-berikutnya"
              type="button"
              onClick={() => onPlace(next.key)}
              disabled={placing === next.key}
              className={BUTTON_PRIMARY}
            >
              {placing === next.key ? 'Sedang menaruh' : 'Taruh berikutnya'}
            </button>
            <PlacelessButton merchantKey={next.key} label={next.label} />
            <button type="button" onClick={() => onSkip(next.key)} className={BUTTON_PLAIN}>
              Lewati
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-subhead text-ink-muted">
          Semua yang tersisa sudah dilewati. Daftar lengkapnya ada di bawah peta.
        </p>
      )}
    </section>
  )
}
