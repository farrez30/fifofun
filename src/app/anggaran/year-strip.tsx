'use client'

import { useRef, useState, type KeyboardEvent } from 'react'
import Link from 'next/link'
import type { BudgetYearView, YearMonthView } from '@/lib/ledger/budget-year'

/**
 * Twelve months of keluar-versus-anggaran, one column each, ending at the
 * month being edited. The year-level question is "do our months hold the
 * line", and an aggregate strip answers it at a glance; per-category history
 * already lives on the dashboard's sparks, and the drill-down here is a link
 * to the month's own budget page.
 *
 * Interaction is the house hover-versus-pin radiogroup, copied from the
 * cashflow chart and the spark cards: hovering previews a month in the
 * readout, clicking or arrowing pins it, and only the pinned one carries
 * `aria-checked` — a pointer sweeping twelve columns must not announce
 * twelve selections. The alarm is triple-encoded as everywhere else: a month
 * past its budget is the over colour, visibly longer than its marker, and
 * says so in the readout and the sr table. A month with no budget is quiet
 * (nobody broke a plan that never existed) and a month with no data reads as
 * an absence, never as a zero.
 */

export function YearStrip({ view }: { view: BudgetYearView }) {
  const last = view.months[view.months.length - 1]?.month ?? null
  const [pinned, setPinned] = useState<string | null>(last)
  const [hovered, setHovered] = useState<string | null>(null)
  const columns = useRef(new Map<string, HTMLDivElement>())

  if (!view.hasAny) {
    return (
      <figure className="border border-line bg-surface p-6">
        <figcaption className="text-sm font-medium text-ink">Setahun ke belakang</figcaption>
        <p className="mt-2 text-sm text-ink-muted">
          Belum ada pengeluaran maupun anggaran di dua belas bulan ini, jadi belum ada yang bisa
          digambar. Strip ini terisi sendiri begitu bulan-bulannya punya catatan.
        </p>
      </figure>
    )
  }

  const active = hovered ?? pinned
  const selected =
    view.months.find((m) => m.month === active) ?? view.months[view.months.length - 1] ?? null

  function choose(month: string) {
    setPinned(month)
    columns.current.get(month)?.focus()
  }

  function onKey(event: KeyboardEvent<HTMLDivElement>, month: string) {
    const index = view.months.findIndex((m) => m.month === month)
    let next: number | null = null
    if (event.key === 'ArrowRight') next = Math.min(view.months.length - 1, index + 1)
    if (event.key === 'ArrowLeft') next = Math.max(0, index - 1)
    if (event.key === 'Home') next = 0
    if (event.key === 'End') next = view.months.length - 1
    if (next === null) return
    event.preventDefault()
    choose(view.months[next].month)
  }

  return (
    <figure className="border border-line bg-surface p-4">
      <figcaption className="text-sm font-medium text-ink">Setahun ke belakang</figcaption>

      <Readout month={selected ?? null} />

      {/*
        No gap between the columns: at 375px twelve gapped columns fall under
        the 24px touch floor. The whole column is the target and the visual
        breathing room is drawn INSIDE it, as an inset track — a finger gets
        the full twelfth, an eye still sees twelve bars.
      */}
      <div
        role="radiogroup"
        aria-label="Pengeluaran dua belas bulan terhadap anggarannya"
        className="mt-3 grid grid-cols-12"
        onPointerLeave={() => setHovered(null)}
      >
        {view.months.map((month) => {
          const chosen = month.month === pinned
          return (
            <div
              key={month.month}
              ref={(node) => {
                if (node) columns.current.set(month.month, node)
                else columns.current.delete(month.month)
              }}
              role="radio"
              aria-checked={chosen}
              tabIndex={chosen ? 0 : -1}
              aria-label={describe(month)}
              onPointerEnter={() => setHovered(month.month)}
              onClick={() => choose(month.month)}
              onKeyDown={(event) => onKey(event, month.month)}
              className="relative h-24 cursor-pointer"
            >
              <span
                aria-hidden="true"
                className={`absolute inset-y-0 left-px right-px block bg-sunken ${
                  chosen ? 'outline outline-1 outline-line-strong' : ''
                }`}
              >
                {month.hasData && month.outPct > 0 ? (
                  <span
                    data-year-out={month.month}
                    className={`absolute inset-x-0 bottom-0 block ${
                      month.over ? 'bg-over' : 'bg-accent'
                    }`}
                    style={{ height: `max(2px, ${month.outPct}%)` }}
                  />
                ) : null}
                {month.budgetPct !== null ? (
                  <span
                    data-year-budget={month.month}
                    className="absolute inset-x-0 h-0.5 bg-ink"
                    style={{ bottom: `${month.budgetPct}%` }}
                  />
                ) : null}
              </span>
            </div>
          )
        })}
      </div>

      <p className="mt-2 text-xs text-ink-muted">
        Garis hitamnya total anggaran bulan itu; bar yang melewatinya berarti bulannya jebol.
        Kolom kosong berarti belum ada catatan, bukan nol.
      </p>

      {/* Wrapped in a div: a bare sr-only table ignores the one pixel width it
          is given and would stretch the page sideways. */}
      <div className="sr-only">
        <table>
          <caption>Pengeluaran dua belas bulan terhadap anggarannya</caption>
          <thead>
            <tr>
              <th scope="col">Bulan</th>
              <th scope="col">Keluar</th>
              <th scope="col">Anggaran</th>
            </tr>
          </thead>
          <tbody>
            {view.months.map((month) => (
              <tr key={month.month}>
                <th scope="row">{month.label}</th>
                <td>{month.hasData ? month.outText : 'belum ada data'}</td>
                <td>
                  {month.budgetText ?? 'tidak dianggarkan'}
                  {month.over ? ' (lewat anggaran)' : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  )
}

function describe(month: YearMonthView): string {
  if (!month.hasData && month.budgetText === null) return `${month.label}: belum ada data`
  const out = month.hasData ? `keluar ${month.outText}` : 'belum ada data'
  const budget =
    month.budgetText === null
      ? 'tidak dianggarkan'
      : `anggaran ${month.budgetText}${month.over ? ', lewat' : ''}`
  return `${month.label}: ${out}, ${budget}`
}

function Readout({ month }: { month: YearMonthView | null }) {
  if (!month) return null

  return (
    <p className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
      <span className="font-medium text-ink">{month.label}</span>
      {month.hasData ? (
        <span className="text-ink-muted">
          keluar <span className="tnum font-mono text-ink">{month.outText}</span>
        </span>
      ) : (
        <span className="text-ink-faint">belum ada data</span>
      )}
      {month.budgetText !== null ? (
        <span className="text-ink-muted">
          anggaran <span className="tnum font-mono text-ink">{month.budgetText}</span>
          {month.over ? (
            <>
              {' '}
              <span aria-hidden="true" className="text-over">
                ▲
              </span>
              <span className="sr-only"> lewat anggaran</span>
            </>
          ) : null}
        </span>
      ) : month.hasData ? (
        <span className="text-ink-faint">tidak dianggarkan</span>
      ) : null}
      <Link
        href={`/anggaran?bulan=${month.month}`}
        className="inline-flex min-h-11 items-center text-accent underline underline-offset-2"
      >
        Buka anggarannya
      </Link>
    </p>
  )
}
