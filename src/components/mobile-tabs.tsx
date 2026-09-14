'use client'

import { Suspense, use, useEffect, useLayoutEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { DotsNine } from '@phosphor-icons/react/dist/ssr/DotsNine'
import { SignOut } from '@phosphor-icons/react/dist/ssr/SignOut'
import { signOut } from '@/app/login/actions'
import { BUTTON_QUIET } from '@/components/field-base'
import { NavHint } from '@/components/nav-hint'
import { PullToRefresh } from '@/components/pull-to-refresh'
import { SHEET, TAB, TABS } from '@/components/tabs'
import {
  RETURN,
  SHEET_OUT,
  Velocity,
  endpoint,
  release,
  rubberBand,
  translateOf,
} from '@/components/spring'
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
      {/*
        Red, and a capsule.

        It was the accent in a small rounded rectangle, which is this
        application's chip shape, so it read as a label attached to the glyph
        rather than as a count demanding attention. Apple has exactly one badge
        and it is a red pill, which is worth copying here for the reason it
        exists: a badge is the only thing in a tab bar allowed to interrupt, and
        making it the same colour as the selected tab spends that on nothing.

        Still not colour alone. The figure is the message and the sentence below
        carries it for anyone who never sees the pill.
      */}
      <span
        aria-hidden="true"
        className="tnum absolute -right-2.5 -top-1 min-w-4 rounded-full bg-over px-1 text-center font-mono text-caption2 font-medium leading-4 text-paper"
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
  const velocity = useRef(new Velocity())
  /* The spring currently carrying the sheet, so a finger arriving mid-flight
     can take it over rather than fight it. */
  const running = useRef<Animation | null>(null)

  function grabberDown(event: React.PointerEvent<HTMLButtonElement>) {
    if (event.pointerType === 'mouse') return
    /*
      A finger landing on a sheet that has not finished moving takes it over
      from wherever it is. The position is read before the animation is
      cancelled, because cancelling reverts to the base style; the velocity is
      deliberately thrown away, because from this frame the finger owns it.
      That last part is what iOS does and what makes an integrator unnecessary.
    */
    const moving = running.current
    if (moving && sheet.current) {
      const at = translateOf(sheet.current, 'y')
      moving.cancel()
      running.current = null
      sheet.current.style.transform = `translateY(${at}px)`
      dragFrom.current = event.clientY - at
    } else {
      dragFrom.current = event.clientY
    }
    velocity.current.start(event.clientY, event.timeStamp)
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
    const raw = event.clientY - dragFrom.current
    /*
      Downward the sheet follows the finger exactly. Upward it does not: there
      is nothing above a sheet already at the top of its travel, so the pull is
      fed through Apple's overscroll curve, which asymptotes rather than
      clipping. A surface that decelerates into its limit reads as a limit; one
      that stops dead reads as a bug.
    */
    const down = raw >= 0 ? raw : -rubberBand(-raw, window.innerHeight)
    if (Math.abs(raw) > 4) dragged.current = true
    velocity.current.track(event.clientY, event.timeStamp)
    // No transition while the finger holds the sheet: it follows, not chases.
    sheet.current.style.transition = 'none'
    sheet.current.style.transform = `translateY(${down}px)`
  }

  function grabberUp(event: React.PointerEvent<HTMLButtonElement>) {
    const node = sheet.current
    if (dragFrom.current === null || !node) return
    const down = Math.max(0, event.clientY - dragFrom.current)
    dragFrom.current = null
    velocity.current.track(event.clientY, event.timeStamp)
    const speed = velocity.current.current
    node.style.transition = ''

    /*
      Where the gesture was going, not where it stopped.

      The threshold this replaced was a flat 96 pixels, which cannot tell a
      flick from a slow drag: a sharp thirty pixel flick left the sheet open,
      and a hundred and twenty pixel drag that had clearly changed its mind put
      it away. Projecting the release velocity forward at the deceleration rate
      a scroll view uses answers both. A thirty pixel flick at one pixel per
      millisecond projects past five hundred and dismisses; a slow drag that
      stopped projects barely past where it already is, and springs home, which
      is right, because a long slow drag that stopped is a cancellation.
    */
    const going = endpoint(down, speed)
    if (going > node.getBoundingClientRect().height / 2) {
      const travel = { from: down, to: node.getBoundingClientRect().height, velocity: speed }
      const leaving = release(node, SHEET_OUT, travel)
      if (leaving) {
        leaving.finished.then(() => node.close()).catch(() => undefined)
      } else {
        node.close()
      }
      return
    }

    running.current = release(node, RETURN, { from: down, to: 0, velocity: speed })
  }

  useSwipeTabs(SWIPE_ORDER, current)

  /*
    Closing has to be observed rather than assumed. A dialog is dismissed by the
    Escape key and by the browser's own back gesture as well as by the button,
    and a flag set only where `close()` is called goes stale on both. The
    scroll-lock attribute on <html> is cleared here for the same reason: one
    place sees every way the sheet can close.

    The cleanup is the load-bearing half, and it exists because of Cache
    Components: a navigation keeps this page — dialog included — mounted in a
    hidden Activity instead of unmounting it. An open dialog surviving there
    once kept the whole app's scroll locked (and, via `dialog[open]` checks,
    silently disabled pull-to-refresh and the tab swipe) until a refresh.
    Activity runs effect cleanups on hide, so this is the hook that puts the
    sheet away; a layout effect, so it runs before the hidden frame paints.
  */
  useLayoutEffect(() => {
    const node = sheet.current
    if (!node) return
    const sync = () => {
      setOpen(node.open)
      if (!node.open) delete document.documentElement.dataset.sheetOpen
    }
    node.addEventListener('close', sync)
    return () => {
      node.removeEventListener('close', sync)
      node.close()
      delete document.documentElement.dataset.sheetOpen
    }
  }, [])

  /* A route change while the sheet is open leaves it covering the page it just
     navigated to. Covers the searchParams-only case the cleanup above never
     sees, because the instance survives those. */
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
        /*
          Glass, and the one surface in this application that earns it.

          A backdrop filter over a flat colour composites to the same thing a
          plain `rgba()` would, which is an expensive way to draw nothing. What
          makes this one real is that the ledger scrolls underneath it: white
          cards, coloured verdict chips and chart ink all pass behind the bar,
          and the bar reports them. The border goes because a material carries
          its own specular edge.
        */
        className="material fixed inset-x-0 bottom-0 z-40 border-t pb-safe-b pl-safe-l pr-safe-r sm:hidden"
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
                <span className={`text-caption2 ${tab.href === current ? 'font-medium' : ''}`}>
                  {tab.label}
                </span>
                {/* Pending dot in the gap between glyph and label. */}
                <NavHint className="absolute bottom-1 left-1/2 -translate-x-1/2" />
              </Link>
            </li>
          ))}

          <li className="flex flex-1">
            <button
              type="button"
              onClick={() => {
                sheet.current?.showModal()
                document.documentElement.dataset.sheetOpen = 'true'
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
              <span className={`text-caption2 ${inSheet ? 'font-medium' : ''}`}>Lainnya</span>
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
        /*
          `material-thick`, not `material`. A sheet covers the page rather than
          floating over a strip of it, so it obscures where a bar reports; the
          thickest tint is the one that still says glass without asking the
          reader to look through their own ledger at the menu on top of it.

          The radius is Apple's sheet corner. `.sheet` in `globals.css` carries
          the height clamp, the presentation spring and the bleed that keeps the
          overshoot from showing scrim underneath.
        */
        className="material material-thick sheet mx-auto mb-0 mt-auto w-full max-w-none rounded-t-xl border-t p-0 text-ink backdrop:bg-scrim sm:hidden"
        /* A click that lands on the dialog itself landed on the backdrop: every
           child covers its own area. */
        onClick={(event) => {
          if (event.target === sheet.current) sheet.current?.close()
        }}
      >
        {/* `flex min-h-0` so the clamp on `.sheet` actually has something to
            clamp: without a column that can shrink, the rows overflow past the
            ceiling instead of the list scrolling inside it. */}
        <div className="flex min-h-0 flex-1 flex-col pb-safe-b">
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
            <span aria-hidden="true" className="h-[5px] w-9 rounded-full bg-line-strong" />
          </button>

          <div className="flex items-center justify-between gap-3 border-b border-line px-4 pb-3">
            <div className="min-w-0">
              <h2 id="sheet-lainnya" className="text-subhead font-medium text-ink">
                Lainnya
              </h2>
              <p className="truncate text-footnote text-ink-muted">{email}</p>
            </div>
            {/* The desktop equivalent lives in the sidebar's own account
                row now (`AppShell`), so this is the sheet's own copy of the
                same quiet button rather than a shared one. */}
            <form action={signOut} className="shrink-0">
              <button type="submit" className={`${BUTTON_QUIET} gap-1.5`}>
                <SignOut aria-hidden="true" weight="regular" className="size-4 text-ink-muted" />
                Keluar
              </button>
            </form>
          </div>

          <nav aria-label="Halaman lainnya">
            {/*
              The list scrolls, the sheet does not.

              `.sheet` carries a ceiling of 88dvh, and a ceiling with nothing
              scrollable under it only hides the rows it cuts off. At the
              default text size the six rows fit on every phone; turn the text
              size up on a 568px screen and the bottom two used to become
              unreachable, which is the actual bug here rather than a
              hypothetical one. `.sheet-list` also contains its own overscroll,
              so reaching the end of it never rubber-bands the locked page
              behind the sheet.
            */}
            <ul className="sheet-list rows-inset">
              {SHEET.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    /* Closed at the moment the navigation STARTS, not when the
                       route commits: the sheet must never travel, even for a
                       frame, on top of the page it just opened. */
                    onNavigate={() => sheet.current?.close()}
                    aria-current={item.href === current ? 'page' : undefined}
                    className={`flex min-h-14 items-center gap-3 px-4 text-subhead transition-colors duration-150 hover:bg-sunken ${
                      item.href === current ? 'font-medium text-accent' : 'text-ink'
                    }`}
                  >
                    <item.glyph
                      aria-hidden="true"
                      weight={item.href === current ? 'fill' : 'regular'}
                      className="size-5 shrink-0 text-ink-muted"
                    />
                    {item.label}
                    <NavHint className="ml-auto" />
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
