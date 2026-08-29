'use client'

import { Suspense, use, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { DotsNine } from '@phosphor-icons/react/dist/ssr/DotsNine'
import { SignOut } from '@phosphor-icons/react/dist/ssr/SignOut'
import { signOut } from '@/app/login/actions'
import { PullToRefresh } from '@/components/pull-to-refresh'
import { SHEET, TAB, TABS } from '@/components/tabs'
import { useSwipeTabs } from '@/components/use-swipe-tabs'
import type { NavHref } from '@/components/nav'

/**
 * The navigation a phone gets instead of the wrapping row of links.
 *
 * Eight links in a row wrap to three or four lines at 375px, and with the
 * account row and the heading above them the header spent most of the first
 * screen before any figure appeared. A bar pinned to the bottom costs a fixed
 * 64px, sits under the thumb rather than above it, and never moves.
 *
 * The four destinations that do not fit are not hidden behind a hamburger.
 * They are behind a tab that is itself always visible, and they are the
 * periodic ones: a fund is opened when a fund changes, a statement is imported
 * once a month, settings twice a year. Two of them already lived in the footer
 * for exactly that reason.
 *
 * The current tab is marked three ways and only one of them is colour: the
 * glyph fills, the label takes medium weight, and `aria-current` says so. The
 * accent is the least of the three on purpose.
 *
 * That third mark had to be put on the Lainnya button by hand. The six
 * destinations behind it carry it inside the sheet, and a closed sheet renders
 * nothing, so a reader on one of those six pages was hearing about a button
 * with no state at all while a sighted reader saw the tab lit up.
 */

/* The order a thumb moves through, which is the order they are drawn in. */
const SWIPE_ORDER = TABS.map((tab) => tab.href)

interface Props {
  current: NavHref
  email: string
  /**
   * Rows waiting in Tinjau, shown on its tab. The bar's one piece of news.
   *
   * A promise, because the shell starts the count without awaiting it: the
   * page paints, the figure streams in behind. Only the badge suspends on it.
   */
  review: Promise<number>
}

/**
 * The count on the Tinjau tab, kept to its own component so that `use` can
 * suspend the badge and nothing else. A count rather than a dot, because six
 * and sixty are different asks of the evening, and a numeral is not colour
 * alone.
 */
function ReviewBadge({ review }: { review: Promise<number> }) {
  const count = use(review)
  if (count === 0) return null

  return (
    <>
      <span
        aria-hidden="true"
        className="tnum absolute -right-2.5 -top-1 rounded-sm bg-accent px-1 font-mono text-[0.625rem] font-medium leading-4 text-paper"
      >
        {count > 99 ? '99+' : count}
      </span>
      {/* Sits before the label in the DOM, so the name it builds reads as a
          sentence: "6 transaksi menunggu di Tinjau". */}
      <span className="sr-only">{count} transaksi menunggu di</span>
    </>
  )
}

export function MobileTabs({ current, email, review }: Props) {
  const sheet = useRef<HTMLDialogElement>(null)
  const [open, setOpen] = useState(false)
  const inSheet = SHEET.some((item) => item.href === current)

  /*
    The grabber drags the sheet down, and far enough down means dismissed.

    Pointer events on the grabber alone rather than the whole sheet, so a thumb
    scrolling a long row list never drags the sheet by accident. The sheet
    follows the finger through a transform, which never reflows the rows under
    it, and a release short of the threshold simply puts it back.
  */
  const dragFrom = useRef<number | null>(null)
  const dragged = useRef(false)

  function grabberDown(event: React.PointerEvent<HTMLButtonElement>) {
    if (event.pointerType === 'mouse') return
    dragFrom.current = event.clientY
    dragged.current = false
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // iOS throws for a pointer already released; the drag works uncaptured,
      // capture only smooths a thumb that wanders off the grabber.
    }
  }

  function grabberMove(event: React.PointerEvent<HTMLButtonElement>) {
    if (dragFrom.current === null || !sheet.current) return
    const down = Math.max(0, event.clientY - dragFrom.current)
    if (down > 4) dragged.current = true
    // No transition while the finger holds the sheet: it follows, not chases.
    sheet.current.style.transition = 'none'
    sheet.current.style.transform = down > 0 ? `translateY(${down}px)` : ''
  }

  function grabberUp(event: React.PointerEvent<HTMLButtonElement>) {
    if (dragFrom.current === null || !sheet.current) return
    const down = event.clientY - dragFrom.current
    dragFrom.current = null
    // Released short of the threshold, the sheet eases home instead of
    // teleporting; the global reduced-motion block collapses the ease.
    sheet.current.style.transition = ''
    sheet.current.style.transform = ''
    if (down > 96) sheet.current.close()
  }

  useSwipeTabs(SWIPE_ORDER, current)

  /*
    Closing has to be observed rather than assumed. A dialog is dismissed by the
    Escape key and by the browser's own back gesture as well as by the button,
    and a flag set only where `close()` is called goes stale on both.
  */
  useEffect(() => {
    const node = sheet.current
    if (!node) return
    const sync = () => setOpen(node.open)
    node.addEventListener('close', sync)
    return () => node.removeEventListener('close', sync)
  }, [])

  /* A route change while the sheet is open leaves it covering the page it just
     navigated to. */
  useEffect(() => {
    sheet.current?.close()
  }, [current])

  return (
    <>
      <PullToRefresh />

      <nav
        aria-label="Halaman utama"
        /* `sm:hidden` and not a media query in JavaScript: the bar must be
           absent on the first paint at desktop width, not removed after it. */
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface pb-safe-b pl-safe-l pr-safe-r sm:hidden"
      >
        <ul className="flex">
          {TABS.map((tab) => (
            <li key={tab.href} className="flex flex-1">
              <Link
                href={tab.href}
                aria-current={tab.href === current ? 'page' : undefined}
                className={`${TAB} ${
                  tab.href === current ? 'text-accent' : 'text-ink-muted'
                }`}
              >
                <span className="relative">
                  <tab.glyph
                    aria-hidden="true"
                    weight={tab.href === current ? 'fill' : 'regular'}
                    className="size-6 shrink-0"
                  />
                  {/* No fallback: until the count lands there is no badge,
                      which is also the truthful display for zero. */}
                  {tab.href === '/tinjau' ? (
                    <Suspense fallback={null}>
                      <ReviewBadge review={review} />
                    </Suspense>
                  ) : null}
                </span>
                <span className={`text-xs ${tab.href === current ? 'font-medium' : ''}`}>
                  {tab.label}
                </span>
              </Link>
            </li>
          ))}

          <li className="flex flex-1">
            <button
              type="button"
              onClick={() => {
                sheet.current?.showModal()
                /*
                  Focus parks on the dialog, not its first control. `showModal`
                  focuses the grabber otherwise, and Chrome treats that
                  programmatic move as keyboard-like, so every open painted a
                  focus ring across the top of the sheet for a thumb that never
                  asked. The dialog is labelled, a reader announces it, and the
                  first Tab still lands on the grabber with its ring intact.
                */
                sheet.current?.focus()
                setOpen(true)
              }}
              /*
                The six destinations behind here are marked inside the sheet,
                and the sheet is closed, so without this a reader on any of them
                is told nothing at all about where they are: the tab turns the
                accent on and takes medium weight, and both of those are ink.
                `true` rather than `page`, because the button is not the page.
                It is the item in the set that stands for it.
              */
              aria-current={inSheet ? 'true' : undefined}
              aria-expanded={open}
              aria-haspopup="dialog"
              className={`${TAB} ${inSheet ? 'text-accent' : 'text-ink-muted'}`}
            >
              {/* DotsNine rather than DotsThree, for a measured reason: three
                  dots painted 3% of their box against 19 to 37% for the other
                  four glyphs, a hole in the row, and their fill weight turned
                  into a solid pill that read as a badge. Nine dots sit in the
                  same square the others use, and filling them thickens the
                  dots without changing what the shape is. */}
              <DotsNine
                aria-hidden="true"
                weight={inSheet ? 'fill' : 'regular'}
                className="size-6 shrink-0"
              />
              <span className={`text-xs ${inSheet ? 'font-medium' : ''}`}>Lainnya</span>
            </button>
          </li>
        </ul>
      </nav>

      {/*
        The rows are ordered by how far a thumb reaches, and the order used to
        be exactly backwards: Keluar sat in the lowest row, which on a bottom
        sheet is the easiest place on the whole screen to hit, one hairline
        away from a link people actually tap, and it signed out on contact.
        Now the account row and its Keluar sit at the top, the hardest place
        to reach by accident, and the bottom rows are all navigation, where a
        stray tap costs one back gesture.
      */}
      <dialog
        ref={sheet}
        aria-labelledby="sheet-lainnya"
        /* Focusable, so opening can park focus on the dialog itself; see the
           opener. Negative, so tabbing never returns here. */
        tabIndex={-1}
        /* A dialog centres itself. `mt-auto mb-0` drops it to the bottom edge,
           where the hand that opened it already is. */
        className="mx-auto mb-0 mt-auto w-full max-w-none rounded-t-md border-t border-line bg-surface p-0 text-ink transition-transform duration-150 backdrop:bg-scrim sm:hidden"
        /* A click that lands on the dialog itself landed on the backdrop: every
           child covers its own area. */
        onClick={(event) => {
          if (event.target === sheet.current) sheet.current?.close()
        }}
      >
        <div className="pb-safe-b">
          {/*
            The grabber every bottom sheet has taught a thumb to expect: drag
            it down to put the sheet away, or tap it. It replaces the Tutup
            button that sat in the top-right corner, which is the single
            hardest point to reach on a phone held in one hand.
          */}
          <button
            type="button"
            aria-label="Tutup"
            onClick={() => {
              if (!dragged.current) sheet.current?.close()
            }}
            onPointerDown={grabberDown}
            onPointerMove={grabberMove}
            onPointerUp={grabberUp}
            onPointerCancel={grabberUp}
            /* Sized to the pill rather than the sheet: `showModal` focuses the
               first control, and a focus ring around an invisible full-width
               button drew a line across the sheet. The touch floor still
               guarantees the 44px. */
            className="mx-auto flex touch-none justify-center rounded-sm px-6 py-3"
          >
            <span aria-hidden="true" className="h-1 w-9 rounded-sm bg-line-strong" />
          </button>

          <div className="flex items-center justify-between gap-3 border-b border-line px-4 pb-3">
            <div className="min-w-0">
              <h2 id="sheet-lainnya" className="text-sm font-medium text-ink">
                Lainnya
              </h2>
              <p className="truncate text-xs text-ink-muted">{email}</p>
            </div>
            {/* The same bordered button the desktop header uses, so signing
                out looks like the decision it is instead of one more row. */}
            <form action={signOut} className="shrink-0">
              <button
                type="submit"
                className="flex items-center gap-1.5 rounded-sm border border-line px-3 py-1.5 text-sm text-ink transition-colors duration-150 hover:border-line-strong hover:bg-sunken"
              >
                <SignOut aria-hidden="true" weight="regular" className="size-4 text-ink-muted" />
                Keluar
              </button>
            </form>
          </div>

          <nav aria-label="Halaman lainnya">
            <ul className="divide-y divide-line">
              {SHEET.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={item.href === current ? 'page' : undefined}
                    className={`flex min-h-14 items-center gap-3 px-4 text-sm transition-colors duration-150 hover:bg-sunken ${
                      item.href === current ? 'font-medium text-accent' : 'text-ink'
                    }`}
                  >
                    <item.glyph
                      aria-hidden="true"
                      weight={item.href === current ? 'fill' : 'regular'}
                      className="size-5 shrink-0 text-ink-muted"
                    />
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </dialog>
    </>
  )
}
