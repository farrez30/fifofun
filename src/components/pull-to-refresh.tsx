'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { endpoint, rubberBand } from '@/components/spring'

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
 * How far the indicator has travelled for a finger that has moved `dy` down.
 *
 * Separated from the handler so the sums can be checked without a browser, the
 * same way `drag-axis.ts` separates its own.
 *
 * This was a flat halving, and the pleasant discovery when the real physics
 * arrived was that the two constants had already landed on Apple's own curve:
 * `rubberBand(144, 812)` is 72,16 against a threshold of 72, so the 144px of
 * finger travel the test below pins does not move by a pixel. What the curve
 * buys is the shape either side of it. A linear resistance is clipped by the
 * ceiling, so the indicator travels at a constant rate and then stops dead;
 * this one asymptotes, so it decelerates into the limit the way the rest of
 * the platform does.
 *
 * `size` is the dimension being pulled against, which is the viewport. It is a
 * parameter rather than a read of `window` so the sums stay checkable without
 * a browser; 812 is the iPhone the thresholds were set against.
 */
export function pullDistance(dy: number, size = 812): number {
  if (dy <= 0) return 0
  return Math.min(CEILING, rubberBand(dy, size))
}

/**
 * A single tick of feedback, on the platforms that have any.
 *
 * There is no Vibration API in any browser on iOS and there never has been:
 * every browser there is WebKit by policy, so this is a platform gap rather
 * than a Safari one. It is here anyway because this application is Indonesian
 * and the modal device is Android, where the coverage argument runs the other
 * way from the one that usually kills haptics.
 *
 * Exactly one moment: the pull crossing the line that makes the release mean
 * something. Latched by the caller, so a thumb wobbling across the threshold
 * buzzes once rather than chattering. Never the signal on its own, because on
 * iOS the words in the pill are the whole of the feedback.
 */
function tick(): void {
  if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
  navigator.vibrate(10)
}

export function PullToRefresh() {
  const router = useRouter()
  const [pull, setPull] = useState(0)
  /*
    `useTransition` rather than a flag and a timer.

    The spinner used to be cleared by `setTimeout(600)`, which claimed the
    refresh took six hundred milliseconds whether it took fifty or three
    seconds. That is a lie in both directions: it hides a fast answer behind a
    wait nobody needed, and it clears a slow one while the old figures are
    still on screen. `isPending` is the same state the framework already
    tracks, so the indicator reports the refresh instead of impersonating it,
    and the effect and the magic number both go.
  */
  const [busy, startRefresh] = useTransition()
  const active = useRef(false)
  const startY = useRef(0)
  const lastY = useRef(0)
  const lastAt = useRef(0)
  const speed = useRef(0)
  /* Latched, so a thumb resting on the line buzzes once and not forty times. */
  const armed = useRef(false)

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
      lastY.current = event.clientY
      lastAt.current = event.timeStamp
      speed.current = 0
      armed.current = false
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

      /* Two samples at least 8ms apart: one frame's delta at 120Hz is noise,
         not a measurement. */
      const elapsed = event.timeStamp - lastAt.current
      if (elapsed >= 8) {
        speed.current = (event.clientY - lastY.current) / elapsed
        lastY.current = event.clientY
        lastAt.current = event.timeStamp
      }

      const distance = pullDistance(dy, window.innerHeight)
      if (distance >= THRESHOLD && !armed.current) {
        armed.current = true
        tick()
      } else if (distance < THRESHOLD) {
        armed.current = false
      }

      setPull(distance)
    }

    function up() {
      if (!active.current) return
      active.current = false

      setPull((distance) => {
        /*
          Distance or intent. A short pull released while still accelerating
          was going past the line; a long one that came to rest was not. The
          fast deceleration rate, because this travels a hundred pixels rather
          than the height of the screen.
        */
        if (distance >= THRESHOLD || endpoint(distance, speed.current, 0.99) >= THRESHOLD) {
          startRefresh(() => router.refresh())
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

  if (pull === 0 && !busy) return null

  const ready = pull >= THRESHOLD

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-0 z-30 flex justify-center pt-safe-t sm:hidden"
      style={{ transform: `translateY(${busy ? 12 : pull * 0.6}px)` }}
    >
      {/* A capsule of glass, which is the one shape this indicator has always
          been on the platform it is borrowed from. It floats over content that
          is moving underneath it, which is the only condition under which a
          material is worth its cost. */}
      <span className="material material-thin rounded-full border px-3 py-1.5 text-xs text-ink-muted shadow-md">
        {/* A word, not a bare spinner. The rest of this application says what
            is happening rather than only that something is. */}
        {busy ? 'Memuat ulang' : ready ? 'Lepas untuk memuat ulang' : 'Tarik untuk memuat ulang'}
      </span>
    </div>
  )
}
