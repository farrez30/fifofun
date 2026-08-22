import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({}) }))

const {
  fail,
  hhmmField,
  isoDateField,
  monthKeyField,
  optionalSen,
  optionalUuid,
  positiveSen,
  rupiahField,
  senField,
} = await import('./actions')

describe('senField', () => {
  it('reads sen digits into a bigint without a float', () => {
    expect(senField.parse('155257400')).toBe(155257400n)
    expect(senField.parse(' 0 ')).toBe(0n)
    // A hundred trillion rupiah exactly, the ceiling itself, still passes.
    expect(senField.parse('10000000000000000')).toBe(10_000_000_000_000_000n)
  })

  it('refuses anything that is not digits, and anything past the ceiling', () => {
    expect(senField.safeParse('1.552.574').success).toBe(false)
    expect(senField.safeParse('-1').success).toBe(false)
    expect(senField.safeParse('').success).toBe(false)
    expect(senField.safeParse('10000000000000001').success).toBe(false)
    expect(senField.safeParse('99999999999999999999').success).toBe(false)
  })

  it('positiveSen refuses zero with an Indonesian message', () => {
    const result = positiveSen.safeParse('0')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Nominalnya harus lebih dari nol.')
    }
    expect(positiveSen.parse('1')).toBe(1n)
  })

  it('optionalSen treats empty and zero alike as none', () => {
    expect(optionalSen.parse('')).toBeNull()
    expect(optionalSen.parse('0')).toBeNull()
    expect(optionalSen.parse('250000')).toBe(250000n)
    expect(optionalSen.safeParse('abc').success).toBe(false)
  })
})

describe('rupiahField', () => {
  it('parses Indonesian money text through the one money parser', () => {
    expect(rupiahField.parse('1.552.574,00')).toBe(155257400n)
    expect(rupiahField.parse('Rp50.000')).toBe(5000000n)
  })

  it('says what went wrong in Indonesian', () => {
    const empty = rupiahField.safeParse('')
    expect(empty.success).toBe(false)
    if (!empty.success) expect(empty.error.issues[0].message).toBe('Nominalnya belum diisi.')
    const garbage = rupiahField.safeParse('1,234.5')
    expect(garbage.success).toBe(false)
    if (!garbage.success) {
      expect(garbage.error.issues[0].message).toBe('Nominalnya belum bisa dibaca.')
    }
  })
})

describe('date and id fields', () => {
  it('accepts a month key or nothing', () => {
    expect(monthKeyField.parse('2027-03')).toBe('2027-03')
    expect(monthKeyField.parse('')).toBeNull()
    expect(monthKeyField.safeParse('2027-13').success).toBe(false)
  })

  it('accepts a uuid or nothing', () => {
    expect(optionalUuid.parse('')).toBeNull()
    expect(optionalUuid.parse('00000000-0000-4000-8000-000000000000')).toBe(
      '00000000-0000-4000-8000-000000000000',
    )
    expect(optionalUuid.safeParse('nope').success).toBe(false)
  })

  it('reads what date and time inputs submit', () => {
    expect(isoDateField.parse('2026-08-22')).toBe('2026-08-22')
    expect(isoDateField.safeParse('2026-8-2').success).toBe(false)
    expect(hhmmField.parse('09:05')).toBe('09:05')
    expect(hhmmField.safeParse('24:00').success).toBe(false)
  })
})

describe('fail', () => {
  it('builds a refusal without a detail when none is given', () => {
    expect(fail('Tidak bisa.')).toEqual({ ok: false, message: 'Tidak bisa.', detail: undefined })
  })
})
