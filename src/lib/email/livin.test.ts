import { describe, expect, it } from 'vitest'
import {
  LIVIN_SENDER_DOMAIN,
  classifySubject,
  parseLivinAmount,
  parseLivinEmail,
  verifySender,
} from './livin'

/*
  Both fixtures follow the layout of real Livin' mail, with the account numbers
  and names replaced. They differ from each other in four ways that the parser
  has to absorb, and those four differences are the reason the alias table
  exists at all:

    1. the amount label     Nominal Transaksi   vs  Jumlah Transfer
    2. the source label     Sumber Dana         vs  Rekening Sumber
    3. the currency prefix  IDR                 vs  Rp
    4. optional fields      fee and total       vs  a user-written note
*/

const PAYMENT = `Pembayaran Berhasil

Penerima
Alfagift
88300000000000000

Tanggal\t19 Agu 2026
Jam\t20:58:37 WIB
Nominal Transaksi\tIDR 55.432,00
Biaya Transaksi\tIDR 1.000,00
Total Transaksi\tIDR 56.432,00
No. Referensi\t702608192058371938
Sumber Dana\t****4257
`

const TRANSFER = `Transfer Berhasil

Penerima
FLIPTECH LENTERA INS
Bank Mandiri - 1570000000000

Tanggal\t19 Agu 2026
Jam\t09:33:26 WIB
Jumlah Transfer\tRp 50.377,00
Keterangan\tpiutang
No. Referensi\t2608191121042611281
Rekening Sumber\t****4257
`

describe('classifySubject', () => {
  it('recognises the templates seen so far', () => {
    expect(classifySubject('Pembayaran Berhasil')).toBe('payment')
    expect(classifySubject('Transfer Berhasil')).toBe('transfer')
    expect(classifySubject('Top Up Berhasil')).toBe('topup')
  })

  it('calls anything else unknown rather than guessing', () => {
    expect(classifySubject('Promo Spesial Untukmu')).toBe('unknown')
  })
})

describe('parseLivinAmount', () => {
  it('accepts both currency prefixes', () => {
    expect(parseLivinAmount('IDR 55.432,00')).toBe(55_432_00n)
    expect(parseLivinAmount('Rp 50.377,00')).toBe(50_377_00n)
    expect(parseLivinAmount('Rp. 1.000,00')).toBe(1_000_00n)
  })

  it('reads Indonesian separators, not English ones', () => {
    // 1.552.574,00 is one and a half million, not one and a half.
    expect(parseLivinAmount('IDR 1.552.574,00')).toBe(1_552_574_00n)
  })
})

describe('parseLivinEmail', () => {
  describe('a payment', () => {
    const result = parseLivinEmail({ subject: 'Pembayaran Berhasil', body: PAYMENT })

    it('parses cleanly', () => {
      expect(result.ok).toBe(true)
      expect(result.problems).toEqual([])
    })

    it('reads the amount under its own label', () => {
      expect(result.transaction!.amount).toBe(55_432_00n)
    })

    it('keeps the fee separate rather than folded into the amount', () => {
      expect(result.transaction!.fee).toBe(1_000_00n)
      expect(result.transaction!.total).toBe(56_432_00n)
    })

    it('reads the merchant and the destination out of the block', () => {
      expect(result.transaction!.recipient).toBe('Alfagift')
      expect(result.transaction!.destination).toBe('88300000000000000')
      expect(result.transaction!.destinationBank).toBeNull()
    })

    it('builds a Jakarta instant from the separate date and time lines', () => {
      // 19 August 2026, 20:58:37 WIB is 13:58:37 UTC.
      expect(result.transaction!.occurredAt.toISOString()).toBe('2026-08-19T13:58:37.000Z')
    })

    it('keeps the reference, which is what joins it to the statement later', () => {
      expect(result.transaction!.reference).toBe('702608192058371938')
    })

    it('has no note, because a payment has nowhere to type one', () => {
      expect(result.transaction!.note).toBeNull()
    })
  })

  describe('a transfer', () => {
    const result = parseLivinEmail({ subject: 'Transfer Berhasil', body: TRANSFER })

    it('parses cleanly despite every label differing', () => {
      expect(result.ok).toBe(true)
      expect(result.transaction!.amount).toBe(50_377_00n)
      expect(result.transaction!.sourceAccountMask).toBe('****4257')
    })

    it('captures the note the user typed', () => {
      // This is the strongest categorisation signal in the whole app: intent
      // stated by the user rather than inferred from a bank description.
      expect(result.transaction!.note).toBe('piutang')
    })

    it('splits the destination bank from the account number', () => {
      expect(result.transaction!.recipient).toBe('FLIPTECH LENTERA INS')
      expect(result.transaction!.destinationBank).toBe('Bank Mandiri')
      expect(result.transaction!.destination).toBe('1570000000000')
    })

    it('reports no fee rather than inventing one', () => {
      expect(result.transaction!.fee).toBe(0n)
      expect(result.transaction!.total).toBeNull()
    })
  })

  describe('when something is wrong', () => {
    it('refuses an unknown subject but still extracts what it can', () => {
      const result = parseLivinEmail({ subject: 'Info Terbaru', body: PAYMENT })
      expect(result.ok).toBe(false)
      expect(result.problems[0].kind).toBe('unknown-template')
      // The fields are still returned so a human reviewing it sees real values.
      expect(result.transaction!.amount).toBe(55_432_00n)
    })

    it('names the missing field rather than failing vaguely', () => {
      const withoutReference = PAYMENT.replace(/No\. Referensi.*\n/, '')
      const result = parseLivinEmail({
        subject: 'Pembayaran Berhasil',
        body: withoutReference,
      })
      expect(result.transaction).toBeNull()
      expect(result.problems.map((p) => p.field)).toContain('No. Referensi')
    })

    it('catches a total that does not equal amount plus fee', () => {
      // A mismatch means a label was read as the wrong field, which is exactly
      // the failure the alias table could produce as templates multiply.
      const tampered = PAYMENT.replace('Total Transaksi\tIDR 56.432,00', 'Total Transaksi\tIDR 99.999,00')
      const result = parseLivinEmail({ subject: 'Pembayaran Berhasil', body: tampered })
      expect(result.ok).toBe(false)
      expect(result.problems.some((p) => p.kind === 'total-mismatch')).toBe(true)
    })

    it('keeps the raw body, because the template will change', () => {
      const result = parseLivinEmail({ subject: 'Transfer Berhasil', body: TRANSFER })
      expect(result.transaction!.raw).toBe(TRANSFER)
    })

    it('handles a body with no fields at all without throwing', () => {
      const result = parseLivinEmail({ subject: 'Transfer Berhasil', body: 'halo' })
      expect(result.transaction).toBeNull()
      expect(result.ok).toBe(false)
    })
  })

  it('reads a label separated by spaces rather than a tab', () => {
    const spaced = TRANSFER.replace('Jumlah Transfer\t', 'Jumlah Transfer   ')
    expect(parseLivinEmail({ subject: 'Transfer Berhasil', body: spaced }).transaction!.amount).toBe(
      50_377_00n,
    )
  })

  it('reads a label whose value sits on the next line', () => {
    const blocky = TRANSFER.replace('Jumlah Transfer\tRp 50.377,00', 'Jumlah Transfer\nRp 50.377,00')
    expect(parseLivinEmail({ subject: 'Transfer Berhasil', body: blocky }).transaction!.amount).toBe(
      50_377_00n,
    )
  })
})

describe('verifySender', () => {
  const PASSING = 'mx.google.com; spf=pass; dkim=pass header.i=@bankmandiri.co.id; dmarc=pass'

  it('accepts mail from the bank that passes every check', () => {
    const verdict = verifySender({
      from: `Livin' <noreply.livin@${LIVIN_SENDER_DOMAIN}>`,
      authenticationResults: PASSING,
    })
    expect(verdict.trusted).toBe(true)
    expect(verdict.reasons).toEqual([])
  })

  it('accepts a subdomain of the bank', () => {
    expect(
      verifySender({ from: 'a@mail.bankmandiri.co.id', authenticationResults: PASSING }).trusted,
    ).toBe(true)
  })

  it('rejects a lookalike domain that merely ends the same way', () => {
    // The classic phishing shape, and a naive endsWith check would accept it.
    const verdict = verifySender({
      from: 'noreply.livin@notbankmandiri.co.id',
      authenticationResults: PASSING,
    })
    expect(verdict.trusted).toBe(false)
    expect(verdict.reasons[0]).toMatch(/bukan bankmandiri/)
  })

  it('rejects a display name that only claims to be the bank', () => {
    const verdict = verifySender({
      from: `Bank Mandiri <phish@evil.example>`,
      authenticationResults: PASSING,
    })
    expect(verdict.trusted).toBe(false)
  })

  it('rejects mail that fails any one of SPF, DKIM or DMARC', () => {
    for (const failing of [
      'spf=fail; dkim=pass; dmarc=pass',
      'spf=pass; dkim=fail; dmarc=pass',
      'spf=pass; dkim=pass; dmarc=fail',
    ]) {
      const verdict = verifySender({
        from: `noreply.livin@${LIVIN_SENDER_DOMAIN}`,
        authenticationResults: failing,
      })
      expect(verdict.trusted).toBe(false)
    }
  })

  it('rejects mail with no authentication results at all', () => {
    const verdict = verifySender({ from: `noreply.livin@${LIVIN_SENDER_DOMAIN}` })
    expect(verdict.trusted).toBe(false)
    expect(verdict.reasons).toHaveLength(3)
  })
})
