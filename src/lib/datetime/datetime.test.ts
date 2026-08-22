import { describe, expect, it } from 'vitest'
import {
  JAKARTA_OFFSET_MINUTES,
  formatJakarta,
  formatMonthKey,
  parseDayMonthYear,
  parseShortDate,
  parseWibTime,
  toJakartaInstant,
} from './index'

describe('parseShortDate', () => {
  it('parses the English month abbreviations used in the .xlsx e-statement', () => {
    expect(parseShortDate('01 Mar 2026')).toEqual({ year: 2026, month: 3, day: 1 })
    expect(parseShortDate('31 Dec 2025')).toEqual({ year: 2025, month: 12, day: 31 })
    expect(parseShortDate('07 Aug 2026')).toEqual({ year: 2026, month: 8, day: 7 })
    expect(parseShortDate('15 May 2026')).toEqual({ year: 2026, month: 5, day: 15 })
    expect(parseShortDate('02 Oct 2026')).toEqual({ year: 2026, month: 10, day: 2 })
  })

  it('parses the Indonesian month abbreviations used in the Livin email', () => {
    expect(parseShortDate('19 Agu 2026')).toEqual({ year: 2026, month: 8, day: 19 })
    expect(parseShortDate('15 Mei 2026')).toEqual({ year: 2026, month: 5, day: 15 })
    expect(parseShortDate('02 Okt 2026')).toEqual({ year: 2026, month: 10, day: 2 })
    expect(parseShortDate('31 Des 2025')).toEqual({ year: 2025, month: 12, day: 31 })
  })

  it('is case insensitive and tolerates extra whitespace', () => {
    expect(parseShortDate('  19  AGU  2026 ')).toEqual({ year: 2026, month: 8, day: 19 })
    expect(parseShortDate('19 agu 2026')).toEqual({ year: 2026, month: 8, day: 19 })
  })

  it('rejects impossible dates instead of rolling them over', () => {
    expect(() => parseShortDate('31 Feb 2026')).toThrow()
    expect(() => parseShortDate('00 Mar 2026')).toThrow()
    expect(() => parseShortDate('32 Mar 2026')).toThrow()
    expect(() => parseShortDate('19 Xyz 2026')).toThrow()
    expect(() => parseShortDate('2026-08-19')).toThrow()
    expect(() => parseShortDate('')).toThrow()
  })

  it('accepts a real leap day and rejects a fake one', () => {
    expect(parseShortDate('29 Feb 2024')).toEqual({ year: 2024, month: 2, day: 29 })
    expect(() => parseShortDate('29 Feb 2026')).toThrow()
  })
})

describe('parseWibTime', () => {
  it('parses the time-only second row of the e-statement', () => {
    expect(parseWibTime('02:51:00 WIB')).toEqual({ hour: 2, minute: 51, second: 0 })
    expect(parseWibTime('20:58:37 WIB')).toEqual({ hour: 20, minute: 58, second: 37 })
    expect(parseWibTime('23:59:59 WIB')).toEqual({ hour: 23, minute: 59, second: 59 })
  })

  it('tolerates a missing zone label and extra whitespace', () => {
    expect(parseWibTime(' 09:33:26 ')).toEqual({ hour: 9, minute: 33, second: 26 })
  })

  it('rejects anything that is not a time', () => {
    expect(() => parseWibTime('01 Mar 2026')).toThrow()
    expect(() => parseWibTime('24:00:00 WIB')).toThrow()
    expect(() => parseWibTime('12:60:00 WIB')).toThrow()
    expect(() => parseWibTime('')).toThrow()
  })
})

describe('toJakartaInstant', () => {
  it('treats the wall clock as UTC+7', () => {
    const instant = toJakartaInstant({ year: 2026, month: 8, day: 19 }, { hour: 20, minute: 58, second: 37 })
    expect(instant.toISOString()).toBe('2026-08-19T13:58:37.000Z')
  })

  it('rolls back across midnight when the local hour is before 07:00', () => {
    const instant = toJakartaInstant({ year: 2026, month: 3, day: 1 }, { hour: 2, minute: 51, second: 0 })
    expect(instant.toISOString()).toBe('2026-02-28T19:51:00.000Z')
  })

  it('defaults to midnight when no time is known', () => {
    expect(toJakartaInstant({ year: 2026, month: 3, day: 1 }).toISOString()).toBe(
      '2026-02-28T17:00:00.000Z',
    )
  })

  it('uses a fixed offset, because Indonesia has no daylight saving', () => {
    expect(JAKARTA_OFFSET_MINUTES).toBe(420)
  })
})

describe('parseDayMonthYear', () => {
  it('recovers the year for the DD/MM dates in the rekening koran PDF', () => {
    expect(parseDayMonthYear('01/03', { year: 2026, month: 3 })).toEqual({
      year: 2026,
      month: 3,
      day: 1,
    })
  })

  it('rolls the year back when a statement period straddles new year', () => {
    // A December row inside a January statement belongs to the previous year.
    expect(parseDayMonthYear('31/12', { year: 2026, month: 1 })).toEqual({
      year: 2025,
      month: 12,
      day: 31,
    })
  })

  it('rolls the year forward for a January row inside a December statement', () => {
    expect(parseDayMonthYear('02/01', { year: 2025, month: 12 })).toEqual({
      year: 2026,
      month: 1,
      day: 2,
    })
  })

  it('rejects malformed input', () => {
    expect(() => parseDayMonthYear('1/3', { year: 2026, month: 3 })).toThrow()
    expect(() => parseDayMonthYear('31/02', { year: 2026, month: 2 })).toThrow()
  })
})

describe('formatJakarta', () => {
  it('renders an instant back in Jakarta wall-clock terms', () => {
    const instant = new Date('2026-08-19T13:58:37.000Z')
    expect(formatJakarta(instant, 'date')).toBe('19 Agu 2026')
    expect(formatJakarta(instant, 'time')).toBe('20:58:37')
    expect(formatJakarta(instant, 'datetime')).toBe('19 Agu 2026 20:58:37')
  })

  it('renders the ISO date and HH:MM a form control needs', () => {
    const instant = new Date('2026-08-19T13:58:37.000Z')
    expect(formatJakarta(instant, 'iso-date')).toBe('2026-08-19')
    expect(formatJakarta(instant, 'iso-time')).toBe('20:58')
    // Just past midnight in Jakarta is still the previous day in UTC.
    expect(formatJakarta(new Date('2026-08-19T17:30:00.000Z'), 'iso-date')).toBe('2026-08-20')
  })
})

describe('formatMonthKey', () => {
  it('says the month the way a person would', () => {
    expect(formatMonthKey('2027-03')).toBe('Mar 2027')
    expect(formatMonthKey('2026-08')).toBe('Agu 2026')
    expect(formatMonthKey('2026-12')).toBe('Des 2026')
  })

  it('shortens the year where space is tight', () => {
    expect(formatMonthKey('2027-03', 'compact')).toBe("Mar '27")
  })

  it('hands back anything that is not a month key, rather than guessing', () => {
    // A silently wrong month is worse than an obviously wrong string.
    expect(formatMonthKey('2027-13')).toBe('2027-13')
    expect(formatMonthKey('2027-3')).toBe('2027-3')
    expect(formatMonthKey('')).toBe('')
  })
})
