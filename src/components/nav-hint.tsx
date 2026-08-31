'use client'

import { useLinkStatus } from 'next/link'

/**
 * The dot that says a tap landed.
 *
 * Under Cache Components the browser stays on the current page until the next
 * one streams in, and when the destination's shell has not been prefetched
 * (always, in development; on a cold or slow network in production) that wait
 * has no pixels at all — so people tap the same link three times and conclude
 * the app dropped it. `useLinkStatus` reports exactly that window.
 *
 * Always rendered at a fixed size and revealed by opacity, so it can never
 * shift layout; the 100ms transition delay means a navigation that resolves
 * quickly — a warm prefetch skips pending entirely — shows nothing. This is
 * the documented pattern for the hook, minus its keyframes: a delayed opacity
 * transition survives the global reduced-motion clamp (which zeroes durations
 * but not delays) with the debounce intact, where an animation would not.
 *
 * Must sit inside a <Link>; anywhere else the hook answers a permanent
 * "not pending", which is also why the static fixtures can render it.
 */
export function NavHint({ className }: { className?: string }) {
  const { pending } = useLinkStatus()

  return (
    <span
      aria-hidden="true"
      className={`nav-hint${pending ? ' nav-hint-pending' : ''}${className ? ` ${className}` : ''}`}
    />
  )
}
