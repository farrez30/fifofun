import { describe, expect, it } from 'vitest'
import { clamp, slotAt, slotFraction } from './drag-axis'

/**
 * The arithmetic behind the draggable markers, tested without a browser.
 *
 * Everything that went wrong while building this was arithmetic: markers half a
 * column off at both ends, and a drag landing three years from where the pointer
 * was. Neither needed a DOM to reproduce once the sums were separated from the
 * event handling.
 */

// Twenty seven calendar years, the span of two children through university.
const COUNT = 27

describe('slotFraction', () => {
  it('centres a marker in its column rather than on its edge', () => {
    expect(slotFraction(0, 4)).toBe(0.125)
    expect(slotFraction(3, 4)).toBe(0.875)
  })

  it('keeps the first and last markers inside the track', () => {
    // Dividing by count - 1 would put these at 0 and 1, half a column outside
    // the columns they are supposed to point at.
    expect(slotFraction(0, COUNT)).toBeGreaterThan(0)
    expect(slotFraction(COUNT - 1, COUNT)).toBeLessThan(1)
  })

  it('spaces every column equally', () => {
    const step = slotFraction(1, COUNT) - slotFraction(0, COUNT)
    for (let index = 1; index < COUNT; index++) {
      expect(slotFraction(index, COUNT) - slotFraction(index - 1, COUNT)).toBeCloseTo(step, 12)
    }
  })

  it('holds a marker at the ends rather than letting it leave the track', () => {
    expect(slotFraction(-5, COUNT)).toBe(slotFraction(0, COUNT))
    expect(slotFraction(999, COUNT)).toBe(slotFraction(COUNT - 1, COUNT))
  })

  it('survives an axis with nothing on it', () => {
    expect(slotFraction(0, 0)).toBe(0)
  })
})

describe('slotAt', () => {
  const LEFT = 120
  const WIDTH = 540

  it('finds the slot a pointer is over', () => {
    expect(slotAt(LEFT + WIDTH * 0.7, LEFT, WIDTH, COUNT)).toBe(18)
    expect(slotAt(LEFT + 1, LEFT, WIDTH, COUNT)).toBe(0)
    expect(slotAt(LEFT + WIDTH - 1, LEFT, WIDTH, COUNT)).toBe(COUNT - 1)
  })

  it('round trips against slotFraction', () => {
    // Pointing at where a marker is drawn must select that marker's own slot.
    for (let index = 0; index < COUNT; index++) {
      const x = LEFT + slotFraction(index, COUNT) * WIDTH
      expect(slotAt(x, LEFT, WIDTH, COUNT)).toBe(index)
    }
  })

  it('clamps a pointer dragged past either end', () => {
    expect(slotAt(LEFT - 400, LEFT, WIDTH, COUNT)).toBe(0)
    expect(slotAt(LEFT + WIDTH + 400, LEFT, WIDTH, COUNT)).toBe(COUNT - 1)
  })

  it('does not divide by a track that has not been laid out yet', () => {
    expect(slotAt(300, 0, 0, COUNT)).toBe(0)
    expect(slotAt(300, 0, 500, 0)).toBe(0)
  })
})

describe('clamp', () => {
  it('holds a value inside its range', () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-1, 0, 10)).toBe(0)
    expect(clamp(11, 0, 10)).toBe(10)
  })
})
