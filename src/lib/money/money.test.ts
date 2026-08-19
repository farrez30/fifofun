import { describe, expect, it } from 'vitest'
import {
  addSen,
  formatIdr,
  formatIdrCompact,
  parseIdAmount,
  parseEnAmount,
  senToRupiahNumber,
  sumSen,
} from './index'

describe('parseIdAmount (id-ID: 1.552.574,00)', () => {
  it('parses amounts from the real Mandiri e-statement', () => {
    expect(parseIdAmount('1.552.574,00')).toBe(155257400n)
    expect(parseIdAmount('113.458,07')).toBe(11345807n)
    expect(parseIdAmount('4.863.195,72')).toBe(486319572n)
    expect(parseIdAmount('15.359.644,41')).toBe(1535964441n)
    expect(parseIdAmount('1.000,00')).toBe(100000n)
    expect(parseIdAmount('0,00')).toBe(0n)
  })

  it('accepts the IDR and Rp prefixes used in Livin email', () => {
    expect(parseIdAmount('IDR 55.432,00')).toBe(5543200n)
    expect(parseIdAmount('Rp 50.377,00')).toBe(5037700n)
    expect(parseIdAmount('Rp50.377,00')).toBe(5037700n)
    expect(parseIdAmount('IDR\u00a01.000,00')).toBe(100000n)
  })

  it('accepts a missing or short decimal part', () => {
    expect(parseIdAmount('1.000')).toBe(100000n)
    expect(parseIdAmount('1.000,5')).toBe(100050n)
    expect(parseIdAmount('12')).toBe(1200n)
  })

  it('handles negative amounts', () => {
    expect(parseIdAmount('-47.200,00')).toBe(-4720000n)
    expect(parseIdAmount('-Rp47.200')).toBe(-4720000n)
  })

  it('does not lose precision on values that break float arithmetic', () => {
    // 0.1 + 0.2 !== 0.3 in float; in sen it is exact.
    expect(addSen(parseIdAmount('0,10'), parseIdAmount('0,20'))).toBe(parseIdAmount('0,30'))
    // A value with more digits than Number.MAX_SAFE_INTEGER can hold in sen.
    expect(parseIdAmount('999.999.999.999.999,99')).toBe(99999999999999999n)
  })

  it('rejects malformed input loudly instead of guessing', () => {
    expect(() => parseIdAmount('')).toThrow()
    expect(() => parseIdAmount('   ')).toThrow()
    expect(() => parseIdAmount('abc')).toThrow()
    expect(() => parseIdAmount('1,234.56')).toThrow() // en-US shape
    expect(() => parseIdAmount('1.000,123')).toThrow() // more than 2 decimals
    expect(() => parseIdAmount('1,00,00')).toThrow()
  })

  it('rejects thousands groups that are not 3 digits', () => {
    expect(() => parseIdAmount('1.00.000,00')).toThrow()
    expect(() => parseIdAmount('12.3456,00')).toThrow()
  })
})

describe('parseEnAmount (rekening koran PDF: 1,053,706.00)', () => {
  it('parses en-US grouped amounts', () => {
    expect(parseEnAmount('1,053,706.00')).toBe(105370600n)
    expect(parseEnAmount('55,432.00')).toBe(5543200n)
    expect(parseEnAmount('0.00')).toBe(0n)
  })

  it('rejects the id-ID shape so a format mixup cannot pass silently', () => {
    expect(() => parseEnAmount('1.552.574,00')).toThrow()
  })
})

describe('formatIdr', () => {
  it('formats sen as Indonesian Rupiah without decimals by default', () => {
    expect(formatIdr(155257400n)).toBe('Rp1.552.574')
    expect(formatIdr(0n)).toBe('Rp0')
    expect(formatIdr(-4720000n)).toBe('-Rp47.200')
  })

  it('can show the sen when asked', () => {
    expect(formatIdr(11345807n, { decimals: true })).toBe('Rp113.458,07')
  })

  it('can omit the symbol for table cells that carry their own header', () => {
    expect(formatIdr(155257400n, { symbol: false })).toBe('1.552.574')
  })

  it('rounds half away from zero rather than truncating', () => {
    expect(formatIdr(150n)).toBe('Rp2')
    expect(formatIdr(149n)).toBe('Rp1')
    expect(formatIdr(-150n)).toBe('-Rp2')
  })
})

describe('formatIdrCompact', () => {
  it('shortens large amounts for chart labels', () => {
    expect(formatIdrCompact(486319572n)).toBe('Rp4,9jt')
    expect(formatIdrCompact(100000n)).toBe('Rp1rb')
    expect(formatIdrCompact(500_000_000_000n)).toBe('Rp5mi')
    expect(formatIdrCompact(50000n)).toBe('Rp500')
  })

  it('promotes to the next unit when rounding crosses the boundary', () => {
    // Rp999.960.000 rounds to 1.000,0jt, which should read as Rp1mi.
    expect(formatIdrCompact(99_996_000_000n)).toBe('Rp1mi')
  })

  it('rounds rather than truncates', () => {
    expect(formatIdrCompact(486319572n)).toBe('Rp4,9jt')
    expect(formatIdrCompact(-486319572n)).toBe('-Rp4,9jt')
  })
})

describe('sumSen', () => {
  it('sums exactly, which is what the statement reconciliation depends on', () => {
    const rows = ['1.000,00', '80.500,00', '1.000,00', '43.290,00'].map(parseIdAmount)
    expect(sumSen(rows)).toBe(12579000n)
  })

  it('returns zero for an empty list', () => {
    expect(sumSen([])).toBe(0n)
  })
})

describe('senToRupiahNumber', () => {
  it('converts for display maths only, and refuses unsafe magnitudes', () => {
    expect(senToRupiahNumber(155257400n)).toBe(1552574)
    expect(() => senToRupiahNumber(9_007_199_254_740_993_00n)).toThrow()
  })
})
