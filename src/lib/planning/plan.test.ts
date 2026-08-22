import { describe, expect, it } from 'vitest'
import {
  childPlansFor,
  childPlansFromJson,
  defaultPlan,
  isKnownFramework,
  planFields,
  PLAN_BOUNDS,
} from './plan'

describe('isKnownFramework', () => {
  it('accepts the ids the picker offers and refuses anything else', () => {
    expect(isKnownFramework('ojk-10-20-30-40')).toBe(true)
    expect(isKnownFramework('50-30-20')).toBe(true)
    expect(isKnownFramework('kerangka-karangan')).toBe(false)
  })
})

describe('childPlansFromJson', () => {
  it('reads back what was written', () => {
    const stored = [
      { birthYear: 2027, track: 'negeri' },
      { birthYear: 2031, track: 'swasta' },
    ]
    expect(childPlansFromJson(stored)).toEqual(stored)
  })

  it('drops a malformed child rather than the whole plan', () => {
    const stored = [{ birthYear: 2027, track: 'negeri' }, { birthYear: 'besok' }, null]
    expect(childPlansFromJson(stored)).toEqual([{ birthYear: 2027, track: 'negeri' }])
  })

  it('answers with nothing when the column holds something that is not a list', () => {
    expect(childPlansFromJson(null)).toEqual([])
    expect(childPlansFromJson({ birthYear: 2027 })).toEqual([])
  })

  it('never returns more children than the bounds allow', () => {
    const many = Array.from({ length: 9 }, (_, index) => ({
      birthYear: 2027 + index,
      track: 'negeri' as const,
    }))
    expect(childPlansFromJson(many)).toHaveLength(PLAN_BOUNDS.children.max)
  })
})

describe('childPlansFor', () => {
  it('keeps the children already planned and spaces the new ones four years apart', () => {
    const existing = [{ birthYear: 2020, track: 'swasta' as const }]
    expect(childPlansFor(3, existing, 2026, 'negeri')).toEqual([
      { birthYear: 2020, track: 'swasta' },
      { birthYear: 2031, track: 'negeri' },
      { birthYear: 2035, track: 'negeri' },
    ])
  })

  it('cuts from the end when the count drops', () => {
    const existing = [
      { birthYear: 2027, track: 'negeri' as const },
      { birthYear: 2031, track: 'negeri' as const },
    ]
    expect(childPlansFor(1, existing, 2026, 'negeri')).toEqual([existing[0]])
  })
})

describe('defaultPlan', () => {
  it('aims a fifth of the income at savings', () => {
    expect(defaultPlan(10_000_000_00n, 'zapfin').targetSavings).toBe(2_000_000_00n)
  })

  it('survives a household with no observed income', () => {
    const plan = defaultPlan(0n, 'zapfin')
    expect(plan.income).toBe(0n)
    expect(plan.targetSavings).toBe(0n)
  })
})

describe('planFields', () => {
  it('carries money as plain sen digits and flags as one or zero', () => {
    const fields = planFields({
      ...defaultPlan(8_171_629_00n, 'ojk-10-20-30-40'),
      irregularIncome: true,
      childPlans: [{ birthYear: 2027, track: 'swasta' }],
    })

    expect(fields.income).toBe('817162900')
    expect(fields.irregularIncome).toBe('1')
    expect(fields.wantsZakat).toBe('0')
    expect(fields.childPlans).toBe('[{"birthYear":2027,"track":"swasta"}]')
  })

  it('carries no separators, so the server reads the figure it was sent', () => {
    const fields = planFields(defaultPlan(12_345_678_90n, 'zapfin'))
    for (const value of Object.values(fields)) {
      expect(value).not.toMatch(/[.\s]/)
    }
  })

  it('names every field of the plan', () => {
    const plan = defaultPlan(1_000_000_00n, 'zapfin')
    expect(Object.keys(planFields(plan)).sort()).toEqual(Object.keys(plan).sort())
  })
})
