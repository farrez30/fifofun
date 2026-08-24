import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ICON_BY_CASHFLOW,
  HUE_COUNT,
  PRESET_HUES,
  SEED_PALETTE,
  categoryHue,
  categoryIcon,
  hueFor,
  parseHue,
} from './palette'
import { SEED_CATEGORIES } from './seed-data'
import { CASHFLOW_TYPES } from './types'

describe('hueFor', () => {
  it('returns the same hue for the same name every time', () => {
    expect(hueFor('Makan/minum')).toBe(hueFor('Makan/minum'))
    expect(hueFor('makan/minum ')).toBe(hueFor('Makan/minum'))
  })

  it('stays inside 0 to 359 for awkward input', () => {
    for (const name of ['', 'x', 'Skin & Body Care', 'Pulsa & Data', 'ÄÖÜ ñ 漢字', 'a'.repeat(500)]) {
      const hue = hueFor(name)
      expect(Number.isInteger(hue)).toBe(true)
      expect(hue).toBeGreaterThanOrEqual(0)
      expect(hue).toBeLessThan(HUE_COUNT)
    }
  })
})

describe('SEED_PALETTE', () => {
  it('gives every seed name a hue and an icon', () => {
    for (const category of SEED_CATEGORIES) {
      const entry = SEED_PALETTE[category.name]
      expect(entry, category.name).toBeDefined()
      expect(entry.hue).toBeGreaterThanOrEqual(0)
      expect(entry.hue).toBeLessThan(HUE_COUNT)
      expect(entry.icon).toMatch(/^[A-Z][A-Za-z]+$/)
    }
  })

  it('spreads the spending groups at least 8 degrees apart', () => {
    /*
      The groups are the ribbons a Sankey column draws side by side, so this is
      the comparison the spread has to survive.

      This used to cover every spending name, which was affordable while there
      were twenty of them. There are forty-three now, and eight degrees apiece
      would need three hundred and forty-four of the three hundred and sixty
      available, leaving a scheme with no room to also keep consecutive names
      apart. Spread is finite; it is spent where it is looked at.
    */
    const hues = SEED_CATEGORIES.filter((c) => c.cashflow === 'spending' && !c.parent)
      .map((c) => SEED_PALETTE[c.name].hue)
      .sort((a, b) => a - b)
    for (let i = 1; i < hues.length; i++) expect(hues[i] - hues[i - 1]).toBeGreaterThanOrEqual(8)
    expect(hues[0] + HUE_COUNT - hues[hues.length - 1]).toBeGreaterThanOrEqual(8)
  })

  it('spreads the names inside one group at least 8 degrees apart', () => {
    // Siblings are the other comparison a reader makes: they sit in one column
    // under their group, and in one block of rows under it in the report.
    const families = new Map<string, number[]>()
    for (const category of SEED_CATEGORIES) {
      if (!category.parent) continue
      const hue = SEED_PALETTE[category.name].hue
      families.set(category.parent, [...(families.get(category.parent) ?? []), hue])
    }

    for (const [parent, all] of families) {
      const hues = [...new Set(all)].sort((a, b) => a - b)
      expect(hues.length, parent).toBe(all.length)
      for (let i = 1; i < hues.length; i++)
        expect(hues[i] - hues[i - 1], parent).toBeGreaterThanOrEqual(8)
    }
  })

  it('shares one hue between both sides of a pot', () => {
    // Tabungan is one pot whether money goes in (invest_savings) or comes back
    // out (from_asset); the palette is keyed by name, so that is automatic.
    const sides = SEED_CATEGORIES.filter((c) => c.name === 'Tabungan')
    expect(sides.length).toBe(2)
    expect(new Set(sides.map((c) => SEED_PALETTE[c.name].hue)).size).toBe(1)
  })
})

describe('PRESET_HUES', () => {
  it('offers twelve hues thirty degrees apart', () => {
    expect(PRESET_HUES).toHaveLength(12)
    PRESET_HUES.forEach((hue, index) => expect(hue).toBe(index * 30))
  })
})

describe('parseHue', () => {
  it('reads an integer string between 0 and 359', () => {
    expect(parseHue('0')).toBe(0)
    expect(parseHue('359')).toBe(359)
    expect(parseHue(210)).toBe(210)
  })

  it('returns null for anything else rather than NaN', () => {
    expect(parseHue('360')).toBeNull()
    expect(parseHue('-1')).toBeNull()
    expect(parseHue('12,5')).toBeNull()
    expect(parseHue('')).toBeNull()
    expect(parseHue(null)).toBeNull()
    expect(parseHue(undefined)).toBeNull()
  })
})

describe('categoryHue and categoryIcon', () => {
  it('prefers the stored hue over the name', () => {
    expect(categoryHue({ name: 'Belanja', hue: 42 })).toBe(42)
    expect(categoryHue({ name: 'Belanja', hue: null })).toBe(SEED_PALETTE.Belanja.hue)
    expect(categoryHue({ name: 'Kategori Baru', hue: null })).toBe(hueFor('Kategori Baru'))
  })

  it('falls back to the cashflow icon when none is stored', () => {
    expect(categoryIcon({ cashflow: 'bills', icon: null })).toBe('Receipt')
    expect(categoryIcon({ cashflow: 'bills', icon: 'WifiHigh' })).toBe('WifiHigh')
    for (const cashflow of CASHFLOW_TYPES) expect(DEFAULT_ICON_BY_CASHFLOW[cashflow]).toBeTruthy()
  })
})
