import { describe, expect, it } from 'vitest'
import { summarisePlaces, type PlaceEntry } from '@/lib/ledger/places'
import { share, toPoints, toWaiting, usualTime } from './view-model'

function qr(description: string, amount: bigint, at: string): PlaceEntry {
  return {
    id: `${description}-${at}`,
    description,
    rawDescription: `Pembayaran QR\nke ${description}\n412069853568`,
    amount,
    cashflow: 'spending',
    occurredAt: new Date(at),
    categoryName: 'Dating',
    source: 'xlsx',
  }
}

const report = summarisePlaces(
  [
    qr('BOGA RASAA', 2_500_000n, '2026-03-02T13:00:00Z'),
    qr('BOGA RASAA', 3_500_000n, '2026-03-09T13:30:00Z'),
    qr('KANSAI DINE', 27_027_000n, '2026-06-07T06:00:00Z'),
  ],
  [{ id: 'l1', merchantKey: 'boga rasaa', label: 'Boga Rasaa', address: 'Tebet', lat: -6.23, lng: 106.85 }],
)

describe('toPoints', () => {
  it('writes every figure the way the app writes money, for an island that only draws', () => {
    expect(toPoints(report, 'total')).toEqual([
      {
        id: 'l1',
        key: 'boga rasaa',
        label: 'Boga Rasaa',
        address: 'Tebet',
        lat: -6.23,
        lng: 106.85,
        weight: 1,
        total: 'Rp60.000',
        visits: 2,
        average: 'Rp30.000',
        topCategory: 'Dating',
        span: '02 Mar 2026 sampai 09 Mar 2026',
        usualTime: 'malam',
        recent: [
          { date: '09 Mar 2026', amount: 'Rp35.000', category: 'Dating' },
          { date: '02 Mar 2026', amount: 'Rp25.000', category: 'Dating' },
        ],
      },
    ])
  })
})

describe('toWaiting', () => {
  it('lists the merchants still to place', () => {
    expect(toWaiting(report)).toEqual([
      { key: 'kansai dine', label: 'KANSAI DINE', total: 'Rp270.270', visits: 1, last: '07 Jun 2026' },
    ])
  })
})

describe('usualTime', () => {
  it('names a part of the day only when one stands out', () => {
    expect(usualTime({ visits: 3, dayParts: { pagi: 0, siang: 1, sore: 0, malam: 2 } })).toBe('malam')
    expect(usualTime({ visits: 2, dayParts: { pagi: 1, siang: 1, sore: 0, malam: 0 } })).toBeNull()
    expect(usualTime({ visits: 1, dayParts: { pagi: 1, siang: 0, sore: 0, malam: 0 } })).toBeNull()
  })
})

describe('share', () => {
  it('never says everything while something is missing', () => {
    expect(share(999n, 1000n)).toBe(99)
    expect(share(1000n, 1000n)).toBe(100)
    expect(share(1n, 3n)).toBe(33)
    expect(share(0n, 0n)).toBe(0)
  })
})
