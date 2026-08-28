import { describe, expect, it } from 'vitest'
import { EDGE, inEdgeStrip, swipeTarget } from './use-swipe-tabs'
import type { NavHref } from './nav'

/**
 * The rules that decide whether a drag was a swipe, tested without a browser.
 *
 * This gesture is the one piece of this application that can take a page away
 * from somebody who did not ask for it, so what is worth pinning down is mostly
 * the refusals: the drag that was really a scroll, the one too short to have
 * been meant, and the one that started in the strip the browser has already
 * claimed. Getting any of those wrong is not a gesture that feels rough, it is
 * a chart that can no longer be panned.
 *
 * The half that needs a real browser is in `e2e/mobile.spec.ts`, which measures
 * `pannableAncestor` against a page that has actually been laid out.
 */

/** The four tabs on the bar, in the order a thumb moves through them. */
const ORDER: readonly NavHref[] = ['/', '/laporan', '/catat', '/tinjau']

/* A drag long enough and level enough to count, so each test below changes one
   thing about it rather than restating a whole gesture. */
const FAR = 80
const LEVEL = 0

describe('swipeTarget', () => {
  it('moves to the next tab when the finger goes left, and back when it goes right', () => {
    expect(swipeTarget(ORDER, '/laporan', -FAR, LEVEL)).toBe('/catat')
    expect(swipeTarget(ORDER, '/laporan', FAR, LEVEL)).toBe('/')
  })

  it('holds at both ends of the row rather than wrapping around', () => {
    // Wrapping would send the first tab to the last, which reads as the page
    // jumping backwards for anybody who swiped one too many times.
    expect(swipeTarget(ORDER, '/', FAR, LEVEL)).toBeNull()
    expect(swipeTarget(ORDER, '/tinjau', -FAR, LEVEL)).toBeNull()
  })

  it('ignores a drag too short to have been meant', () => {
    expect(swipeTarget(ORDER, '/laporan', -63, LEVEL)).toBeNull()
    expect(swipeTarget(ORDER, '/laporan', -64, LEVEL)).toBe('/catat')
  })

  it('ignores a drag that was mostly down the page, because that is a scroll', () => {
    // Reading a long ledger with a thumb is never perfectly vertical, so the
    // test is a ratio rather than a straight line.
    expect(swipeTarget(ORDER, '/laporan', -80, 41)).toBeNull()
    expect(swipeTarget(ORDER, '/laporan', -80, 39)).toBe('/catat')
  })

  it('treats a diagonal the same in both directions', () => {
    expect(swipeTarget(ORDER, '/laporan', -80, -41)).toBeNull()
    expect(swipeTarget(ORDER, '/laporan', 80, 41)).toBeNull()
  })

  it('goes nowhere from a page that is not on the bar', () => {
    // Reached from a row rather than a tab, so it has no neighbours. Swiping
    // here used to walk off the front of the list.
    expect(swipeTarget(ORDER, '/transaksi', -FAR, LEVEL)).toBeNull()
    expect(swipeTarget(ORDER, '/pengaturan', FAR, LEVEL)).toBeNull()
  })

  it('goes nowhere when the finger did not move', () => {
    expect(swipeTarget(ORDER, '/laporan', 0, 0)).toBeNull()
  })
})

describe('inEdgeStrip', () => {
  const WIDTH = 390

  it('declines the strips the browser keeps for its own back and forward', () => {
    expect(inEdgeStrip(0, WIDTH)).toBe(true)
    expect(inEdgeStrip(WIDTH, WIDTH)).toBe(true)
  })

  it('leaves the rest of the screen alone', () => {
    expect(inEdgeStrip(WIDTH / 2, WIDTH)).toBe(false)
    expect(inEdgeStrip(EDGE, WIDTH)).toBe(false)
    expect(inEdgeStrip(WIDTH - EDGE, WIDTH)).toBe(false)
  })

  it('still leaves somewhere to start on the narrowest phone anybody has', () => {
    // Both strips out of 320px has to leave a usable middle, or the gesture is
    // simply absent on a small screen instead of being declined on purpose.
    expect(320 - EDGE * 2).toBeGreaterThan(64)
  })
})
