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
 * So the gesture declines in six situations, and the order matters only in that
 * the cheap checks come first:
 *
 *   1. a stated preference for less motion
 *   2. a pointer that is not a finger, or a screen wide enough for the nav row
 *   3. a sheet is open, where a swipe means something else or nothing
 *   4. the gesture began inside something that can scroll sideways
 *   5. it began in the strip iOS keeps for its own back gesture
 *   6. it was mostly vertical, or too short to be meant
 *
 * Pointer events rather than touch events, which is the idiom `drag-axis.tsx`
 * already established here.
 */

/** Enough travel to be meant, and enough sideways bias to not be a scroll. */
const DISTANCE = 64
const BIAS = 2
/** Both screen edges belong to the browser's own back and forward gestures. */
const EDGE = 24

function pannableAncestor(node: EventTarget | null): boolean {
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
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
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
      if (event.clientX < EDGE || event.clientX > window.innerWidth - EDGE) return
      if (pannableAncestor(event.target)) return

      startX = event.clientX
      startY = event.clientY
      tracking = true
    }

    function up(event: PointerEvent) {
      if (!tracking) return
      tracking = false

      const dx = event.clientX - startX
      const dy = event.clientY - startY
      if (Math.abs(dx) < DISTANCE) return
      if (Math.abs(dx) < Math.abs(dy) * BIAS) return

      const index = order.indexOf(current)
      // A page that is not one of the tabs has no neighbours to swipe to.
      if (index === -1) return

      const next = dx < 0 ? index + 1 : index - 1
      if (next < 0 || next >= order.length) return

      router.push(order[next], {
        transitionTypes: [dx < 0 ? 'swipe-next' : 'swipe-prev'],
      })
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
