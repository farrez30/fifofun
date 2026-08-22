'use client'

import { useRef, useState, type KeyboardEvent } from 'react'

/**
 * One category's run of months, readable a month at a time.
 *
 * The bars carried a `title` attribute, which is a tooltip a mouse can find
 * after a second of hovering and a phone and a keyboard cannot find at all. So
 * every month is a radio in a group, the way the cashflow chart already does
 * it, and the figure for whichever month is pointed at or focused is printed
 * above the bars where it does not depend on hovering to exist.
 *
 * Everything arrives formatted: the heights are percentages and the amounts
 * are strings, because money is bigint on the server.
 */

export interface SparkPoint {
  month: string
  label: string
  /** Height as a percentage of this card's own peak. */
  pct: number
  amount: string
  /** How this month compares with the usual, or null when there is no usual. */
  share: number | null
  latest: boolean
}

export interface SparkView {
  category: string
  latestAmount: string
  usualPct: number | null
  points: SparkPoint[]
  /** Movement wording and glyph, decided on the server. */
  glyph: string | null
  tone: string
  words: string
  /** Which fill the last bar takes, since a surge is drawn differently. */
  latestFill: string
}

export function SparkCard({ view }: { view: SparkView }) {
  const [pinned, setPinned] = useState(view.points[view.points.length - 1]?.month ?? '')
  /*
    What the pointer is over, which is a different question from what is
    selected. Reading a month and choosing one used to be the same action, so
    `aria-checked` moved under the pointer and the live region announced months
    nobody had decided anything about.
  */
  const [hovered, setHovered] = useState<string | null>(null)
  const bars = useRef(new Map<string, HTMLDivElement>())

  const shown = hovered ?? pinned
  const active = view.points.find((point) => point.month === shown) ?? view.points[0]

  function choose(month: string) {
    setPinned(month)
    bars.current.get(month)?.focus()
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0
    if (step === 0 && event.key !== 'Home' && event.key !== 'End') return
    event.preventDefault()

    const index = view.points.findIndex((point) => point.month === pinned)
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? view.points.length - 1
          : Math.min(view.points.length - 1, Math.max(0, index + step))
    choose(view.points[next].month)
  }

  return (
    <li className="border border-line bg-sunken p-3">
      <p className="truncate text-sm text-ink" title={view.category}>
        {view.category}
      </p>
      <p className="tnum mt-0.5 font-mono text-sm text-ink">{view.latestAmount}</p>

      {/* `role="status"` is already a polite live region; saying it twice is
          how a reader ends up hearing it twice. */}
      <p className="tnum mt-1 text-xs text-ink-muted" role="status">
        {active ? (
          <>
            {active.label} · {active.amount}
            {active.share === null
              ? ' · belum ada patokan'
              : ` · ${active.share}% dari biasanya`}
          </>
        ) : null}
      </p>

      {/*
        The row has a height of its own and each column stretches to fill it,
        which is what gives the percentage inside something to resolve against.
        Sized to their content instead, the columns collapse and every bar in
        the app draws zero pixels tall while still type checking.
      */}
      <div
        role="radiogroup"
        aria-label={`Bulan untuk ${view.category}`}
        onKeyDown={onKeyDown}
        className="relative mt-2 flex h-12 gap-px"
        data-spark={view.category}
      >
        {view.usualPct === null ? null : (
          <div
            aria-hidden="true"
            className="absolute inset-x-0 border-t border-dashed border-ink-faint"
            style={{ bottom: `${view.usualPct}%` }}
          />
        )}

        {view.points.map((point) => {
          const chosen = point.month === pinned
          return (
            <div
              key={point.month}
              ref={(node) => {
                if (node) bars.current.set(point.month, node)
                else bars.current.delete(point.month)
              }}
              role="radio"
              aria-checked={chosen}
              aria-label={`${point.label}, ${point.amount}`}
              tabIndex={chosen ? 0 : -1}
              /*
                Hovering reads a month; choosing one selects it. They were the
                same action, so `aria-checked` moved under the pointer without
                anybody deciding anything, and eight cards on a screen made a
                pointer sweep announce eight selections.
              */
              onMouseEnter={() => setHovered(point.month)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setPinned(point.month)}
              onClick={() => choose(point.month)}
              className={`flex flex-1 cursor-pointer flex-col justify-end ${
                chosen ? 'bg-accent-wash' : ''
              }`}
            >
              <div
                data-month={point.month}
                className={point.latest ? view.latestFill : 'bg-line-strong'}
                // A month that really spent nothing gets nothing. Everything
                // else keeps a hairline, so a quiet month and an empty one do
                // not look the same.
                style={{ height: point.pct === 0 ? '0' : `max(1px, ${point.pct}%)` }}
              />
            </div>
          )
        })}
      </div>

      <p className={`mt-1.5 text-xs ${view.tone}`}>
        {view.glyph ? (
          <span aria-hidden="true" className="mr-1">
            {view.glyph}
          </span>
        ) : null}
        <span className="text-ink-muted">{view.words}</span>
      </p>
    </li>
  )
}
