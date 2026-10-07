import { describe, expect, it } from 'vitest'
import {
  counterName,
  covers,
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

  it('keys a personal QRIS by its owner, not by the bank it lands in', () => {
    const tent = qr('Bank BCA', 10_200_000n, '2026-07-04T12:38:00Z', {
      rawDescription: 'Transfer QR ke Bank BCA\nNENENG SETIARA\nNo. Ref. 607046280483',
    })
    expect(placeKey(tent)).toBe('neneng setiara')
    expect(counterName(tent)).toBe('NENENG SETIARA')
    // Waiting under the owner's name too, so the search box gets something to search.
    expect(summarisePlaces([tent], []).unplaced[0].label).toBe('NENENG SETIARA')
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

  it('lets a home utility paid online have a place, but not an ordinary biller', () => {
    const token = qr('PLN Iconpay', 101_750n, '2026-09-29T05:00:00Z', {
      rawDescription: `Pembayaran PLN Iconpay${String.fromCharCode(10)}8875510024695093`,
    })
    const pulsa = qr('IM3 Ooredoo', 50_000n, '2026-09-29T05:00:00Z', {
      rawDescription: `Pembayaran IM3 Ooredoo${String.fromCharCode(10)}0812`,
    })
    expect(placeKey(token)).toBe('pln iconpay')
    expect(placeKey(pulsa)).toBeNull()
  })

  it('keys a card payment online by the site, so a booking can be put where it was for', () => {
    const agoda = qr('AGODA.COM A', 258_791_00n, '2025-12-09T18:54:00Z', {
      rawDescription: `Transaksi e-Commerce${String.fromCharCode(10)}VAP-AGODA.COM A`,
    })
    expect(placeKey(agoda)).toBe('agoda.com a')
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

  it('leaves bills out unless asked, or unless a bill category is picked by name', () => {
    const token = qr('AEROPOLIS TOKEN', 20_000_000n, '2026-03-02T05:00:00Z', { cashflow: 'bills', categoryName: 'Listrik' })
    const lunch = qr('BOGA RASAA', 25_000n, '2026-03-02T05:00:00Z')
    const aeropolis: PlaceLocation = { merchantKey: 'aeropolis token', label: 'Aeropolis', address: null, lat: -6.14, lng: 106.63 }

    const plain = summarisePlaces([token, lunch], [BOGA, aeropolis])
    expect(plain.places.map((place) => place.merchantKey)).toEqual(['boga rasaa'])
    expect(plain.spent).toBe(25_000n)

    expect(summarisePlaces([token, lunch], [BOGA, aeropolis], { includeBills: true }).places).toHaveLength(2)
    expect(summarisePlaces([token, lunch], [BOGA, aeropolis], { categories: ['Listrik'] }).placed).toBe(20_000_000n)
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

describe('points over time', () => {
  // PLN Iconpay: a house in Jatiasih until the end of 2025, a boarding house
  // in Joglo from June 2026, and nothing bought through it in between.
  const pln = (at: string, amount: bigint) =>
    qr('PLN Iconpay', amount, at, {
      // The real statement text: a biller payment with a reference that changes
      // every time, never the meter number.
      rawDescription: `Pembayaran PLN Iconpay${String.fromCharCode(10)}8875510024695093`,
      cashflow: 'bills',
      categoryName: 'Listrik',
    })
  const house: PlaceLocation = {
    id: 'house',
    merchantKey: 'pln iconpay',
    label: 'Rumah Jatiasih',
    address: null,
    lat: -6.289,
    lng: 106.943,
    validTo: '2025-12-31',
  }
  const kost: PlaceLocation = {
    id: 'kost',
    merchantKey: 'pln iconpay',
    label: 'Tata Kost',
    address: null,
    lat: -6.215,
    lng: 106.737,
    validFrom: '2026-06-01',
  }
  const entries = [
    pln('2025-11-12T17:30:00Z', 50_000_00n),
    pln('2026-03-01T05:00:00Z', 20_000_00n),
    pln('2026-08-10T05:00:00Z', 10_000_00n),
  ]

  it('puts each purchase at the place it was for', () => {
    const report = summarisePlaces(entries, [house, kost], { includeBills: true })
    expect(report.places.map((place) => [place.pointId, place.label, place.total])).toEqual([
      ['house', 'Rumah Jatiasih', 50_000_00n],
      ['kost', 'Tata Kost', 10_000_00n],
    ])
  })

  it('leaves a purchase outside every period waiting, not on the wrong house', () => {
    const report = summarisePlaces(entries, [house, kost], { includeBills: true })
    expect(report.unplaced).toEqual([expect.objectContaining({ merchantKey: 'pln iconpay', total: 20_000_00n })])
  })

  it('reads the day in Jakarta: 31 Dec 23.30 WIB still belongs to the house', () => {
    expect(covers(house, '2025-12-31')).toBe(true)
    const lateNight = pln('2025-12-31T16:30:00Z', 1_000_00n)
    expect(summarisePlaces([lateNight], [house, kost], { includeBills: true }).places[0].pointId).toBe('house')
  })

  it('prefers a dated point over an open-ended one on its days', () => {
    const always: PlaceLocation = { id: 'always', merchantKey: 'pln iconpay', label: 'Di mana saja', address: null, lat: -6, lng: 106 }
    const report = summarisePlaces(entries, [always, kost], { includeBills: true })
    expect(report.places.map((place) => [place.pointId, place.visits])).toEqual([
      ['always', 2],
      ['kost', 1],
    ])
  })
})

describe('online card payments', () => {
  // A homestay in Pangandaran, paid on Agoda at 01.54 WIB on 10 Dec 2025 for
  // the night of the 13th. The bank only ever names the site.
  const agoda = qr('AGODA.COM A', 258_791_00n, '2025-12-09T18:54:00Z', {
    rawDescription: `Transaksi e-Commerce${String.fromCharCode(10)}VAP-AGODA.COM A`,
    categoryName: 'Jalan-jalan',
  })
  const homestay: PlaceLocation = {
    id: 'adams',
    merchantKey: 'agoda.com a',
    label: 'Adams Home Stay',
    address: null,
    lat: -7.6908,
    lng: 108.6487,
    validFrom: '2025-12-10',
    validTo: '2025-12-10',
  }

  it('stays online, not in the queue, until somebody gives it a point', () => {
    const report = summarisePlaces([agoda], [])
    expect(report.unplaced).toEqual([])
    expect(report.unplaceable).toBe(258_791_00n)
  })

  it('is drawn where the booking was for, on the Jakarta day it was paid', () => {
    const report = summarisePlaces([agoda], [homestay])
    expect(report.places.map((place) => [place.label, place.total])).toEqual([['Adams Home Stay', 258_791_00n]])
    expect(report.unplaceable).toBe(0n)
  })

  it('goes back online, not into the queue, on a day its point does not cover', () => {
    const nextBooking = { ...agoda, id: 'next', occurredAt: new Date('2026-03-01T05:00:00Z') }
    const report = summarisePlaces([agoda, nextBooking], [homestay])
    expect(report.unplaced).toEqual([])
    expect(report.placed).toBe(258_791_00n)
    expect(report.unplaceable).toBe(258_791_00n)
  })
})

