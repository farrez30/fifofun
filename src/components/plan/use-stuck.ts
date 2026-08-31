'use client'

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'

/**
 * Whether a sticky element has left its place in the page.
 *
 * There is no event for "an element is now stuck", and reading `scrollY`
 * against a hard-coded offset breaks the first time the header above it wraps
 * onto two lines. The reliable answer is a zero-height sentinel sitting where
 * the element normally starts: the moment it leaves the top of the viewport,
 * the element above it is pinned. The browser does the geometry, and it keeps
 * doing it after a resize, a zoom, or a font that loads late.
 */
export function useStuck<T extends HTMLElement>(): [RefObject<T | null>, boolean] {
  const sentinel = useRef<T>(null)
  const [stuck, setStuck] = useState(false)

  useEffect(() => {
    const node = sentinel.current
    if (!node || typeof IntersectionObserver === 'undefined') return

    const observer = new IntersectionObserver(
      ([entry]) => {
        /*
          A zeroed rect means the sentinel sits in a display:none subtree —
          which happens for real: Cache Components keeps the departing page in
          a hidden Activity, and the observer can fire once more before this
          effect's deferred cleanup runs. Acting on it would reset `stuck` on
          a page that is scrolled deep, so the dock came back full-size over
          the content when the reader returned. A hidden page has no answer;
          keep the last one.
        */
        const rect = entry.boundingClientRect
        if (rect.width === 0 && rect.height === 0 && rect.top === 0) return
        setStuck(!entry.isIntersecting && rect.top < 0)
      },
      { threshold: 0 },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return [sentinel, stuck]
}

/**
 * The height an element gives up when it shrinks, so nothing below it moves.
 *
 * A sticky element still occupies its own space in the flow. Shrinking it on
 * scroll therefore pulls the whole page up by the difference, under a thumb
 * that is already scrolling, which reads as the page jumping away. Reserving
 * the difference in a spacer keeps the flow the size it was: the dock shrinks
 * and nothing else moves at all.
 */
export function useReservedHeight(ref: RefObject<HTMLElement | null>, shrunk: boolean): number {
  const [full, setFull] = useState(0)
  const [current, setCurrent] = useState(0)

  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return

    const measure = () => {
      const height = node.offsetHeight
      // Zero means display:none — a hidden Activity page, not a real size.
      // Recording it would turn the spacer into `full - 0` on re-show: a
      // dock-sized hole above the sections. Keep the last honest number.
      if (height === 0) return
      setCurrent(height)
      // Only the unshrunk state defines the space to hold open. Measuring the
      // compact one into it would let the reserve creep down to nothing.
      if (!shrunk) setFull(height)
    }

    measure()
    if (typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [ref, shrunk])

  return Math.max(0, full - current)
}
