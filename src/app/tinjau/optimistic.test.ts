import { describe, expect, it } from 'vitest'
import { subtractSettled } from './optimistic'
import type { QueueSummary } from './summary'

const GROUPS = [
  { key: 'a', count: 3, total: 150_000_00n, direction: 'out' as const },
  { key: 'b', count: 2, total: 80_000_00n, direction: 'out' as const },
  { key: 'c', count: 5, total: 999_999_99n, direction: 'in' as const },
]

function summary(overrides: Partial<QueueSummary> = {}): QueueSummary {
  return {
    count: 10,
    out: { count: 5, total: 230_000_00n },
    in: { count: 5, total: 999_999_99n },
    range: { from: '2026-01', to: '2026-07' },
    unseen: 0,
    ...overrides,
  }
}

describe('subtractSettled', () => {
  it('leaves the figures alone while nothing is settling', () => {
    const out = subtractSettled(summary(), GROUPS, [])
    expect(out).toEqual(summary())
  })

  it('subtracts a settling group only from its own direction, in bigint', () => {
    const out = subtractSettled(summary(), GROUPS, ['a', 'c'])
    expect(out.count).toBe(2)
    expect(out.out).toEqual({ count: 2, total: 230_000_00n - 150_000_00n })
    expect(out.in).toEqual({ count: 0, total: 999_999_99n - 999_999_99n })
  })

  it('ignores keys that name no group', () => {
    const out = subtractSettled(summary({ count: 10, out: { count: 10, total: 1_000_00n } }), GROUPS, ['z'])
    expect(out.out).toEqual({ count: 10, total: 1_000_00n })
  })

  it('clamps every figure at zero when a partial settle overshoots', () => {
    const out = subtractSettled(
      summary({ count: 2, out: { count: 1, total: 100_00n }, in: { count: 0, total: 0n } }),
      GROUPS,
      ['a', 'b'],
    )
    expect(out.count).toBe(0)
    expect(out.out).toEqual({ count: 0, total: 0n })
  })

  it('leaves range and unseen untouched, since they describe shape rather than a running count', () => {
    const out = subtractSettled(summary(), GROUPS, ['a'])
    expect(out.range).toEqual({ from: '2026-01', to: '2026-07' })
    expect(out.unseen).toBe(0)
  })
})
