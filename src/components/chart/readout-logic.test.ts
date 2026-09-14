import { describe, expect, it } from 'vitest'
import { contentFrom, positionFor } from './readout-logic'

describe('contentFrom', () => {
  it('reads both facts off a dataset that carries them', () => {
    expect(contentFrom({ readoutLabel: 'Gaji ke Tabungan', readoutValue: 'Rp1.500.000' })).toEqual({
      label: 'Gaji ke Tabungan',
      value: 'Rp1.500.000',
    })
  })

  it('is nothing when the label is missing', () => {
    expect(contentFrom({ readoutValue: 'Rp1.500.000' })).toBeNull()
  })

  it('is nothing when the value is missing', () => {
    expect(contentFrom({ readoutLabel: 'Gaji' })).toBeNull()
  })

  it('is nothing off a mark that carries neither', () => {
    expect(contentFrom({ ribbon: 'a-b' })).toBeNull()
  })
})

describe('positionFor', () => {
  it('centres above a mark with room on every side', () => {
    const out = positionFor({ left: 400, top: 200, width: 40 }, 1200)
    expect(out).toEqual({ x: 420, y: 200 })
  })

  it('clamps to the left margin near the left edge of the viewport', () => {
    const out = positionFor({ left: 0, top: 200, width: 20 }, 1200)
    expect(out.x).toBe(80)
  })

  it('clamps to the right margin near the right edge of the viewport', () => {
    const out = positionFor({ left: 1180, top: 200, width: 20 }, 1200)
    expect(out.x).toBe(1120)
  })

  it('never sits above a floor near the top of the viewport', () => {
    const out = positionFor({ left: 400, top: 10, width: 40 }, 1200)
    expect(out.y).toBe(48)
  })

  it('keeps the clamp sane on a viewport narrower than twice the margin', () => {
    const out = positionFor({ left: 40, top: 200, width: 20 }, 100)
    expect(out.x).toBe(20)
  })
})
