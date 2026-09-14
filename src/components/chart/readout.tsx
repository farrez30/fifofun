'use client'

import { createPortal } from 'react-dom'
import { useRef, useState, type ReactNode } from 'react'
import { contentFrom, positionFor, type ReadoutContent } from './readout-logic'

/**
 * The floating glass readout, and the one place in a chart docs/DESIGN.md §5
 * allows to be glass at all: a bar, a sheet and a floating dock are the only
 * other places this app lets `backdrop-filter` near, and the reasoning is the
 * same one for all four — something has to be visibly moving underneath for
 * the blur to read as blur rather than as a flat `rgba()`.
 *
 * Delegated, not one listener per mark: the diagram or plot underneath stays
 * a plain server component, and any mark that wants a readout only has to
 * carry two data attributes. Portalled to `document.body` so the bubble ends
 * up outside the `<figure>` it points at — `e2e/glass.spec.ts` refuses glass
 * inside `figure, svg, table, [role="img"]`, on the same reasoning this file
 * already follows: a material has to sit on top of the layer it composites
 * against, not inside the flat drawing itself.
 *
 * Hover only fires under `(hover: hover)`, the same guard the Sankey ribbons
 * already use — a touch that lingers is not a hover, and a bubble stuck open
 * after a tap reads as broken. Keyboard focus is unconditional, which is the
 * whole point of pairing it with a pointer affordance rather than replacing
 * one with the other.
 */
export function ChartReadout({ children }: { children: ReactNode }) {
  const [readout, setReadout] = useState<(ReadoutContent & { x: number; y: number }) | null>(null)
  const hoverCapable = useRef<boolean | null>(null)

  function show(target: EventTarget | null) {
    const mark = target instanceof Element ? target.closest<HTMLElement>('[data-readout-label]') : null
    const content = mark && contentFrom(mark.dataset)
    if (!mark || !content) {
      setReadout(null)
      return
    }
    setReadout({ ...content, ...positionFor(mark.getBoundingClientRect(), window.innerWidth) })
  }

  return (
    <div
      onPointerMove={(event) => {
        hoverCapable.current ??= window.matchMedia('(hover: hover)').matches
        if (hoverCapable.current) show(event.target)
      }}
      onPointerLeave={() => setReadout(null)}
      onFocus={(event) => show(event.target)}
      onBlur={() => setReadout(null)}
    >
      {children}
      {readout
        ? createPortal(
            /* aria-hidden: the mark itself already carries this as its
               accessible name (aria-label, replacing the <title> a mouse
               alone could reach), so this bubble is a sighted-pointer and
               sighted-keyboard convenience, not a second source of it. */
            <div
              aria-hidden="true"
              data-readout
              className="material pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-[calc(100%+10px)] whitespace-nowrap rounded-md px-2.5 py-1.5 shadow-lg"
              style={{ left: readout.x, top: readout.y }}
            >
              <p className="text-footnote font-medium text-ink">{readout.label}</p>
              <p className="tnum font-mono text-footnote text-ink-muted">{readout.value}</p>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
