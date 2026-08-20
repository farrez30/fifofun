import { describe, expect, it } from 'vitest'
import { isFailure, parseQuickAmount, parseQuickEntry } from './parse'

describe('parseQuickAmount', () => {
  it('reads a plain integer as Indonesian, where a full stop groups thousands', () => {
    // The single most consequential case: 12.500 is twelve and a half thousand,
    // not twelve and a half. Reading it as English would understate by 1000x.
    expect(parseQuickAmount('12.500')).toBe(12_500_00n)
    expect(parseQuickAmount('1.552.574')).toBe(1_552_574_00n)
    expect(parseQuickAmount('50000')).toBe(50_000_00n)
  })

  it('applies the short multipliers', () => {
    expect(parseQuickAmount('50rb')).toBe(50_000_00n)
    expect(parseQuickAmount('50k')).toBe(50_000_00n)
    expect(parseQuickAmount('9jt')).toBe(9_000_000_00n)
    expect(parseQuickAmount('2m')).toBe(2_000_000_000_00n)
  })

  it('applies the spelled-out multipliers', () => {
    expect(parseQuickAmount('50ribu')).toBe(50_000_00n)
    expect(parseQuickAmount('9juta')).toBe(9_000_000_00n)
    expect(parseQuickAmount('2miliar')).toBe(2_000_000_000_00n)
  })

  it('reads a fractional multiplier exactly', () => {
    expect(parseQuickAmount('1,5jt')).toBe(1_500_000_00n)
    expect(parseQuickAmount('2,25jt')).toBe(2_250_000_00n)
    expect(parseQuickAmount('7,5rb')).toBe(7_500_00n)
  })

  it('accepts the same figure written either way', () => {
    expect(parseQuickAmount('1.500rb')).toBe(parseQuickAmount('1,5jt'))
  })

  it('is case insensitive', () => {
    expect(parseQuickAmount('50RB')).toBe(50_000_00n)
    expect(parseQuickAmount('9Jt')).toBe(9_000_000_00n)
  })

  it('prefers the longer suffix where two could match', () => {
    // `juta` must not be read as `jt` plus leftovers, nor `m` alone.
    expect(parseQuickAmount('3juta')).toBe(3_000_000_00n)
  })

  it('refuses what it cannot read rather than guessing', () => {
    expect(parseQuickAmount('')).toBeNull()
    expect(parseQuickAmount('abc')).toBeNull()
    expect(parseQuickAmount('rb')).toBeNull()
    expect(parseQuickAmount('12,5,3')).toBeNull()
    expect(parseQuickAmount('1.50')).toBeNull()
  })

  it('keeps a very large amount exact', () => {
    expect(parseQuickAmount('999999miliar')).toBe(999_999_000_000_000_00n)
  })
})

describe('parseQuickEntry', () => {
  it('defaults to spending, which is what most messages are', () => {
    const entry = parseQuickEntry('50rb makan siang')
    expect(isFailure(entry)).toBe(false)
    if (isFailure(entry)) return

    expect(entry.amount).toBe(50_000_00n)
    expect(entry.cashflow).toBe('spending')
    expect(entry.note).toBe('makan siang')
    expect(entry.categoryHint).toBe('makan')
  })

  it('reads a leading plus as income', () => {
    const entry = parseQuickEntry('+9jt gaji')
    if (isFailure(entry)) throw new Error('should parse')
    expect(entry.cashflow).toBe('income')
    expect(entry.amount).toBe(9_000_000_00n)
  })

  it('reads a leading minus as spending', () => {
    const entry = parseQuickEntry('-25000 parkir')
    if (isFailure(entry)) throw new Error('should parse')
    expect(entry.cashflow).toBe('spending')
    expect(entry.amount).toBe(25_000_00n)
  })

  it('reads a direction word', () => {
    for (const [message, expected] of [
      ['masuk 500rb refund', 'income'],
      ['nabung 1jt', 'invest_savings'],
      ['tagihan 250rb wifi', 'bills'],
      ['cicilan 2jt motor', 'debt_payment'],
      ['piutang 100rb spotify', 'receivable_new'],
    ] as const) {
      const entry = parseQuickEntry(message)
      if (isFailure(entry)) throw new Error(`should parse: ${message}`)
      expect(entry.cashflow, message).toBe(expected)
    }
  })

  it('lets an explicit sign override a direction word', () => {
    // Someone who typed a sign meant it, whatever word came before.
    const entry = parseQuickEntry('bayar +50rb refund parkir')
    if (isFailure(entry)) throw new Error('should parse')
    expect(entry.cashflow).toBe('income')
  })

  it('copes with an amount and nothing else', () => {
    const entry = parseQuickEntry('50rb')
    if (isFailure(entry)) throw new Error('should parse')
    expect(entry.note).toBe('')
    expect(entry.categoryHint).toBeNull()
  })

  it('collapses stray whitespace', () => {
    const entry = parseQuickEntry('  50rb   makan   siang  ')
    if (isFailure(entry)) throw new Error('should parse')
    expect(entry.note).toBe('makan siang')
  })

  describe('what it refuses', () => {
    it('refuses an empty message', () => {
      const result = parseQuickEntry('   ')
      expect(isFailure(result) && result.reason).toBe('empty')
    })

    it('refuses a message with no readable amount, and says what it wanted', () => {
      const result = parseQuickEntry('makan siang enak banget')
      expect(isFailure(result) && result.reason).toBe('no-amount')
      if (!isFailure(result)) return
      expect(result.help).toContain('50rb makan siang')
    })

    it('refuses a zero rather than recording it', () => {
      const result = parseQuickEntry('0 apa pun')
      expect(isFailure(result) && result.reason).toBe('zero-amount')
    })

    it('never invents an amount from text that merely contains digits', () => {
      // "kopi2" would be a nasty thing to record as Rp2.
      const result = parseQuickEntry('kopi2 kemarin')
      expect(isFailure(result)).toBe(true)
    })
  })
})
