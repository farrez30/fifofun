import { describe, expect, it } from 'vitest'
import { billerOf, onlineKey, summariseOnline } from './online'
import type { PlaceEntry } from './places'

/** Raw first lines below are the household's own statement channels. */
function row(description: string, via: string, amount: bigint, overrides: Partial<PlaceEntry> = {}): PlaceEntry {
  return {
    id: `${description}-${amount}`,
    description,
    rawDescription: `${via}\n${description}`,
    amount,
    cashflow: 'spending',
    occurredAt: new Date('2026-08-10T05:00:00Z'),
    categoryName: 'Belanja Online',
    source: 'xlsx',
    ...overrides,
  }
}

describe('onlineKey', () => {
  it('takes card and biller payments', () => {
    expect(onlineKey(row('Tokopedia', 'Pembayaran Tokopedia', 1n))).toBe('tokopedia')
    expect(onlineKey(row('Google Work', 'Transaksi e-Commerce', 1n))).toBe('google work')
    expect(onlineKey(row('Xendit 88908', 'Pembayaran Xendit 88908', 1n))).toBe('xendit')
  })

  it('leaves out what is not online shopping', () => {
    expect(onlineKey(row('SITI KHAFADOH', 'Transfer ke BANK MANDIRI', 1n))).toBeNull()
    expect(onlineKey(row('BOGA RASAA', 'Pembayaran QR', 1n))).toBeNull()
    expect(onlineKey(row('GoPay', 'Pembayaran GoPay Customer', 1n))).toBeNull()
    expect(onlineKey(row('Biaya transaksi bank', 'Biaya transaksi bank', 1n))).toBeNull()
    expect(onlineKey(row('Penyesuaian saldo DANA', '', 1n, { categoryName: 'Penyesuaian Spending', rawDescription: null }))).toBeNull()
  })
})

describe('billerOf', () => {
  it('names the billing entity, which is where the money goes', () => {
    expect(billerOf('google work')).toMatchObject({ company: 'Google', country: 'Singapura' })
    expect(billerOf('cursor, ai')).toMatchObject({ country: 'Amerika Serikat' })
    expect(billerOf('midtrans')).toMatchObject({ gateway: true, country: 'Indonesia' })
    expect(billerOf('warung tak dikenal')).toBeNull()
  })
})

describe('summariseOnline', () => {
  const entries = [
    row('Tokopedia', 'Pembayaran Tokopedia', 300_000n),
    row('Google Work', 'Transaksi e-Commerce', 120_000n, { cashflow: 'bills', categoryName: 'Google Workspace' }),
    row('Google GSUI', 'Transaksi e-Commerce', 65_000n, { cashflow: 'bills', categoryName: 'Google Workspace' }),
    row('CURSOR, AI', 'Transaksi e-Commerce', 350_000n, { categoryName: 'Langganan AI' }),
    row('MVA Close', 'Pembayaran MVA Close', 100_000n, { categoryName: 'Other spending' }),
    row('SITI KHAFADOH', 'Transfer ke BANK MANDIRI', 1_500_000n, { categoryName: 'Kos & Sewa' }),
  ]

  it('merges one company and splits home from abroad', () => {
    const report = summariseOnline(entries)
    expect(report.recipients.map((r) => [r.label, r.total, r.payments])).toEqual([
      ['Cursor (Anysphere)', 350_000n, 1],
      ['Tokopedia', 300_000n, 1],
      ['Google', 185_000n, 2],
      ['MVA Close', 100_000n, 1],
    ])
    expect(report.total).toBe(935_000n)
    expect(report.abroad).toBe(535_000n)
    expect(report.unknown).toBe(100_000n)
  })

  it('answers to the same category and month filter as the map', () => {
    expect(summariseOnline(entries, { categories: ['Google Workspace'] }).total).toBe(185_000n)
    expect(summariseOnline(entries, { from: '2026-09' }).total).toBe(0n)
  })
})
