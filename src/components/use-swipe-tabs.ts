'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { NavHref } from '@/components/nav'

/**
 * Moving between tabs with a thumb.
 *
 * The whole difficulty is knowing when *not* to fire. This application has
 * fifteen regions that scroll sideways, including every chart and the Sankey,
 * and a swipe that begins inside one of them has to scroll that region rather
 * than leave the page. Getting that wrong does not degrade the gesture, it
 * breaks every diagram in the app.
 *
 * So the gesture declines in five situations, and the order matters only in
 * that the cheap checks come first:
 *
 *   1. a pointer that is not a finger, or a screen wide enough for the nav row
 *   2. a sheet is open, where a swipe means something else or nothing
 *   3. the gesture began inside something that can scroll sideways
 *   4. it began in the strip iOS keeps for its own back gesture
 *   5. it was mostly vertical, or too short to be meant
 *
 * `prefers-reduced-motion` is deliberately not on that list. It asks for less
 * animation, not for fewer ways to get around, and this is a way to get around.
 * The animation it would ask about is the page fade, which is a CSS animation
 * the global reduce block already removes; taking the gesture away as well
 * would leave the reader who asked for calm with one route into a page instead
 * of two.
 *
 * Pointer events rather than touch events, which is the idiom `drag-axis.tsx`
 * already established here.
 */

/** Enough travel to be meant, and enough sideways bias to not be a scroll. */
const DISTANCE = 64
const BIAS = 2
/** Both screen edges belong to the browser's own back and forward gestures. */
export const EDGE = 24

/**
 * The sums, kept apart from the event handling.
 *
 * `drag-axis.ts` separates its arithmetic for the same reason and says why:
 * what goes wrong in a gesture is almost always the numbers, and the numbers
 * reproduce without a browser once they are not tangled up in listeners.
 */

/** True in the strip at either screen edge that the browser has claimed. */
export function inEdgeStrip(clientX: number, width: number): boolean {
  return clientX < EDGE || clientX > width - EDGE
}

/**
 * Where a finished swipe lands, or null when it was not a swipe or there is
 * nowhere for it to go.
 */
export function swipeTarget(
  order: readonly NavHref[],
  current: NavHref,
  dx: number,
  dy: number,
): NavHref | null {
  if (Math.abs(dx) < DISTANCE) return null
  if (Math.abs(dx) < Math.abs(dy) * BIAS) return null

  const index = order.indexOf(current)
  // A page that is not one of the tabs has no neighbours to swipe to.
  if (index === -1) return null

  const next = dx < 0 ? index + 1 : index - 1
  if (next < 0 || next >= order.length) return null

  return order[next]
}

/**
 * Exported for the phone suite, which measures it against real layout.
 *
 * This one cannot join the others above: `scrollWidth` and a computed
 * `overflow-x` only mean anything once a browser has laid the page out, and the
 * unit runner lays nothing out. So the suite lifts this function's own source
 * into a page that has a real chart on it. Nothing else imports it.
 */
export function pannableAncestor(node: EventTarget | null): boolean {
  let element = node instanceof Element ? node : null

  while (element && element !== document.body) {
    const { overflowX } = getComputedStyle(element)
    if (
      (overflowX === 'auto' || overflowX === 'scroll') &&
      element.scrollWidth > element.clientWidth + 1
    ) {
      return true
    }
    element = element.parentElement
  }

  return false
}

export function useSwipeTabs(order: readonly NavHref[], current: NavHref) {
  const router = useRouter()

  useEffect(() => {
    if (!matchMedia('(pointer: coarse)').matches) return

    let startX = 0
    let startY = 0
    let tracking = false

    function down(event: PointerEvent) {
      tracking = false

      if (event.pointerType === 'mouse') return
      // The nav row is back at this width and a swipe would contradict it.
      if (!matchMedia('(max-width: 639px)').matches) return
      if (document.querySelector('dialog[open]')) return
      if (inEdgeStrip(event.clientX, window.innerWidth)) return
      if (pannableAncestor(event.target)) return

      startX = event.clientX
      startY = event.clientY
      tracking = true
    }

    function up(event: PointerEvent) {
      if (!tracking) return
      tracking = false

      const target = swipeTarget(order, current, event.clientX - startX, event.clientY - startY)
      if (target) router.push(target)
    }

    // The browser claimed the gesture for a scroll, so it was never ours.
    const cancel = () => {
      tracking = false
    }

    document.addEventListener('pointerdown', down, { passive: true })
    document.addEventListener('pointerup', up, { passive: true })
    document.addEventListener('pointercancel', cancel, { passive: true })

    return () => {
      document.removeEventListener('pointerdown', down)
      document.removeEventListener('pointerup', up)
      document.removeEventListener('pointercancel', cancel)
    }
    // Re-registered on navigation rather than read through a ref. Three
    // document listeners cost nothing to replace, and a ref written during
    // render to avoid it is the more expensive mistake.
  }, [router, order, current])
}
