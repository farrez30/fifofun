import { describe, expect, it } from 'vitest'
import { subtractSettled } from './optimistic'

const GROUPS = [
  { key: 'a', count: 3, total: 150_000_00n },
  { key: 'b', count: 2, total: 80_000_00n },
  { key: 'c', count: 5, total: 999_999_99n },
]

describe('subtractSettled', () => {
  it('leaves the figures alone while nothing is settling', () => {
    const out = subtractSettled({ count: 10, total: 1_229_999_99n }, GROUPS, [])
    expect(out).toEqual({ count: 10, total: 1_229_999_99n })
  })

  it('subtracts exactly the settling groups, in bigint', () => {
    const out = subtractSettled({ count: 10, total: 1_229_999_99n }, GROUPS, ['a', 'c'])
    expect(out.count).toBe(2)
    expect(out.total).toBe(1_229_999_99n - 150_000_00n - 999_999_99n)
  })

  it('ignores keys that name no group', () => {
    const out = subtractSettled({ count: 10, total: 1_000_00n }, GROUPS, ['z'])
    expect(out).toEqual({ count: 10, total: 1_000_00n })
  })

  it('clamps both figures at zero when a partial settle overshoots', () => {
    const out = subtractSettled({ count: 2, total: 100_00n }, GROUPS, ['a', 'b'])
    expect(out.count).toBe(0)
    expect(out.total).toBe(0n)
  })
})
