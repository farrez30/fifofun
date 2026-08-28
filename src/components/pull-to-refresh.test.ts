import { describe, expect, it } from 'vitest'
import { pullDistance, THRESHOLD } from './pull-to-refresh'

/**
 * How far a finger has to travel before letting go means anything.
 *
 * The indicator resists, so the distance the finger moves and the distance the
 * indicator moves are not the same number. Two constants sit either side of
 * that and neither of them says what the finger actually has to do, which is
 * the sort of thing that quietly becomes a gesture nobody can trigger.
 */

describe('pullDistance', () => {
  it('asks the finger for twice what the indicator shows', () => {
    // The number that matters and that neither constant states: 144px of
    // travel. Comfortably reachable with a thumb, and far enough that reading
    // the top of a page never trips it.
    expect(pullDistance(143)).toBeLessThan(THRESHOLD)
    expect(pullDistance(144)).toBeGreaterThanOrEqual(THRESHOLD)
  })

  it('stops following the finger rather than being dragged down the screen', () => {
    expect(pullDistance(400)).toBe(pullDistance(4000))
  })

  it('keeps the indicator clear of the halfway mark on the shortest phone', () => {
    // 568px is the iPhone SE. An indicator that can be pulled into the middle
    // of the screen stops reading as something attached to the top edge.
    expect(pullDistance(Number.MAX_SAFE_INTEGER)).toBeLessThan(568 / 2)
  })

  it('gives nothing back for a finger going the other way', () => {
    // Upward is a scroll. Without this the indicator followed a negative
    // distance and translated itself off the top of the screen.
    expect(pullDistance(-50)).toBe(0)
    expect(pullDistance(0)).toBe(0)
  })
})
