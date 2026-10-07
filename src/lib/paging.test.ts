import { describe, expect, it } from 'vitest'
import { PAGE_SIZE, pageCount, pageHref, pageSlice, pageWindow, parsePage } from './paging'

describe('parsePage', () => {
  it('reads a page number and refuses anything that is not one', () => {
    expect(parsePage('3')).toBe(3)
    expect(parsePage(undefined)).toBe(1)
    expect(parsePage('0')).toBe(1)
    expect(parsePage('-2')).toBe(1)
    expect(parsePage('halaman dua')).toBe(1)
    expect(parsePage('1.5')).toBe(1)
  })

  it('takes the first value when the parameter is repeated', () => {
    expect(parsePage(['2', '9'])).toBe(2)
  })
})

describe('pageCount', () => {
  it('counts a partial last page, and gives an empty list one page', () => {
    expect(pageCount(0)).toBe(1)
    expect(pageCount(1)).toBe(1)
    expect(pageCount(PAGE_SIZE)).toBe(1)
    expect(pageCount(PAGE_SIZE + 1)).toBe(2)
    // The ledger at the time of writing, twenty to a page.
    expect(pageCount(1591)).toBe(80)
  })

  it('takes another page size when a list needs one', () => {
    expect(pageCount(168, 10)).toBe(17)
  })
})

describe('pageSlice', () => {
  const rows = Array.from({ length: 50 }, (_, index) => index)

  it('cuts the page asked for, and a short last page', () => {
    expect(pageSlice(rows, 1)[0]).toBe(0)
    expect(pageSlice(rows, 2)[0]).toBe(PAGE_SIZE)
    expect(pageSlice(rows, 3)).toHaveLength(50 - 2 * PAGE_SIZE)
  })

  it('gives nothing for a page past the end rather than throwing', () => {
    expect(pageSlice(rows, 99)).toEqual([])
  })
})

describe('pageHref', () => {
  it('keeps the parameters that are on and leaves out the ones that are not', () => {
    expect(pageHref('/laporan', { dari: '2026-01-01', sampai: '', cari: 'alfamart' }, 2)).toBe(
      '/laporan?dari=2026-01-01&cari=alfamart&hal=2',
    )
  })

  it('writes the first page as no page at all', () => {
    // One filtered list, one address. A ?hal=1 that means the same thing as
    // no parameter is a second address for the same page.
    expect(pageHref('/laporan', { cari: 'kopi' }, 1)).toBe('/laporan?cari=kopi')
    expect(pageHref('/laporan', {}, 1)).toBe('/laporan')
  })

  it('replaces a page already in the parameters rather than adding a second', () => {
    expect(pageHref('/laporan', { cari: 'kopi', hal: '4' }, 5)).toBe('/laporan?cari=kopi&hal=5')
  })

  it('escapes what a person typed', () => {
    expect(pageHref('/laporan', { cari: 'kopi & roti' }, 2)).toBe('/laporan?cari=kopi+%26+roti&hal=2')
  })

  it('works for any page that pages a list', () => {
    expect(pageHref('/peta', { bagian: 'tempat' }, 3)).toBe('/peta?bagian=tempat&hal=3')
  })
})

describe('pageWindow', () => {
  it('shows every page when there are only a few', () => {
    expect(pageWindow(1, 1)).toEqual([1])
    expect(pageWindow(2, 4)).toEqual([1, 2, 3, 4])
  })

  it('keeps both ends and the neighbours of the current page', () => {
    expect(pageWindow(1, 16)).toEqual([1, 2, null, 16])
    expect(pageWindow(8, 16)).toEqual([1, null, 7, 8, 9, null, 16])
    expect(pageWindow(16, 16)).toEqual([1, null, 15, 16])
  })

  it('draws a gap of one page as the page itself, not an ellipsis', () => {
    expect(pageWindow(4, 16)).toEqual([1, 2, 3, 4, 5, null, 16])
    expect(pageWindow(3, 5)).toEqual([1, 2, 3, 4, 5])
  })
})
