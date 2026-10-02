import { describe, expect, it } from 'vitest'
import { categoryHue } from '@/lib/ledger/palette'
import { summarisePlaces, type PlaceEntry } from '@/lib/ledger/places'
import { groupLookup, legendGroups, NO_GROUP, share, toPoints, toWaiting, usualTime } from './view-model'

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
    expect(toPoints(report)).toEqual([
      {
        id: 'l1',
        pointId: 'l1',
        key: 'boga rasaa',
        period: null,
        validFrom: null,
        validTo: null,
        label: 'Boga Rasaa',
        address: 'Tebet',
        lat: -6.23,
        lng: 106.85,
        // Boga Rasaa is the only placed merchant, so it tops every reading.
        weights: { total: 1, visits: 1, average: 1 },
        total: 'Rp60.000',
        visits: 2,
        average: 'Rp30.000',
        topCategory: 'Dating',
        // No categories given: the category stands as its own group.
        group: 'Dating',
        hue: categoryHue({ name: 'Dating', hue: null }),
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

describe('groupLookup', () => {
  const look = groupLookup([
    { id: 'sosial', name: 'Sosial', parentId: null, hue: 263 },
    { id: 'dating', name: 'Dating', parentId: 'sosial', hue: 230 },
    { id: 'edukasi', name: 'Edukasi', parentId: null, hue: 145 },
    { id: 'tagihan', name: 'Tagihan', parentId: null, hue: null },
  ])

  it("rolls a category up to its group, in the group's own hue", () => {
    expect(look('Dating')).toEqual({ group: 'Sosial', hue: 263 })
  })

  it('keeps a category with no group as its own', () => {
    expect(look('Edukasi')).toEqual({ group: 'Edukasi', hue: 145 })
  })

  it('falls back to the palette for a group with no stored hue', () => {
    expect(look('Tagihan')).toEqual({ group: 'Tagihan', hue: categoryHue({ name: 'Tagihan', hue: null }) })
  })

  it('still names something for a category it does not know or no category at all', () => {
    expect(look('Hapus Saya').group).toBe('Hapus Saya')
    expect(look(null).group).toBe(NO_GROUP)
  })

  it('draws the dot in the group the place is in', () => {
    const [point] = toPoints(report, look)
    expect(point).toMatchObject({ topCategory: 'Dating', group: 'Sosial', hue: 263 })
  })
})

describe('legendGroups', () => {
  it('counts the dots per group, most first, ties by name', () => {
    const points = [
      { group: 'Transport', hue: 283 },
      { group: 'Sosial', hue: 263 },
      { group: 'Transport', hue: 283 },
      { group: 'Belanja', hue: 158 },
    ]
    expect(legendGroups(points)).toEqual([
      { name: 'Transport', hue: 283, places: 2 },
      { name: 'Belanja', hue: 158, places: 1 },
      { name: 'Sosial', hue: 263, places: 1 },
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
