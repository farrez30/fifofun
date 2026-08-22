import { describe, expect, it } from 'vitest'
import { parseIdAmount } from './index'
import { groupDigits, normaliseShare, normaliseTyped, toInputText } from './input'

describe('groupDigits', () => {
  it('groups thousands with a full stop', () => {
    expect(groupDigits('1234567')).toBe('1.234.567')
    expect(groupDigits('1000')).toBe('1.000')
  })

  it('leaves three digits or fewer alone', () => {
    expect(groupDigits('999')).toBe('999')
    expect(groupDigits('7')).toBe('7')
  })

  it('drops leading zeros but keeps a lone zero', () => {
    expect(groupDigits('007')).toBe('7')
    expect(groupDigits('0')).toBe('0')
    expect(groupDigits('000')).toBe('0')
  })

  it('stays exact past sixteen digits', () => {
    expect(groupDigits('12345678901234567890')).toBe('12.345.678.901.234.567.890')
  })

  it('returns nothing for nothing', () => {
    expect(groupDigits('')).toBe('')
  })
})

describe('normaliseTyped', () => {
  it('strips a pasted Rp prefix and separators', () => {
    expect(normaliseTyped('Rp1.552.574')).toEqual({ text: '1.552.574', sen: 155257400n })
    expect(normaliseTyped('1552574')).toEqual({ text: '1.552.574', sen: 155257400n })
  })

  it('ignores a comma when decimals are off', () => {
    expect(normaliseTyped('1.000,50')).toEqual({ text: '100.050', sen: 10005000n })
  })

  it('keeps one comma and at most two decimals when decimals are on', () => {
    expect(normaliseTyped('1000,5', { decimals: true })).toEqual({ text: '1.000,5', sen: 100050n })
    expect(normaliseTyped('1000,567', { decimals: true })).toEqual({
      text: '1.000,56',
      sen: 100056n,
    })
    expect(normaliseTyped('1,2,3', { decimals: true })).toEqual({ text: '1,23', sen: 123n })
  })

  it('keeps a trailing comma while it is being typed', () => {
    expect(normaliseTyped('1000,', { decimals: true })).toEqual({ text: '1.000,', sen: 100000n })
    expect(normaliseTyped(',', { decimals: true })).toEqual({ text: '0,', sen: 0n })
  })

  it('returns empty text and zero sen when no digit was typed', () => {
    expect(normaliseTyped('')).toEqual({ text: '', sen: 0n })
    expect(normaliseTyped('Rp')).toEqual({ text: '', sen: 0n })
    expect(normaliseTyped(',')).toEqual({ text: '', sen: 0n })
  })

  it('round-trips every result through parseIdAmount', () => {
    for (const raw of ['5', '50', '500', '5000', '1234567', '99.999.999.999', '0,05', '12,3']) {
      const { text, sen } = normaliseTyped(raw, { decimals: true })
      expect(parseIdAmount(text.replace(/,$/, ''))).toBe(sen)
    }
  })
})

describe('toInputText', () => {
  it('formats a stored amount without the symbol', () => {
    expect(toInputText(155257400n)).toBe('1.552.574')
    expect(toInputText(11345807n, true)).toBe('113.458,07')
  })

  it('is empty for zero so the server can ask for a figure', () => {
    expect(toInputText(0n)).toBe('')
  })
})

describe('normaliseShare', () => {
  it('turns a percentage with one decimal into basis points', () => {
    expect(normaliseShare('12,5')).toEqual({ text: '12,5', bp: 1250 })
    expect(normaliseShare('12.5')).toEqual({ text: '12,5', bp: 1250 })
    expect(normaliseShare('20')).toEqual({ text: '20', bp: 2000 })
  })

  it('keeps at most three whole digits and one decimal', () => {
    expect(normaliseShare('1234,56')).toEqual({ text: '123,5', bp: 12350 })
  })

  it('returns null for nothing typed', () => {
    expect(normaliseShare('')).toEqual({ text: '', bp: null })
    expect(normaliseShare('%')).toEqual({ text: '', bp: null })
  })
})
