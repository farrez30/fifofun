import { describe, expect, it } from 'vitest'
import { CHILD_SPACING, SCHOOL_ENTRY_AGES } from './constants'
import { analyseSpacing, collisionsAt, recommendSpacing } from './spacing'

describe('collisionsAt', () => {
  it('finds a clash exactly when the spacing equals a gap between entry ages', () => {
    // SMA at 15 and SMP at 12 are three years apart, so children three years
    // apart start those two stages in the same calendar year.
    const three = collisionsAt(3)
    expect(three.length).toBeGreaterThan(0)
    for (const clash of three) {
      expect(clash.elderAge - clash.youngerAge).toBe(3)
    }
  })

  it('finds nothing at a spacing that matches no gap', () => {
    expect(collisionsAt(4)).toEqual([])
    expect(collisionsAt(5)).toEqual([])
  })

  it('agrees with the entry ages it is derived from', () => {
    // Every difference between two entry ages, computed independently here.
    const ages = Object.values(SCHOOL_ENTRY_AGES)
    const expected = new Set<number>()
    for (const elder of ages) {
      for (const younger of ages) {
        if (elder > younger) expected.add(elder - younger)
      }
    }

    const found = new Set(
      Array.from({ length: 20 }, (_, i) => i + 1).filter((years) => collisionsAt(years).length > 0),
    )
    expect([...found].sort((a, b) => a - b)).toEqual([...expected].sort((a, b) => a - b))
  })

  it('produces the documented collision set', () => {
    // Stated explicitly so a change to the schooling ages fails loudly here
    // rather than silently altering the recommendation.
    const collides = Array.from({ length: 15 }, (_, i) => i + 1).filter(
      (years) => collisionsAt(years).length > 0,
    )
    expect(collides).toEqual([2, 3, 6, 8, 9, 11, 12, 14])
  })

  it('puts the heaviest clash first', () => {
    const clashes = collisionsAt(3)
    const fees = clashes.map((c) => Number(c.combinedFee))
    expect([...fees].sort((a, b) => b - a)).toEqual(fees)
  })

  it('scales the clash with the school track', () => {
    const negeri = collisionsAt(3, 'negeri')[0]
    const swasta = collisionsAt(3, 'swasta')[0]
    expect(swasta.combinedFee).toBeGreaterThan(negeri.combinedFee)
  })
})

describe('analyseSpacing', () => {
  it('covers every spacing up to the limit', () => {
    const options = analyseSpacing(15)
    expect(options).toHaveLength(15)
    expect(options.map((o) => o.years)).toEqual(Array.from({ length: 15 }, (_, i) => i + 1))
  })

  it('rules out anything under the health minimum, clash or no clash', () => {
    const minimum = CHILD_SPACING.healthMinimumYears.value
    for (const option of analyseSpacing(15)) {
      if (option.years < minimum) {
        expect(option.verdict).toBe('avoid')
        expect(option.meetsHealthMinimum).toBe(false)
      }
    }
  })

  it('marks a one-year spacing as avoid even though no fees clash', () => {
    const one = analyseSpacing(15).find((o) => o.years === 1)!
    expect(one.collisions).toEqual([])
    expect(one.verdict).toBe('avoid')
    expect(one.reason).toMatch(/BKKBN/)
  })

  it('calls four and five years ideal', () => {
    const options = analyseSpacing(15)
    expect(options.find((o) => o.years === 4)!.verdict).toBe('ideal')
    expect(options.find((o) => o.years === 5)!.verdict).toBe('ideal')
  })

  it('calls the popular three-year spacing avoid, and says why', () => {
    const three = analyseSpacing(15).find((o) => o.years === 3)!
    expect(three.meetsHealthMinimum).toBe(true)
    expect(three.withinIdealRange).toBe(true)
    expect(three.verdict).toBe('avoid')
    expect(three.collisions.length).toBeGreaterThan(0)
    expect(three.worstCollisionFee).toBeGreaterThan(0n)
  })

  it('calls a wide clash-free spacing workable rather than ideal', () => {
    const seven = analyseSpacing(15).find((o) => o.years === 7)!
    expect(seven.collisions).toEqual([])
    expect(seven.withinIdealRange).toBe(false)
    expect(seven.verdict).toBe('workable')
  })

  it('explains every option', () => {
    for (const option of analyseSpacing(15)) {
      expect(option.reason.length).toBeGreaterThan(60)
    }
  })

  it('reports zero as the worst fee where nothing clashes', () => {
    const four = analyseSpacing(15).find((o) => o.years === 4)!
    expect(four.worstCollisionFee).toBe(0n)
  })
})

describe('recommendSpacing', () => {
  it('lands on four and five years', () => {
    expect(recommendSpacing().ideal).toEqual([4, 5])
  })

  it('lists every clash-free spacing that also clears the health minimum', () => {
    // The widest gap between two entry ages is 18 − 4 = 14, so nothing past 14
    // can ever clash and 15 is safe for a reason that has nothing to do with
    // planning. The interesting range is the one where a clash is possible.
    expect(recommendSpacing(14).recommended).toEqual([4, 5, 7, 10, 13])
    expect(recommendSpacing(15).recommended).toEqual([4, 5, 7, 10, 13, 15])
  })

  it('lists the spacings that collide', () => {
    expect(recommendSpacing().collides).toEqual([2, 3, 6, 8, 9, 11, 12, 14])
  })

  it('never recommends a spacing it also flags as colliding', () => {
    const { recommended, collides } = recommendSpacing()
    expect(recommended.filter((years) => collides.includes(years))).toEqual([])
  })

  it('explains the recommendation rather than just asserting it', () => {
    const reason = recommendSpacing().reason
    expect(reason).toMatch(/4, 5/)
    expect(reason).toMatch(/kesehatan/)
  })
})
