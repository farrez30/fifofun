import { describe, expect, it } from 'vitest'
import {
  CODE_ENTROPY_BITS,
  expiryFrom,
  formatCode,
  generateCode,
  hashCode,
  normaliseCode,
  stateOf,
} from './index'

describe('generateCode', () => {
  it('never emits a character that can be misread as another', () => {
    // I/1, L/1 and O/0 are the pairs that break a code read off one screen and
    // typed into another, so none of the five is ever generated.
    const codes = Array.from({ length: 500 }, generateCode).join('')
    expect(codes).not.toMatch(/[ILO01]/)
  })

  it('is long enough that guessing is not a strategy', () => {
    expect(CODE_ENTROPY_BITS).toBeGreaterThanOrEqual(48)
  })

  it('does not repeat itself', () => {
    const codes = new Set(Array.from({ length: 1000 }, generateCode))
    expect(codes.size).toBe(1000)
  })
})

describe('normaliseCode', () => {
  const code = generateCode()

  it('forgives the case and the separator it was displayed with', () => {
    expect(normaliseCode(formatCode(code).toLowerCase())).toBe(code)
    expect(normaliseCode(`  ${formatCode(code)} `)).toBe(code)
  })

  it('refuses a character that was never in a code', () => {
    // Dropping it silently would let two different strings redeem one invite.
    expect(normaliseCode(code.slice(0, 9) + 'O')).toBeNull()
    expect(normaliseCode(code.slice(0, 9) + '!')).toBeNull()
  })

  it('refuses anything of the wrong length', () => {
    expect(normaliseCode(code.slice(0, 9))).toBeNull()
    expect(normaliseCode(code + 'A')).toBeNull()
    expect(normaliseCode('')).toBeNull()
  })
})

describe('hashCode', () => {
  it('is what gets stored, so the code itself never is', () => {
    const code = generateCode()
    expect(hashCode(code)).not.toContain(code)
    expect(hashCode(code)).toHaveLength(64)
  })

  it('gives the same answer twice, which is the whole point', () => {
    const code = generateCode()
    expect(hashCode(code)).toBe(hashCode(code))
  })
})

describe('stateOf', () => {
  const now = new Date('2026-08-21T00:00:00Z')
  const invite = (over: Partial<Parameters<typeof stateOf>[0]> = {}) => ({
    id: 'i1',
    createdAt: new Date('2026-08-20T00:00:00Z'),
    expiresAt: expiryFrom(new Date('2026-08-20T00:00:00Z')),
    redeemedAt: null,
    ...over,
  })

  it('calls a fresh invite open', () => {
    expect(stateOf(invite(), now)).toBe('open')
  })

  it('calls a used invite redeemed even after its expiry passes', () => {
    // Otherwise the list would tell somebody an invite that was accepted had
    // merely run out, and they would issue a second one for nobody.
    expect(
      stateOf(invite({ redeemedAt: new Date('2026-08-20T01:00:00Z') }), new Date('2027-01-01')),
    ).toBe('redeemed')
  })

  it('calls an unused invite past its date expired', () => {
    expect(stateOf(invite(), new Date('2026-09-01'))).toBe('expired')
  })

  it('expires on the boundary rather than one moment after it', () => {
    const expiresAt = expiryFrom(now)
    expect(stateOf(invite({ expiresAt }), expiresAt)).toBe('expired')
  })
})
