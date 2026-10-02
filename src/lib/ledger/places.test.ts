import { describe, expect, it } from 'vitest'
import {
  dayPartOf,
  merchantName,
  placeKey,
  summarisePlaces,
  weightOf,
  type PlaceEntry,
  type PlaceLocation,
} from './places'

/** Descriptions and raw text below are copied from the household's statements. */

let counter = 0

function qr(description: string, amount: bigint, at: string, overrides: Partial<PlaceEntry> = {}): PlaceEntry {
  counter += 1
  return {
    id: `e${counter}`,
    description,
    rawDescription: `Pembayaran QR\nke ${description}\n41206985${counter}`,
    amount,
    cashflow: 'spending',
    occurredAt: new Date(at),
    categoryName: 'Makan/minum',
    source: 'xlsx',
    ...overrides,
  }
}

const BOGA: PlaceLocation = { merchantKey: 'boga rasaa', label: 'Boga Rasaa', address: 'Tebet', lat: -6.23, lng: 106.85 }
const XXI: PlaceLocation = {
  merchantKey: 'gandaria city xxidel 4416',
  label: 'XXI Gandaria City',
  address: null,
  lat: -6.244,
  lng: 106.783,
}

describe('merchantName', () => {
  it('keeps what a counter payment says after a dash', () => {
    expect(merchantName('024 - VIVO CIDENG')).toBe('024 - VIVO CIDENG')
    expect(merchantName('YOUTAP - MCD SALEMBA RAYA')).toBe('YOUTAP - MCD SALEMBA RAYA')
    expect(merchantName('ALGO MIDI - BITUNG - QRIS')).toBe('ALGO MIDI - BITUNG')
  })

  it('keeps the outlet number that tells two stations apart', () => {
    expect(merchantName('SPBU 34-13603')).not.toBe(merchantName('SPBU 34-43114'))
  })
})

describe('placeKey', () => {
  it('keys a QRIS payment by its merchant', () => {
    expect(placeKey(qr('BOGA RASAA', 25_000n, '2026-03-02T05:00:00Z'))).toBe('boga rasaa')
    expect(placeKey(qr('SUPERINDO JTK QR - QRIS', 278_580n, '2026-03-02T05:00:00Z'))).toBe('superindo jtk qr')
  })

  it('has nothing for payments that did not happen at a counter', () => {
    const online = qr('Shopee Indonesia', 120_000n, '2026-03-02T05:00:00Z', {
      rawDescription: 'Pembayaran Shopee Indonesia\n8800123',
    })
    const transfer = qr('Balqis', 50_000n, '2026-03-02T05:00:00Z', {
      rawDescription: 'Transfer ke BANK MANDIRI\nBalqis',
    })
    expect(placeKey(online)).toBeNull()
    expect(placeKey(transfer)).toBeNull()
  })

  it('refuses cashier software on its own but not an outlet behind it', () => {
    expect(placeKey(qr('PAWOON', 51_500n, '2026-03-02T05:00:00Z'))).toBeNull()
    expect(placeKey(qr('IDM QRIS LIVIN', 30_000n, '2026-03-02T05:00:00Z'))).toBeNull()
    expect(placeKey(qr('ESB RESTAURANT TECHNOLOGY', 227_000n, '2026-03-02T05:00:00Z'))).toBeNull()
    expect(placeKey(qr('YOUTAP - MCD SALEMBA RAYA', 138_000n, '2026-03-02T05:00:00Z'))).toBe(
      'youtap - mcd salemba raya',
    )
  })

  it('places a manual entry by its counterparty, without the note', () => {
    const manual = qr('Warung Bu Tini - makan siang', 18_000n, '2026-03-02T05:00:00Z', {
      rawDescription: null,
      source: 'manual',
    })
    expect(placeKey(manual)).toBe('warung bu tini')
  })

  it('has nothing for money that only moved or was never seen leaving', () => {
    const base = qr('BOGA RASAA', 25_000n, '2026-03-02T05:00:00Z')
    expect(placeKey({ ...base, cashflow: 'income' })).toBeNull()
    expect(placeKey({ ...base, isPassThrough: true })).toBeNull()
    expect(
      placeKey({ ...base, source: 'manual', rawDescription: null, categoryName: 'Penyesuaian Spending' }),
    ).toBeNull()
  })
})

describe('dayPartOf', () => {
  it('reads the hour in Jakarta, not UTC', () => {
    expect(dayPartOf(new Date('2026-03-02T00:30:00Z'))).toBe('pagi') // 07.30 WIB
    expect(dayPartOf(new Date('2026-03-02T05:00:00Z'))).toBe('siang') // 12.00
    expect(dayPartOf(new Date('2026-03-02T10:00:00Z'))).toBe('sore') // 17.00
    expect(dayPartOf(new Date('2026-03-02T14:00:00Z'))).toBe('malam') // 21.00
    expect(dayPartOf(new Date('2026-03-01T20:00:00Z'))).toBe('malam') // 03.00
  })
})

describe('summarisePlaces', () => {
  const entries = [
    qr('BOGA RASAA', 25_000n, '2026-03-02T05:00:00Z'),
    qr('BOGA RASAA', 35_000n, '2026-04-10T13:00:00Z'),
    qr('BOGA RASAA', 30_000n, '2026-05-10T13:00:00Z', { categoryName: 'Dating' }),
    qr('GANDARIA CITY XXIDEL 4416', 200_000n, '2026-06-06T12:00:00Z', { categoryName: 'Dating' }),
    qr('KANSAI DINE', 270_270n, '2026-06-07T06:00:00Z', { categoryName: 'Dating' }),
    qr('PAWOON', 51_500n, '2026-06-08T06:00:00Z'),
    qr('Shopee Indonesia', 120_000n, '2026-06-09T06:00:00Z', {
      rawDescription: 'Pembayaran Shopee Indonesia\n8800123',
      categoryName: 'Belanja Online',
    }),
  ]

  it('splits the money into placed, waiting for a place, and placeless', () => {
    const report = summarisePlaces(entries, [BOGA, XXI])
    expect(report.spent).toBe(731_770n)
    expect(report.placed).toBe(290_000n)
    expect(report.waiting).toBe(270_270n)
    expect(report.unplaceable).toBe(171_500n)
    expect(report.placed + report.waiting + report.unplaceable).toBe(report.spent)
  })

  it('describes each place, biggest first', () => {
    const [xxi, boga] = summarisePlaces(entries, [BOGA, XXI]).places
    expect(xxi.label).toBe('XXI Gandaria City')
    expect(boga).toMatchObject({
      total: 90_000n,
      visits: 3,
      average: 30_000n,
      topCategory: 'Makan/minum',
      dayParts: { pagi: 0, siang: 1, sore: 0, malam: 2 },
    })
    expect(boga.first.toISOString()).toBe('2026-03-02T05:00:00.000Z')
    expect(boga.last.toISOString()).toBe('2026-05-10T13:00:00.000Z')
    expect(boga.recent.map((visit) => visit.amount)).toEqual([30_000n, 35_000n, 25_000n])
  })

  it('lists merchants still waiting for a place, under the name the statement prints', () => {
    const { unplaced } = summarisePlaces(entries, [BOGA, XXI])
    expect(unplaced).toEqual([
      expect.objectContaining({ merchantKey: 'kansai dine', label: 'KANSAI DINE', total: 270_270n, visits: 1 }),
    ])
  })

  it('stops offering a merchant the household said has no place', () => {
    const online: PlaceLocation = { merchantKey: 'kansai dine', label: 'Kansai', address: null, lat: null, lng: null }
    const report = summarisePlaces(entries, [BOGA, XXI, online])
    expect(report.unplaced).toEqual([])
    expect(report.places.map((place) => place.merchantKey)).not.toContain('kansai dine')
    expect(report.unplaceable).toBe(441_770n)
  })

  it('filters by category and by Jakarta month, inclusive', () => {
    const dating = summarisePlaces(entries, [BOGA, XXI], { categories: ['Dating'] })
    expect(dating.spent).toBe(500_270n)
    expect(dating.places.map((place) => [place.merchantKey, place.total])).toEqual([
      ['gandaria city xxidel 4416', 200_000n],
      ['boga rasaa', 30_000n],
    ])

    const spring = summarisePlaces(entries, [BOGA, XXI], { from: '2026-04', to: '2026-05' })
    expect(spring.spent).toBe(65_000n)

    // 31 Mar 20.00 UTC is 1 Apr 03.00 in Jakarta.
    const edge = summarisePlaces([qr('BOGA RASAA', 10_000n, '2026-03-31T20:00:00Z')], [BOGA], { from: '2026-04' })
    expect(edge.placed).toBe(10_000n)
  })

  it('caps the visit list a popup carries', () => {
    const many = Array.from({ length: 20 }, (_, day) =>
      qr('BOGA RASAA', 1_000n, `2026-03-${String(day + 1).padStart(2, '0')}T05:00:00Z`),
    )
    const [boga] = summarisePlaces(many, [BOGA]).places
    expect(boga.visits).toBe(20)
    expect(boga.recent).toHaveLength(12)
  })
})

describe('weightOf', () => {
  const { places } = summarisePlaces(
    [
      qr('BOGA RASAA', 20_000n, '2026-03-02T05:00:00Z'),
      qr('BOGA RASAA', 20_000n, '2026-03-03T05:00:00Z'),
      qr('BOGA RASAA', 20_000n, '2026-03-04T05:00:00Z'),
      qr('GANDARIA CITY XXIDEL 4416', 100_000n, '2026-03-05T05:00:00Z'),
    ],
    [BOGA, XXI],
  )
  const [xxi, boga] = places

  it('weighs by money, by visits or by cost per visit', () => {
    expect([weightOf(xxi, 'total', places), weightOf(boga, 'total', places)]).toEqual([1, 0.6])
    expect([weightOf(xxi, 'visits', places), weightOf(boga, 'visits', places)]).toEqual([1 / 3, 1])
    expect([weightOf(xxi, 'average', places), weightOf(boga, 'average', places)]).toEqual([1, 0.2])
  })
})
