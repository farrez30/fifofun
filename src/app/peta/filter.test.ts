import { describe, expect, it } from 'vitest'
import { placingHref, readView, viewHref } from './filter'

describe('readView', () => {
  it('starts on every category, every month, weighed by money', () => {
    expect(readView({})).toEqual({
      filter: { categories: undefined, from: undefined, to: undefined, includeBills: false },
      mode: 'total',
      placing: null,
    })
  })

  it('reads a category, a month range and a mode', () => {
    expect(readView({ kategori: 'Dating', dari: '2026-01', sampai: '2026-08', mode: 'rata' })).toMatchObject({
      filter: { categories: ['Dating'], from: '2026-01', to: '2026-08' },
      mode: 'average',
    })
  })

  it('ignores what the address bar cannot mean', () => {
    const view = readView({ dari: '2026-13', sampai: 'kemarin', mode: 'semua', taruh: 'ab' })
    expect(view.filter.from).toBeUndefined()
    expect(view.filter.to).toBeUndefined()
    expect(view.mode).toBe('total')
    expect(view.placing).toBeNull()
  })

  it('includes bills only when the box was ticked', () => {
    expect(readView({ tagihan: 'ya' }).filter.includeBills).toBe(true)
    expect(readView({ tagihan: 'tidak' }).filter.includeBills).toBe(false)
    expect(viewHref({ tagihan: 'ya' }, { mode: 'kunjungan' })).toBe('/peta?mode=kunjungan&tagihan=ya')
  })

  it('swaps a range typed backwards', () => {
    expect(readView({ dari: '2026-08', sampai: '2026-01' }).filter).toMatchObject({ from: '2026-01', to: '2026-08' })
  })

  it('keeps the first of a repeated parameter and lowercases the merchant to place', () => {
    expect(readView({ kategori: ['Jajan', 'Dating'], taruh: 'BOGA RASAA' })).toMatchObject({
      filter: { categories: ['Jajan'] },
      placing: 'boga rasaa',
    })
  })
})

describe('viewHref', () => {
  it('changes one choice and keeps the others', () => {
    expect(viewHref({ kategori: 'Dating', dari: '2026-01' }, { mode: 'kunjungan' })).toBe(
      '/peta?kategori=Dating&dari=2026-01&mode=kunjungan',
    )
  })

  it('drops a choice set back to its default, and never carries the merchant being placed', () => {
    expect(viewHref({ mode: 'rata', taruh: 'boga rasaa' }, { mode: '' })).toBe('/peta')
  })
})

describe('placingHref', () => {
  it('opens one merchant for placing and keeps the filters', () => {
    expect(placingHref({ kategori: 'Dating' }, 'a&w la riviera')).toBe('/peta?kategori=Dating&taruh=a%26w%20la%20riviera#atur')
    expect(placingHref({}, 'boga rasaa')).toBe('/peta?taruh=boga%20rasaa#atur')
  })
})
