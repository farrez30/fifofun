import { describe, expect, it } from 'vitest'
import { contrast, INK_DARK, INK_LIGHT, inkOn, logoUrl, normaliseHex } from './brand'

describe('normaliseHex', () => {
  it('accepts what a colour input or a person types, and stores one spelling', () => {
    expect(normaliseHex('#003D79')).toBe('#003d79')
    expect(normaliseHex('ee4d2d')).toBe('#ee4d2d')
    expect(normaliseHex('  #FFA800 ')).toBe('#ffa800')
  })

  it('refuses anything the database check would refuse', () => {
    expect(normaliseHex('')).toBeNull()
    expect(normaliseHex(null)).toBeNull()
    expect(normaliseHex('#fff')).toBeNull()
    expect(normaliseHex('red')).toBeNull()
    expect(normaliseHex('#003d79; background:url(x)')).toBeNull()
  })
})

describe('inkOn', () => {
  it('puts white on dark brand colours and black on light ones', () => {
    expect(inkOn('#003d79')).toBe(INK_LIGHT) // Mandiri
    expect(inkOn('#4c3494')).toBe(INK_LIGHT) // OVO
    expect(inkOn('#ffa800')).toBe(INK_DARK) // Jago
    expect(inkOn('#30d6d8')).toBe(INK_DARK) // blu
  })

  it('always clears AA for body text, whatever the colour', () => {
    for (let n = 0; n <= 0xffffff; n += 0x0f0f0f) {
      const hex = `#${n.toString(16).padStart(6, '0')}`
      expect(contrast(hex, inkOn(hex))).toBeGreaterThanOrEqual(4.5)
    }
  })
})

describe('logoUrl', () => {
  it('has no URL without an icon, and a new one whenever the icon changes', () => {
    expect(logoUrl('a1', null)).toBeNull()
    expect(logoUrl('a1', 'abcdef0123456789')).toBe('/akun/a1/logo?v=abcdef012345')
  })
})
