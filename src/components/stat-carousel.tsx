'use client'

import { Children, useRef, useState } from 'react'

/**
 * The dashboard's stat cards: a grid from `sm` up, a swipeable deck under it.
 *
 * Four cards stacked vertically cost a phone its whole first screen before a
 * single chart appeared. Native scroll-snap does the sliding — no pointer
 * math, no library — and an 85% slide leaves the next card peeking, which is
 * the whole affordance: a peek says "swipe me" where a full-bleed card says
 * nothing.
 *
 * Two lessons inherited from the sibling project's carousel, both measured:
 * never `behavior: 'smooth'` inside a snap-mandatory container (mid-animation
 * the browser re-snaps to the CURRENT point and the deck never leaves slide
 * one), and never derive the dots from scroll events alone (a programmatic
 * scroll does not reliably fire one). So the arrows scroll with `auto` — which
 * also settles reduced-motion — and the dots render from state that `onScroll`
 * reconciles after a real swipe.
 *
 * The container is a genuine sideways scroller, so `pannableAncestor` already
 * refuses the tab swipe over it with no new wiring; the `bisa digeser` label
 * is the same convention the tables use, which is also what the phone suite's
 * overflow allowlist matches. It checks width, not position, so the deck at
 * either end still owns the gesture and `overscroll-x-contain` stops the
 * chain into the browser's history swipe.
 *
 * Children pass through server-rendered — the bigints inside `Stat` never
 * cross into client props.
 */

/** Which slide the scroll position amounts to, clamped to real slides. */
export function slideIndex(scrollLeft: number, slideWidth: number, count: number): number {
  if (slideWidth <= 0 || count <= 0) return 0
  return Math.max(0, Math.min(count - 1, Math.round(scrollLeft / slideWidth)))
}

export function StatCarousel({ children }: { children: React.ReactNode }) {
  const deckRef = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(0)
  const count = Children.count(children)

  function slideTo(next: number) {
    const deck = deckRef.current
    if (!deck) return
    const width = deck.firstElementChild instanceof HTMLElement
      ? deck.firstElementChild.offsetWidth
      : deck.clientWidth
    const clamped = Math.max(0, Math.min(count - 1, next))
    deck.scrollTo({ left: clamped * width, behavior: 'auto' })
    setIndex(clamped)
  }

  return (
    <div>
      <div
        ref={deckRef}
        role="region"
        aria-label="Ringkasan bulan, bisa digeser ke samping"
        tabIndex={0}
        onScroll={(event) => {
          const deck = event.currentTarget
          const width = deck.firstElementChild instanceof HTMLElement
            ? deck.firstElementChild.offsetWidth
            : deck.clientWidth
          setIndex(slideIndex(deck.scrollLeft, width, count))
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowRight') slideTo(index + 1)
          if (event.key === 'ArrowLeft') slideTo(index - 1)
        }}
        /* Scrollbar hidden: the dots below are the position indicator, and a
           bar plus dots says the same thing twice. From `sm` up this is a
           grid with nothing to scroll, so the rule never hides information. */
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:grid sm:snap-none sm:grid-cols-2 sm:overflow-visible lg:grid-cols-4"
      >
        {Children.map(children, (child) => (
          <div className="w-[85%] shrink-0 snap-start sm:w-auto sm:shrink">{child}</div>
        ))}
      </div>

      {/* Presentational: the cards are all in the accessibility tree already,
          and interactive dots would owe the 44px floor and grow into pills. */}
      {count > 1 ? (
        <div aria-hidden="true" className="mt-2 flex justify-center gap-1.5 sm:hidden">
          {Array.from({ length: count }, (_, i) => (
            <span
              key={i}
              className={`h-1.5 w-1.5 rounded-sm transition-colors duration-150 ${
                i === index ? 'bg-accent' : 'bg-line-strong'
              }`}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}
