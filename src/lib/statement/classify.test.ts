import { describe, expect, it } from 'vitest'
import { parseIdAmount } from '@/lib/money'
import type { StatementRow } from './mandiri-xlsx'
import { classify, normalisePhone } from './classify'

/**
 * Fixtures reproduce real description shapes observed across 1,591 statement
 * rows. Names and numbers are altered; the structure is not.
 */
function row(lines: string[], amount: string, direction: 'in' | 'out' = 'out'): StatementRow {
  const value = parseIdAmount(amount)
  return {
    no: 1,
    sheetRow: 17,
    occurredAt: new Date('2026-03-01T09:00:00.000Z'),
    date: { year: 2026, month: 3, day: 1 },
    hasTime: true,
    description: lines.join('\n'),
    lines,
    amountIn: direction === 'in' ? value : 0n,
    amountOut: direction === 'out' ? value : 0n,
    balanceAfter: 0n,
  }
}

const OWN = ['081200000001']

describe('QRIS payments', () => {
  it('extracts the merchant and the acquirer reference', () => {
    const c = classify(row(['Pembayaran QR', 'ke KOPI KENANGAN CONTOH', '600000000001'], '49.000,00'))
    expect(c.kind).toBe('qris-payment')
    expect(c.channel).toBe('qris')
    expect(c.counterparty.name).toBe('KOPI KENANGAN CONTOH')
    expect(c.reference).toBe('600000000001')
    expect(c.direction).toBe('out')
  })

  it('flags a merchant name that hit the 25-character QRIS limit', () => {
    // EMVCo tag 59 caps the merchant name, so equality matching would be wrong.
    const c = classify(row(['Pembayaran QR', 'ke ABCDEFGHIJKLMNOPQRSTUVWXY', '1'], '10.000,00'))
    expect(c.counterparty.name).toHaveLength(25)
    expect(c.counterparty.truncated).toBe(true)
  })

  it('treats an explicit ellipsis as truncation and strips it', () => {
    const c = classify(row(['Pembayaran QR', 'ke SPBU CONTOH RAYA SATU1...', '1'], '10.000,00'))
    expect(c.counterparty.name).toBe('SPBU CONTOH RAYA SATU1')
    expect(c.counterparty.truncated).toBe(true)
  })

  it('does not flag a short merchant name', () => {
    const c = classify(row(['Pembayaran QR', 'ke WARUNG CONTOH', '1'], '24.000,00'))
    expect(c.counterparty.truncated).toBe(false)
  })
})

describe('fees', () => {
  it('marks a bank transaction fee as belonging to a parent transaction', () => {
    const c = classify(row(['Biaya transaksi bank', 'Pembayaran Danatopup', '89508081200000001'], '1.000,00'))
    expect(c.kind).toBe('bank-fee')
    expect(c.isChildFee).toBe(true)
    // The second line names the parent's kind, which pairs them up.
    expect(c.note).toBe('Pembayaran Danatopup')
  })

  it('marks account-level fees as standing alone', () => {
    for (const label of ['Biaya administrasi rekening', 'Biaya administrasi kartu debit']) {
      const c = classify(row([label], '12.500,00'))
      expect(c.kind).toBe('bank-fee')
      expect(c.isChildFee).toBe(false)
    }
  })
})

describe('intra-Mandiri transfers', () => {
  it('reads the counterparty name and account', () => {
    const c = classify(
      row(['Transfer ke BANK MANDIRI', 'SITI RAHAYU 1230000000002', 'laundry'], '90.332,00'),
    )
    expect(c.kind).toBe('transfer-out')
    expect(c.counterparty.name).toBe('SITI RAHAYU')
    expect(c.counterparty.account).toBe('1230000000002')
    expect(c.note).toBe('laundry')
  })

  it('flags a counterparty name cut at the 20-character limit', () => {
    const c = classify(
      row(['Transfer ke BANK MANDIRI', 'LAUNDRY SEJAHTERA IN 1230000000004'], '50.000,00'),
    )
    expect(c.counterparty.name).toBe('LAUNDRY SEJAHTERA IN')
    expect(c.counterparty.truncated).toBe(true)
  })

  it('reads an incoming transfer', () => {
    const c = classify(
      row(['Transfer dari BANK MANDIRI', 'DEWI LESTARI 1230000000003', 'titipan'], '1.950.000,00', 'in'),
    )
    expect(c.kind).toBe('transfer-in')
    expect(c.direction).toBe('in')
    expect(c.note).toBe('titipan')
  })
})

describe('institutional incoming transfers', () => {
  // The employer is per-user configuration, so the test supplies it.
  const salary = (note: string, amount = '6.060.000,00') =>
    classify(row(['Transfer antar Mandiri', 'DARI PT SUMBER MAKMUR SEJAHTERA', note], amount, 'in'), {
      employerNames: ['PT SUMBER MAKMUR'],
    })

  it('recognises salary from the employer', () => {
    expect(salary('Sal TUKK Bln Mar 202 202600000000000001').kind).toBe('salary')
    expect(salary('SAL TUKK Bl Nov 2024 202400000000000002').kind).toBe('salary')
    expect(salary('Rapel Sal TUKK Bln J 202500000000000003').kind).toBe('salary')
  })

  it('separates a holiday bonus from regular salary', () => {
    const c = salary('THR thn 2026 SumberM 202600000000000004', '6.000.000,00')
    expect(c.kind).toBe('bonus')
  })

  it('does not treat e-wallet settlements as income', () => {
    // Money returning from the user's own GoPay is not new income; counting it
    // would inflate every income figure in the app.
    for (const [sender, label] of [
      ['DARI DOMPET ANAK BANGSA', 'GoPay'],
      ['DARI AIRPAY INTERNATIONAL', 'ShopeePay'],
    ]) {
      const c = classify(row(['Transfer antar Mandiri', sender, 'ref'], '86.900,00', 'in'))
      expect(c.kind).toBe('wallet-withdrawal')
      expect(c.ownFunds).toBe(true)
      expect(c.counterparty.name).toBe(label)
    }
  })

  it('treats money arriving through a payment rail as somebody else paying', () => {
    // Flip forwards other people's money. Counting it as the user's own balance
    // returning made the ledger show a Flip balance of minus Rp8,4 million.
    const c = classify(
      row(['Transfer antar Mandiri', 'DARI FLIPTECH LENTERA INS', '700000000-123000000 pesanan makanan'], '260.000,00', 'in'),
    )
    expect(c.kind).toBe('transfer-in')
    expect(c.ownFunds).toBe(false)
    expect(c.counterparty.name).toBe('Flip')
    expect(c.note).toBe('700000000-123000000 pesanan makanan')
  })

  it('falls back to a plain transfer for an unrecognised sender', () => {
    const c = classify(row(['Transfer antar Mandiri', 'DARI SOMEONE ELSE', 'x'], '10.000,00', 'in'))
    expect(c.kind).toBe('transfer-in')
    expect(c.confidence).toBe('medium')
  })
})

describe('BI Fast', () => {
  it('reads direction, bank, counterparty and note', () => {
    const c = classify(
      row(
        ['Transfer BI Fast', 'Dari BCA', 'AGUS PRASETYO WIBOWO 0180000001', 'langganan bulanan'],
        '177.000,00',
        'in',
      ),
    )
    expect(c.kind).toBe('transfer-in')
    expect(c.channel).toBe('bifast')
    expect(c.counterparty.institution).toBe('BCA')
    expect(c.counterparty.name).toBe('AGUS PRASETYO WIBOWO')
    expect(c.counterparty.truncated).toBe(true)
    expect(c.note).toBe('langganan bulanan')
  })

  it('reads an outgoing BI Fast transfer', () => {
    const c = classify(row(['Transfer BI Fast', 'Ke BANK CONTOH', 'NAMA 123456'], '141.000,00'))
    expect(c.kind).toBe('transfer-out')
    expect(c.counterparty.institution).toBe('BANK CONTOH')
  })

  it('lowers confidence when the bank name is missing', () => {
    const c = classify(row(['Transfer BI Fast', 'Dari', 'NAMA 123456'], '800.000,00', 'in'))
    expect(c.confidence).toBe('medium')
  })
})

describe('wallets and cash', () => {
  it('treats a top-up to the user own number as own funds', () => {
    const c = classify(row(['Pembayaran GoPay Customer', '081200000001'], '80.500,00'), {
      ownIdentifiers: OWN,
    })
    expect(c.kind).toBe('wallet-topup')
    expect(c.ownFunds).toBe(true)
    expect(c.counterparty.name).toBe('GoPay')
  })

  it('treats a payment to somebody else number as money leaving', () => {
    const c = classify(row(['Pembayaran GoPay Customer', '081200000009'], '44.500,00'), {
      ownIdentifiers: OWN,
    })
    expect(c.kind).toBe('transfer-out')
    expect(c.ownFunds).toBe(false)
  })

  it('strips the biller prefix before comparing the phone number', () => {
    // ShopeePay prefixes 893 and DANA prefixes 89508 onto the phone number.
    expect(
      classify(row(['Pembayaran ShopeePay', '893081200000001'], '109.000,00'), {
        ownIdentifiers: OWN,
      }).ownFunds,
    ).toBe(true)
    expect(
      classify(row(['Pembayaran Danatopup', '89508081200000001'], '43.290,00'), {
        ownIdentifiers: OWN,
      }).ownFunds,
    ).toBe(true)
  })

  it('says so rather than guessing when no own number is configured', () => {
    const c = classify(row(['Pembayaran GoPay Customer', '081200000001'], '80.500,00'))
    expect(c.confidence).toBe('low')
  })

  it('treats an e-money top-up and a cash withdrawal as own funds', () => {
    expect(classify(row(['Top-up e-money', '6032000000000001'], '30.000,00')).ownFunds).toBe(true)
    expect(
      classify(row(['Penarikan tunai di ATM', 'BANK MANDIRI T0800143'], '100.000,00')).ownFunds,
    ).toBe(true)
  })
})

describe('card transactions', () => {
  it('reads an e-commerce card payment', () => {
    const c = classify(row(['Transaksi e-Commerce', 'VAP-CURSOR, AI'], '352.701,34'))
    expect(c.kind).toBe('ecommerce-card')
    expect(c.counterparty.name).toBe('CURSOR, AI')
  })

  it('reads a refund as incoming', () => {
    const c = classify(row(['Koreksi transaksi e-Commerce', 'VAP-GOOGLE *SER'], '16.132,00', 'in'))
    expect(c.kind).toBe('refund')
    expect(c.direction).toBe('in')
  })
})

describe('fallback', () => {
  it('reports an unrecognised description instead of guessing at it', () => {
    const c = classify(row(['Sesuatu Yang Baru', 'detail'], '1.000,00'))
    expect(c.kind).toBe('unknown')
    expect(c.confidence).toBe('low')
    expect(c.counterparty.name).toBe('Sesuatu Yang Baru')
  })

  it('still classifies an unseen biller as a biller payment', () => {
    const c = classify(row(['Pembayaran Sesuatu Baru', '123456'], '50.000,00'))
    expect(c.kind).toBe('biller-payment')
    expect(c.counterparty.name).toBe('Sesuatu Baru')
  })
})

describe('normalisePhone', () => {
  it('makes the local and international forms comparable', () => {
    expect(normalisePhone('081200000001')).toBe('081200000001')
    expect(normalisePhone('6281200000001')).toBe('081200000001')
    expect(normalisePhone('+62 812-0000-0001')).toBe('081200000001')
  })
})
