import { describe, expect, it } from 'vitest'
import { slideIndex } from './stat-carousel'

describe('slideIndex', () => {
  it('rounds mid-scroll to the nearest slide', () => {
    expect(slideIndex(0, 300, 4)).toBe(0)
    expect(slideIndex(149, 300, 4)).toBe(0)
    expect(slideIndex(151, 300, 4)).toBe(1)
    expect(slideIndex(600, 300, 4)).toBe(2)
  })

  it('clamps at both ends, overscroll included', () => {
    expect(slideIndex(-40, 300, 4)).toBe(0)
    expect(slideIndex(2000, 300, 4)).toBe(3)
  })

  it('answers zero for a deck that has no layout yet', () => {
    expect(slideIndex(120, 0, 4)).toBe(0)
    expect(slideIndex(120, 300, 0)).toBe(0)
  })
})
