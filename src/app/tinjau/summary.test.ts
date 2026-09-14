import { describe, expect, it } from 'vitest'
import { summariseQueue } from './summary'

function group(overrides: Partial<Parameters<typeof summariseQueue>[1][number]> = {}) {
  return {
    count: 1,
    total: 100_00n,
    direction: 'out' as const,
    firstAt: new Date('2026-07-01T00:00:00.000Z'),
    lastAt: new Date('2026-07-01T00:00:00.000Z'),
    ...overrides,
  }
}

describe('summariseQueue', () => {
  it('splits out and in into separate signed totals', () => {
    const out = summariseQueue(3, [
      group({ count: 2, total: 300_00n, direction: 'out' }),
      group({ count: 1, total: 50_00n, direction: 'in' }),
    ])
    expect(out.out).toEqual({ count: 2, total: 300_00n })
    expect(out.in).toEqual({ count: 1, total: 50_00n })
    expect(out.count).toBe(3)
  })

  it('never mixes a transfer-direction group into either total', () => {
    const out = summariseQueue(1, [group({ count: 1, total: 10_00n, direction: 'neither' })])
    expect(out.out).toEqual({ count: 0, total: 0n })
    expect(out.in).toEqual({ count: 0, total: 0n })
    // Still counted as shown, just not attributed to a direction.
    expect(out.count).toBe(1)
  })

  it('spans the earliest and latest month across all groups, Jakarta time', () => {
    const out = summariseQueue(2, [
      group({ firstAt: new Date('2024-12-31T17:30:00.000Z'), lastAt: new Date('2024-12-31T17:30:00.000Z') }),
      group({ firstAt: new Date('2026-07-15T00:00:00.000Z'), lastAt: new Date('2026-07-15T00:00:00.000Z') }),
    ])
    // 2024-12-31T17:30Z is 2025-01-01T00:30 in Jakarta.
    expect(out.range).toEqual({ from: '2025-01', to: '2026-07' })
  })

  it('collapses to one month when every group falls in it', () => {
    const out = summariseQueue(1, [group()])
    expect(out.range).toEqual({ from: '2026-07', to: '2026-07' })
  })

  it('reports null range with no groups', () => {
    expect(summariseQueue(0, []).range).toBeNull()
  })

  it('counts pending rows with no group of their own as unseen', () => {
    const out = summariseQueue(10, [group({ count: 6 })])
    expect(out.unseen).toBe(4)
  })

  it('never goes negative when groups somehow outnumber pending', () => {
    const out = summariseQueue(1, [group({ count: 3 })])
    expect(out.unseen).toBe(0)
  })
})
