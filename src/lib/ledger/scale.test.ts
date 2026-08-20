import { describe, expect, it } from 'vitest'
import { parseIdAmount as idr } from '@/lib/money'
import { buildScale, buildSpanScale } from './scale'

describe('buildScale', () => {
  it('rounds the top of the axis to a figure a person would say', () => {
    // The real peak of this household's income series.
    const scale = buildScale(idr('11.437.221,00'))
    expect(scale.top).toBe(idr('12.500.000,00'))
    expect(scale.ticks.map((t) => Number(t) / 100)).toEqual([
      0, 2_500_000, 5_000_000, 7_500_000, 10_000_000, 12_500_000,
    ])
  })

  it('never puts the top below the tallest bar', () => {
    for (const amount of ['1,00', '999,00', '1.000,00', '4.999.999,00', '11.437.221,00']) {
      const scale = buildScale(idr(amount))
      expect(scale.top).toBeGreaterThanOrEqual(idr(amount))
    }
  })

  it('starts at zero and ends at the top, with even steps', () => {
    const scale = buildScale(idr('8.002.215,00'))
    expect(scale.ticks[0]).toBe(0n)
    expect(scale.ticks[scale.ticks.length - 1]).toBe(scale.top)

    const step = scale.ticks[1] - scale.ticks[0]
    for (let i = 1; i < scale.ticks.length; i++) {
      expect(scale.ticks[i] - scale.ticks[i - 1]).toBe(step)
    }
  })

  it('keeps the gridline count near what was asked for', () => {
    for (const amount of ['224.000,00', '3.980.551,31', '11.437.221,00', '431.595.734,00']) {
      const scale = buildScale(idr(amount))
      expect(scale.ticks.length).toBeGreaterThanOrEqual(3)
      expect(scale.ticks.length).toBeLessThanOrEqual(8)
    }
  })

  it('maps a value to its share of the axis', () => {
    const scale = buildScale(idr('10.000.000,00'))
    expect(scale.percentOf(idr('5.000.000,00'))).toBeCloseTo(50, 1)
    expect(scale.percentOf(scale.top)).toBeCloseTo(100, 1)
    expect(scale.percentOf(0n)).toBe(0)
  })

  it('keeps the sign of a negative value, for a chart drawn around zero', () => {
    const scale = buildScale(idr('10.000.000,00'))
    expect(scale.percentOf(idr('-2.500.000,00'))).toBeCloseTo(-25, 1)
  })

  it('gives an empty month an axis rather than dividing by nothing', () => {
    const scale = buildScale(0n)
    expect(scale.top).toBeGreaterThan(0n)
    expect(scale.percentOf(0n)).toBe(0)
    expect(Number.isFinite(scale.percentOf(1n))).toBe(true)
  })
})

describe('buildSpanScale', () => {
  it('keeps zero on a gridline when the range never goes below it', () => {
    const scale = buildSpanScale(0n, idr('11.437.221,00'))
    expect(scale.bottom).toBe(0n)
    expect(scale.ticks).toContain(0n)
    expect(scale.top).toBeGreaterThanOrEqual(idr('11.437.221,00'))
  })

  it('keeps zero on a gridline when the range straddles it', () => {
    const scale = buildSpanScale(-idr('600.000,00'), idr('2.400.000,00'))
    expect(scale.ticks).toContain(0n)
    expect(scale.bottom).toBeLessThanOrEqual(-idr('600.000,00'))
    expect(scale.top).toBeGreaterThanOrEqual(idr('2.400.000,00'))
  })

  it('always includes zero even when every value sits on one side of it', () => {
    const positive = buildSpanScale(idr('4.000.000,00'), idr('5.000.000,00'))
    expect(positive.bottom).toBe(0n)

    const negative = buildSpanScale(-idr('5.000.000,00'), -idr('4.000.000,00'))
    expect(negative.top).toBe(0n)
  })

  it('steps evenly from bottom to top', () => {
    const scale = buildSpanScale(-idr('600.000,00'), idr('11.569.000,00'))
    expect(scale.ticks[0]).toBe(scale.bottom)
    expect(scale.ticks[scale.ticks.length - 1]).toBe(scale.top)

    const step = scale.ticks[1] - scale.ticks[0]
    for (let i = 1; i < scale.ticks.length; i++) {
      expect(scale.ticks[i] - scale.ticks[i - 1]).toBe(step)
    }
  })

  it('measures position from the bottom, not from zero', () => {
    const scale = buildSpanScale(-idr('1.000.000,00'), idr('1.000.000,00'))
    expect(scale.percentOf(scale.bottom)).toBeCloseTo(0, 1)
    expect(scale.percentOf(scale.top)).toBeCloseTo(100, 1)
    expect(scale.percentOf(0n)).toBeCloseTo(50, 1)
  })

  it('gives a month where nothing moved an axis with width', () => {
    const scale = buildSpanScale(0n, 0n)
    expect(scale.top).toBeGreaterThan(scale.bottom)
    expect(Number.isFinite(scale.percentOf(0n))).toBe(true)
  })
})
