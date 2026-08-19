import { describe, expect, it } from 'vitest'
import { EDUCATION_STAGES, INFLATION } from './constants'
import { projectChild, projectFamily, type ChildPlan } from './children'
import { futureValue } from './goals'

const BORN_THIS_YEAR: ChildPlan = { birthYear: 2026, track: 'negeri' }

describe('projectChild', () => {
  it('runs from birth to the end of support', () => {
    const projection = projectChild(BORN_THIS_YEAR, 2026)
    expect(projection.years[0].year).toBe(2026)
    expect(projection.years.at(-1)!.year).toBe(2048) // age 22
    expect(projection.years).toHaveLength(23)
  })

  it('starts each stage at the published age', () => {
    const { stages } = projectChild(BORN_THIS_YEAR, 2026)
    for (const stage of EDUCATION_STAGES) {
      const window = stages.find((s) => s.stage === stage.stage)!
      expect(window.startYear).toBe(2026 + stage.entryAge)
      expect(window.endYear).toBe(2026 + stage.entryAge + stage.durationYears - 1)
    }
  })

  it('charges an entry fee once, in the year the stage begins', () => {
    const projection = projectChild(BORN_THIS_YEAR, 2026)
    const withFees = projection.years.filter((y) => y.entryFee > 0n)
    expect(withFees).toHaveLength(EDUCATION_STAGES.length)
    expect(withFees.map((y) => y.age)).toEqual(EDUCATION_STAGES.map((s) => s.entryAge))
  })

  it('inflates education faster than living costs', () => {
    const projection = projectChild(BORN_THIS_YEAR, 2026)
    const first = projection.years[0]
    const universityYear = projection.years.find((y) => y.age === 18)!

    const livingGrowth = Number(universityYear.living) / Number(first.living)
    const educationGrowth = Number(universityYear.entryFee) / Number(EDUCATION_STAGES[4].entryFee)

    expect(educationGrowth).toBeGreaterThan(livingGrowth * 2)
  })

  it('prices the university entry fee at education inflation, not general', () => {
    const projection = projectChild(BORN_THIS_YEAR, 2026)
    const kuliah = projection.stages.find((s) => s.stage === 'kuliah')!
    const base = EDUCATION_STAGES.find((s) => s.stage === 'kuliah')!.entryFee

    expect(kuliah.entryFee).toBe(futureValue(base, INFLATION.education.default.value, 18))
    // Using general inflation instead would understate it by a wide margin.
    expect(kuliah.entryFee).toBeGreaterThan(futureValue(base, INFLATION.general.value, 18) * 2n)
  })

  it('makes the private track cost more than the state one', () => {
    const negeri = projectChild(BORN_THIS_YEAR, 2026)
    const swasta = projectChild({ ...BORN_THIS_YEAR, track: 'swasta' }, 2026)
    expect(swasta.totalNominal).toBeGreaterThan(negeri.totalNominal)
  })

  it('lets a real quote replace the default', () => {
    const quoted = projectChild(
      { ...BORN_THIS_YEAR, overrides: { sd: { entryFee: 50_000_000_00n } } },
      2026,
    )
    const plain = projectChild(BORN_THIS_YEAR, 2026)
    expect(quoted.totalNominal).toBeGreaterThan(plain.totalNominal)

    const sd = quoted.stages.find((s) => s.stage === 'sd')!
    expect(sd.entryFee).toBe(futureValue(50_000_000_00n, INFLATION.education.default.value, 6))
  })

  it('reports the worst single year, not just the total', () => {
    const projection = projectChild(BORN_THIS_YEAR, 2026)
    expect(projection.peakYear).not.toBeNull()
    const worst = Math.max(...projection.years.map((y) => Number(y.total)))
    expect(Number(projection.peakYear!.total)).toBe(worst)
    // The peak is a university year, because that is where fees and annual costs
    // are both at their highest.
    expect(projection.peakYear!.stage).toBe('kuliah')
  })

  it('states the total in present value as well as nominal', () => {
    const projection = projectChild(BORN_THIS_YEAR, 2026)
    expect(projection.totalPresentValue).toBeLessThan(projection.totalNominal)
    expect(projection.totalPresentValue).toBeGreaterThan(0n)
  })

  it('charges delivery in the birth year and nothing later', () => {
    const future = projectChild({ ...BORN_THIS_YEAR, birthYear: 2030 }, 2026)
    expect(future.birthCost).toBeGreaterThan(0n)

    const past = projectChild({ ...BORN_THIS_YEAR, birthYear: 2020 }, 2026)
    expect(past.birthCost).toBe(0n)
  })

  it('makes a caesarean cost more than a normal delivery', () => {
    const normal = projectChild({ ...BORN_THIS_YEAR, delivery: 'normal' }, 2026)
    const caesar = projectChild({ ...BORN_THIS_YEAR, delivery: 'caesar' }, 2026)
    const bpjs = projectChild({ ...BORN_THIS_YEAR, delivery: 'bpjs' }, 2026)

    expect(caesar.birthCost).toBeGreaterThan(normal.birthCost)
    expect(bpjs.birthCost).toBeLessThan(normal.birthCost)
  })

  it('skips years already in the past', () => {
    const older = projectChild({ ...BORN_THIS_YEAR, birthYear: 2016 }, 2026)
    expect(older.years[0].year).toBe(2026)
    expect(older.years[0].age).toBe(10)
  })

  it('honours a shorter support horizon', () => {
    const projection = projectChild({ ...BORN_THIS_YEAR, supportUntilAge: 18 }, 2026)
    expect(projection.years.at(-1)!.age).toBe(18)
  })
})

describe('projectFamily', () => {
  it('adds the children together year by year', () => {
    const family = projectFamily(
      [
        { birthYear: 2026, track: 'negeri' },
        { birthYear: 2030, track: 'negeri' },
      ],
      2026,
    )
    const year = family.years.find((y) => y.year === 2036)!
    expect(Object.keys(year.byChild)).toEqual(['Anak 1', 'Anak 2'])
    expect(year.total).toBe(Object.values(year.byChild).reduce((a, b) => a + b, 0n))
  })

  it('finds no clash at four years apart', () => {
    const family = projectFamily(
      [
        { birthYear: 2026, track: 'negeri' },
        { birthYear: 2030, track: 'negeri' },
      ],
      2026,
    )
    expect(family.crunchYears).toHaveLength(0)
  })

  it('finds the clash at three years apart', () => {
    // The elder starts SMA the same year the younger starts SMP, and later the
    // elder starts university the same year the younger starts SMA.
    const family = projectFamily(
      [
        { birthYear: 2026, track: 'negeri' },
        { birthYear: 2029, track: 'negeri' },
      ],
      2026,
    )
    expect(family.crunchYears.length).toBeGreaterThan(0)
    for (const crunch of family.crunchYears) {
      expect(crunch.collisions).toBeGreaterThan(1)
      expect(crunch.entryFees.length).toBe(crunch.collisions)
    }
  })

  it('uses the label given to a child', () => {
    const family = projectFamily([{ label: 'Sulung', birthYear: 2026, track: 'negeri' }], 2026)
    expect(Object.keys(family.years[0].byChild)).toEqual(['Sulung'])
  })

  it('includes the birth cost in the year of birth', () => {
    const family = projectFamily([{ birthYear: 2030, track: 'negeri' }], 2026)
    const birthYear = family.years.find((y) => y.year === 2030)!
    const other = family.years.find((y) => y.year === 2031)!
    expect(birthYear.total).toBeGreaterThan(other.total)
  })

  it('reports an average monthly figure that squares with the total', () => {
    const family = projectFamily([{ birthYear: 2026, track: 'negeri' }], 2026)
    expect(family.averageMonthly).toBe(family.totalNominal / BigInt(family.years.length * 12))
  })

  it('handles no children at all', () => {
    const family = projectFamily([], 2026)
    expect(family.years).toEqual([])
    expect(family.totalNominal).toBe(0n)
    expect(family.peakYear).toBeNull()
    expect(family.averageMonthly).toBe(0n)
  })
})
