'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Pulling the page down to ask the server again.
 *
 * The figures on every screen here are read from the database at request time,
 * so the only way to see a change somebody else in the household just made is
 * to fetch the page again. On a desktop that is the reload button. Installed to
 * a home screen there is no reload button, and on iOS there is no pull gesture
 * either, which leaves closing the app and opening it as the only way.
 *
 * `router.refresh()` and not `location.reload()`. A reload throws away the
 * whole document, the fonts and the worker registration to re-fetch data that
 * arrives in a few kilobytes, and it discards anything half typed into a form
 * on the page. A refresh re-renders the server components in place.
 *
 * Chrome on Android has its own pull-to-refresh, which `overscroll-behavior`
 * in globals.css turns off so the two cannot both fire. That makes the gesture
 * the same on both platforms rather than present on one and absent on the
 * other.
 */

/** How far down before the release means it. */
export const THRESHOLD = 72
/** Past this the indicator stops following, so it cannot be dragged to the middle of the screen. */
const CEILING = 108
/**
 * The indicator slows as it is pulled rather than tracking the finger all the
 * way down, which is what makes the gesture feel like it is resisting.
 */
const RESISTANCE = 0.5

/**
 * How far the indicator has travelled for a finger that has moved `dy` down.
 *
 * Separated from the handler so the sums can be checked without a browser, the
 * same way `drag-axis.ts` separates its own. The resistance is the part worth
 * checking: it means the finger has to travel twice the threshold, and reading
 * that off the two constants is easy to get wrong.
 */
export function pullDistance(dy: number): number {
  if (dy <= 0) return 0
  return Math.min(CEILING, dy * RESISTANCE)
}

export function PullToRefresh() {
  const router = useRouter()
  const [pull, setPull] = useState(0)
  const [busy, setBusy] = useState(false)
  const active = useRef(false)
  const startY = useRef(0)

  useEffect(() => {
    if (!matchMedia('(pointer: coarse)').matches) return

    function down(event: PointerEvent) {
      active.current = false
      if (event.pointerType === 'mouse') return
      if (!matchMedia('(max-width: 639px)').matches) return
      if (document.querySelector('dialog[open]')) return
      // Only from the very top. Anywhere else the gesture is a scroll.
      if (window.scrollY > 0) return

      startY.current = event.clientY
      active.current = true
    }

    function move(event: PointerEvent) {
      if (!active.current) return

      const dy = event.clientY - startY.current
      // Scrolled away from the top mid-gesture, or pulled upward: not ours.
      if (dy <= 0 || window.scrollY > 0) {
        active.current = false
        setPull(0)
        return
      }

      setPull(pullDistance(dy))
    }

    function up() {
      if (!active.current) return
      active.current = false

      setPull((distance) => {
        if (distance >= THRESHOLD) {
          setBusy(true)
          router.refresh()
        }
        return 0
      })
    }

    document.addEventListener('pointerdown', down, { passive: true })
    document.addEventListener('pointermove', move, { passive: true })
    document.addEventListener('pointerup', up, { passive: true })
    document.addEventListener('pointercancel', up, { passive: true })

    return () => {
      document.removeEventListener('pointerdown', down)
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerup', up)
      document.removeEventListener('pointercancel', up)
    }
  }, [router])

  /*
    A refresh replaces the server-rendered tree, and this component survives it,
    so nothing else would ever clear the spinner. One frame after the new tree
    commits is enough, and it is why this is an effect rather than an await.
  */
  useEffect(() => {
    if (!busy) return
    const done = setTimeout(() => setBusy(false), 600)
    return () => clearTimeout(done)
  }, [busy])

  if (pull === 0 && !busy) return null

  const ready = pull >= THRESHOLD

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-0 z-30 flex justify-center pt-safe-t sm:hidden"
      style={{ transform: `translateY(${busy ? 12 : pull * 0.6}px)` }}
    >
      <span className="rounded-sm border border-line bg-surface px-3 py-1.5 text-xs text-ink-muted">
        {/* A word, not a bare spinner. The rest of this application says what
            is happening rather than only that something is. */}
        {busy ? 'Memuat ulang' : ready ? 'Lepas untuk memuat ulang' : 'Tarik untuk memuat ulang'}
      </span>
    </div>
  )
}
