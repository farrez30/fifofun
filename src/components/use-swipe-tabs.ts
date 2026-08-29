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
 * So the gesture declines in seven situations, and the order matters only in
 * that the cheap checks come first:
 *
 *   1. a pointer that is not a finger, or a screen wide enough for the nav row
 *   2. a sheet is open, where a swipe means something else or nothing
 *   3. the gesture began inside something that can scroll sideways
 *   4. it began in the strip iOS keeps for its own back gesture
 *   5. it began in a row that owns its own horizontal gesture
 *   6. it began in a form somebody has already typed into
 *   7. it was mostly vertical, or too short to be meant
 *
 * The first four ask whether the gesture belongs to something else on the page.
 * The fifth asks what leaving would cost, which is a different question and was
 * missing: every refusal was about diagrams, and none of them was about work.
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
 * Whether the press landed in a form somebody has already put work into.
 *
 * The five refusals below all ask the same question, which is whether the
 * gesture belongs to something else on the page. This asks a different one:
 * what leaving costs. A swipe navigates, a navigation unmounts the form, and
 * the entry screen is 942px tall on a 664px phone, so a thumb is travelling
 * across it constantly. Losing a transaction to a gesture nobody knew was there
 * does not teach the gesture, it teaches that the application drops things.
 *
 * Dirty rather than merely present, because a form is not rare here: the
 * report filters are a form, and declining on those would take the gesture off
 * the page it is most useful on. A field that still holds what the server
 * rendered has nothing to lose.
 *
 * Exported for the same reason as `pannableAncestor`: only a real browser has
 * a `defaultValue` to compare against.
 */
export function dirtyFormAncestor(node: EventTarget | null): boolean {
  const form = node instanceof Element ? node.closest('form') : null
  if (!form) return false

  for (const field of form.elements) {
    if (field instanceof HTMLInputElement) {
      if (field.type === 'checkbox' || field.type === 'radio') {
        if (field.checked !== field.defaultChecked) return true
      } else if (field.value !== field.defaultValue) {
        return true
      }
    } else if (field instanceof HTMLTextAreaElement) {
      if (field.value !== field.defaultValue) return true
    } else if (field instanceof HTMLSelectElement) {
      for (const option of field.options) {
        if (option.selected !== option.defaultSelected) return true
      }
    }
  }

  return false
}

/**
 * Exported for the phone suite, which measures it against real layout.
 *
 * This one cannot join the others above: `scrollWidth` and a computed
 * `overflow-x` only mean anything once a browser has laid the page out, and the
 * unit runner lays nothing out. So the suite lifts this function's own source
 * into a page that has a real chart on it. Nothing else imports it.
 */
/**
 * Whether the press landed in a row that holds its own horizontal gesture —
 * the action tray on a ledger card. An attribute rather than a real scroller,
 * on purpose: the tray moves by transform, so `pannableAncestor` cannot see
 * it, and making it a genuine `overflow-x` region would fail the phone
 * suite's rule that transaction rows are never sideways-scrollable. Exported
 * for that same suite, which lifts this source into a real page.
 */
export function swipeActionAncestor(node: EventTarget | null): boolean {
  return node instanceof Element && node.closest('[data-swipe-actions]') !== null
}

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
      if (swipeActionAncestor(event.target)) return
      if (dirtyFormAncestor(event.target)) return

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
