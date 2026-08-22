import { describe, expect, it } from 'vitest'
import { buildQueueOptions, queueHref, toGroupOptions } from './query'

describe('buildQueueOptions', () => {
  it('defaults to the largest amounts grouped by counterparty', () => {
    expect(buildQueueOptions({})).toEqual({ urut: 'nominal', kelompok: 'lawan' })
  })

  it('reads both parameters when they are known', () => {
    expect(buildQueueOptions({ urut: 'waktu', kelompok: 'bulan' })).toEqual({
      urut: 'waktu',
      kelompok: 'bulan',
    })
  })

  it('ignores an unknown value rather than trusting it', () => {
    expect(buildQueueOptions({ urut: 'harga', kelompok: 'minggu' })).toEqual({
      urut: 'nominal',
      kelompok: 'lawan',
    })
  })

  it('takes the first value when a parameter repeats', () => {
    expect(buildQueueOptions({ urut: ['waktu', 'nominal'] }).urut).toBe('waktu')
  })
})

describe('queueHref', () => {
  it('builds a bare path for the defaults', () => {
    expect(queueHref({ urut: 'nominal', kelompok: 'lawan' })).toBe('/tinjau')
  })

  it('keeps the other parameter when one changes', () => {
    expect(queueHref({ urut: 'waktu', kelompok: 'lawan' })).toBe('/tinjau?urut=waktu')
    expect(queueHref({ urut: 'nominal', kelompok: 'bulan' })).toBe('/tinjau?kelompok=bulan')
  })

  it('leaves out an order that grouping by month would ignore', () => {
    expect(queueHref({ urut: 'waktu', kelompok: 'bulan' })).toBe('/tinjau?kelompok=bulan')
  })
})

describe('toGroupOptions', () => {
  it('translates the address bar into what the grouper takes', () => {
    expect(toGroupOptions({ urut: 'nominal', kelompok: 'lawan' })).toEqual({
      by: 'counterparty',
      order: 'money',
    })
    expect(toGroupOptions({ urut: 'waktu', kelompok: 'bulan' })).toEqual({
      by: 'month',
      order: 'time',
    })
  })
})
