'use client'

import { useRef, useState, type KeyboardEvent } from 'react'
import { MonthDetailPanel } from '@/components/month-detail'
import type { MonthDetail } from '@/lib/ledger/month-detail'

/**
 * The interactive half of the income and spending chart.
 *
 * Every figure arrives already computed: a percentage of the plot and a string
 * to print. Money is `bigint` sen everywhere in this app and React cannot send a
 * `bigint` from a server component to a client one, so the arithmetic stays on
 * the server where the exact type lives and only ratios cross the boundary. No
 * amount is ever added up on this side of the line.
 *
 * Two views of the same twelve numbers. Side by side answers "how much came in
 * and how much went out"; the difference view answers "did the month gain or
 * lose", which is the question the first view makes the reader work out for
 * themselves by measuring two bars against each other.
 */

export interface Band {
  /** Height as a percentage of the plot. */
  pct: number
  /** Already formatted, e.g. "Rp8,1jt". */
  text: string
}

export interface MonthView {
  month: string
  /** Short month name, e.g. "Agu". */
  label: string
  /** Two digit year, shown only where the year turns over. */
  year: string
  startsYear: boolean
  income: Band
  spending: Band
  net: Band
  netNegative: boolean
  overspent: boolean
}

export interface Tick {
  pct: number
  text: string
}

interface Props {
  months: MonthView[]
  /** Gridlines for the side by side view, on the scale of the gross figures. */
  ticks: Tick[]
  /**
   * Gridlines for the difference view, which is an order of magnitude smaller.
   * Two views on one axis would have put a Rp25 juta label beside a Rp3 juta
   * bar, which is the same defect as a chart whose picture disagrees with its
   * own number.
   */
  netTicks: Tick[]
  /** Where the typical month sits, as a percentage of the plot. */
  medianIncome: Band
  medianSpending: Band
  /** True when at least one month lost money, so the difference view needs a zero line. */
  hasDeficit: boolean
  caption: string
  /**
   * One per month, already formatted. The chart says which month lost money;
   * this is what the month was made of, and it is why the selection is now two
   * things rather than one: pointing at a month reads its figures, choosing a
   * month keeps its breakdown open underneath.
   */
  details?: MonthDetail[]
}

type Mode = 'side' | 'net'

interface Gridline {
  key: string
  /** Distance from the floor of the plot, as a percentage. */
  bottom: number
  text: string
  zero: boolean
}

/**
 * Where every gridline goes, computed once and used by both the axis and the
 * plot so the two cannot drift apart.
 *
 * When the plot is split around zero, the same ticks appear twice: once rising
 * from the middle and once falling from it, each compressed into half the
 * height. The zero line is drawn stronger, because it is the only line in the
 * picture that a bar crossing means something.
 */
function gridlines(ticks: Tick[], split: boolean): Gridline[] {
  if (!split) {
    return ticks.map((tick) => ({
      key: `up-${tick.text}`,
      bottom: tick.pct,
      text: tick.text,
      zero: tick.pct === 0,
    }))
  }

  const up = ticks.map((tick) => ({
    key: `up-${tick.text}`,
    bottom: 50 + tick.pct / 2,
    text: tick.text,
    zero: tick.pct === 0,
  }))

  const down = ticks
    .filter((tick) => tick.pct > 0)
    .map((tick) => ({
      key: `down-${tick.text}`,
      bottom: 50 - tick.pct / 2,
      text: `−${tick.text}`,
      zero: false,
    }))

  return [...down, ...up]
}

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: 'side', label: 'Berdampingan', hint: 'Masuk dan keluar sebagai dua batang' },
  { id: 'net', label: 'Selisih', hint: 'Satu batang, naik kalau untung dan turun kalau tekor' },
]

export function CashflowChartView({
  months,
  ticks,
  netTicks,
  medianIncome,
  medianSpending,
  hasDeficit,
  caption,
  details = [],
}: Props) {
  const [mode, setMode] = useState<Mode>('side')
  // The most recent month, because that is the one a reader arrives asking
  // about, and because a readout that starts empty shifts the layout when it
  // fills.
  const [pinned, setPinned] = useState(months[months.length - 1]?.month ?? '')
  // Pointing at a month reads it; the detail below stays where it was put.
  // Without the distinction, dragging the pointer across the plot would swap
  // two tables under the reader's hand.
  const [hovered, setHovered] = useState<string | null>(null)
  const columns = useRef(new Map<string, HTMLDivElement>())

  const selected = hovered ?? pinned
  const active = months.find((month) => month.month === selected) ?? months[months.length - 1]
  const detail = details.find((candidate) => candidate.month === pinned)

  function choose(month: string) {
    setPinned(month)
    // Focus follows the choice, or a keyboard reader would hear one month and
    // be looking at another.
    columns.current.get(month)?.focus()
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0
    if (step === 0 && event.key !== 'Home' && event.key !== 'End') return
    event.preventDefault()

    const index = months.findIndex((month) => month.month === pinned)
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? months.length - 1
          : Math.min(months.length - 1, Math.max(0, index + step))
    choose(months[next].month)
  }

  // In the difference view a losing month has to be drawn below the line, so
  // the plot is split in two when any month lost and anchored to the floor
  // otherwise, rather than wasting half the height on an empty basement.
  const split = mode === 'net' && hasDeficit
  // Each view reads its own axis, so the labels always belong to the bars.
  const axis = mode === 'net' ? netTicks : ticks

  return (
    <figure className="border border-line bg-surface p-4">
      <figcaption className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm font-medium text-ink">{caption}</span>

        <div role="radiogroup" aria-label="Cara membaca grafik" className="flex border border-line">
          {MODES.map((option) => (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={mode === option.id}
              title={option.hint}
              onClick={() => setMode(option.id)}
              className={`px-2.5 py-1 text-xs transition-colors duration-150 ${
                mode === option.id
                  ? 'bg-accent text-paper'
                  : 'bg-surface text-ink-muted hover:text-ink'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </figcaption>

      {/* The readout, above the plot: whichever month is selected, in full. */}
      {active ? (
        <dl className="mb-3 flex flex-wrap items-baseline gap-x-6 gap-y-1 border-b border-line pb-3">
          <div className="flex items-baseline gap-2">
            <dt className="text-xs uppercase tracking-wide text-ink-faint">Bulan</dt>
            <dd className="tnum font-mono text-sm font-medium text-ink">{active.month}</dd>
          </div>
          <div className="flex items-baseline gap-2">
            <dt className="text-xs uppercase tracking-wide text-ink-faint">Masuk</dt>
            <dd className="tnum font-mono text-sm text-under">{active.income.text}</dd>
          </div>
          <div className="flex items-baseline gap-2">
            <dt className="text-xs uppercase tracking-wide text-ink-faint">Keluar</dt>
            <dd className="tnum font-mono text-sm text-ink">{active.spending.text}</dd>
          </div>
          <div className="flex items-baseline gap-2">
            <dt className="text-xs uppercase tracking-wide text-ink-faint">Selisih</dt>
            <dd
              className={`tnum font-mono text-sm font-medium ${
                active.netNegative ? 'text-over' : 'text-under'
              }`}
            >
              <span aria-hidden="true">{active.netNegative ? '▼ ' : '▲ '}</span>
              {active.net.text}
            </dd>
          </div>
        </dl>
      ) : null}

      <div className="flex gap-2">
        {/* The axis, outside the scroll region so the numbers stay put while
            twenty three months slide past them. */}
        <div className="relative w-14 shrink-0" style={{ height: '13rem' }} aria-hidden="true">
          {gridlines(axis, split).map((line) => (
            <span
              key={line.key}
              className="tnum absolute right-0 -translate-y-1/2 font-mono text-[0.625rem] text-ink-faint"
              style={{ bottom: `${line.bottom}%` }}
            >
              {line.text}
            </span>
          ))}
        </div>

        <div
          className="relative min-w-0 flex-1 overflow-x-auto"
          tabIndex={0}
          role="region"
          aria-label={`${caption}, bisa digeser ke samping`}
        >
          <div className="relative" style={{ height: '13rem' }}>
            {/* Gridlines behind the bars, drawn once for the whole plot. */}
            <div aria-hidden="true" className="pointer-events-none absolute inset-0">
              {gridlines(axis, split).map((line) => (
                <span
                  key={line.key}
                  className={`absolute inset-x-0 border-t ${
                    line.zero ? 'border-line-strong' : 'border-line'
                  }`}
                  style={{ bottom: `${line.bottom}%` }}
                />
              ))}

              {/* Where a typical month sits. A bar means little until you know
                  whether it is high or low for this household. */}
              {mode === 'side' ? (
                <>
                  <span
                    className="absolute inset-x-0 border-t border-dashed border-under/70"
                    style={{ bottom: `${medianIncome.pct}%` }}
                  />
                  <span
                    className="absolute inset-x-0 border-t border-dashed border-accent/70"
                    style={{ bottom: `${medianSpending.pct}%` }}
                  />
                </>
              ) : null}

            </div>

            <div
              role="radiogroup"
              aria-label="Pilih bulan"
              onKeyDown={onKeyDown}
              onMouseLeave={() => setHovered(null)}
              className="relative flex h-full min-w-full gap-1"
            >
              {months.map((month) => {
                const chosen = month.month === pinned
                const pointed = month.month === hovered
                return (
                  <div
                    key={month.month}
                    ref={(node) => {
                      if (node) columns.current.set(month.month, node)
                      else columns.current.delete(month.month)
                    }}
                    role="radio"
                    aria-checked={chosen}
                    aria-label={`${month.month}, masuk ${month.income.text}, keluar ${month.spending.text}, ${
                      month.netNegative ? 'kurang' : 'lebih'
                    } ${month.net.text}`}
                    tabIndex={chosen ? 0 : -1}
                    onMouseEnter={() => setHovered(month.month)}
                    onFocus={() => choose(month.month)}
                    onClick={() => choose(month.month)}
                    className={`flex min-w-9 flex-1 cursor-pointer flex-col items-center gap-1 ${
                      chosen ? 'bg-accent-wash' : pointed ? 'bg-sunken' : ''
                    }`}
                  >
                    <div className="flex min-h-0 w-full flex-1 items-end justify-center gap-0.5">
                      {mode === 'side' ? (
                        <>
                          <Bar pct={month.income.pct} fill="bg-under" width="w-1/2" series="masuk" />
                          <Bar
                            pct={month.spending.pct}
                            fill={month.overspent ? 'bg-over' : 'bg-accent'}
                            width="w-1/2"
                            series="keluar"
                          />
                        </>
                      ) : (
                        <Bar
                          pct={month.net.pct}
                          fill={month.netNegative ? 'bg-over' : 'bg-under'}
                          width="w-3/5"
                          series="selisih"
                          split={split}
                          below={month.netNegative}
                        />
                      )}
                    </div>

                    <span
                      className={`text-[0.625rem] leading-none tabular-nums ${
                        chosen ? 'font-medium text-ink' : 'text-ink-faint'
                      }`}
                    >
                      {month.label}
                    </span>
                    <span className="tnum text-[0.5625rem] leading-none text-ink-faint">
                      {month.startsYear ? month.year : ' '}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
        {mode === 'side' ? (
          <>
            <Key className="bg-under" label="Masuk" />
            <Key className="bg-accent" label="Keluar" />
            <Key className="bg-over" label="Keluar melebihi masuk" />
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true" className="inline-block h-0 w-4 border-t border-dashed border-under" />
              Bulan biasanya: masuk {medianIncome.text}, keluar {medianSpending.text}
            </span>
          </>
        ) : (
          <>
            <Key className="bg-under" label="Bulan yang menyisakan uang" />
            <Key className="bg-over" label="Bulan yang tekor" />
          </>
        )}
      </p>

      <p className="mt-1 text-xs text-ink-faint">
        {details.length > 0
          ? 'Arahkan kursor untuk membaca angkanya. Klik atau tekan Enter pada sebuah bulan untuk menyematkan rinciannya di bawah grafik.'
          : 'Arahkan kursor atau pakai tombol panah untuk membaca bulan tertentu.'}
      </p>

      {detail ? <MonthDetailPanel detail={detail} /> : null}

      {/*
        Wrapped rather than marked directly. A table ignores the one pixel width
        that sr-only sets and lays itself out to fit its content, so the hidden
        table stretched the document and every narrow screen scrolled sideways
        for text nobody can see. A div honours the width and clips it.
      */}
      <div className="sr-only">
        <table>
          <caption>{caption}</caption>
          <thead>
            <tr>
              <th scope="col">Bulan</th>
              <th scope="col">Masuk</th>
              <th scope="col">Keluar</th>
              <th scope="col">Selisih</th>
            </tr>
          </thead>
          <tbody>
            {months.map((month) => (
              <tr key={month.month}>
                <th scope="row">{month.month}</th>
                <td>{month.income.text}</td>
                <td>{month.spending.text}</td>
                {/* The sign, in words. The bar carries it as a direction and a
                    colour, neither of which reaches somebody listening, and
                    without it a surplus and a shortfall read identically. */}
                <td>
                  {month.netNegative ? 'kurang ' : 'lebih '}
                  {month.net.text}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  )
}

/**
 * One bar: from the floor in the ordinary view, from the middle line up or down
 * in the split one. Fill and width are separate props rather than one class
 * string, because the split branch needs the width on the track and the fill on
 * the bar, and pulling one back out of the other by string replacement broke
 * silently the moment a width changed.
 */
function Bar({
  pct,
  fill,
  width,
  series,
  split = false,
  below = false,
}: {
  pct: number
  fill: string
  width: string
  /**
   * Names the bar for the browser tests. A deliberate seam: the check that no
   * bar renders zero pixels tall is the only thing standing between this chart
   * and the day it silently draws nothing again, and it needs a way to find the
   * bars that does not depend on a class name or a child index.
   */
  series: 'masuk' | 'keluar' | 'selisih'
  split?: boolean
  below?: boolean
}) {
  // A tenth of a percent still gets a visible sliver, because a month that
  // spent almost nothing did not spend nothing.
  const height = Math.max(1, Math.abs(pct))

  if (!split) {
    return (
      <div data-series={series} className={`${width} ${fill}`} style={{ height: `${height}%` }} />
    )
  }

  // Half the height, because the split plot gives each direction half the room.
  return (
    <div className={`relative h-full ${width}`}>
      <div
        data-series={series}
        className={`absolute inset-x-0 ${fill}`}
        style={
          below
            ? { top: '50%', height: `${height / 2}%` }
            : { bottom: '50%', height: `${height / 2}%` }
        }
      />
    </div>
  )
}

function Key({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span aria-hidden="true" className={`inline-block h-2.5 w-2.5 ${className}`} />
      {label}
    </span>
  )
}
