import { describe, expect, it } from 'vitest'
import { PAGE_SIZE, pageCount, pageHref, pageSlice, parsePage } from './paging'

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
  it('counts a partial last page, and gives an empty report one page', () => {
    expect(pageCount(0)).toBe(1)
    expect(pageCount(1)).toBe(1)
    expect(pageCount(PAGE_SIZE)).toBe(1)
    expect(pageCount(PAGE_SIZE + 1)).toBe(2)
    expect(pageCount(1591)).toBe(32)
  })
})

describe('pageSlice', () => {
  const rows = Array.from({ length: 120 }, (_, index) => index)

  it('cuts the page asked for', () => {
    expect(pageSlice(rows, 1)[0]).toBe(0)
    expect(pageSlice(rows, 2)[0]).toBe(PAGE_SIZE)
    expect(pageSlice(rows, 3)).toHaveLength(20)
  })

  it('gives nothing for a page past the end rather than throwing', () => {
    expect(pageSlice(rows, 99)).toEqual([])
  })
})

describe('pageHref', () => {
  it('keeps the filters that are on and leaves out the ones that are not', () => {
    expect(pageHref({ dari: '2026-01-01', sampai: '', cari: 'alfamart' }, 2)).toBe(
      '/laporan?dari=2026-01-01&cari=alfamart&hal=2',
    )
  })

  it('writes the first page as no page at all', () => {
    // One filtered report, one address. A ?hal=1 that means the same thing as
    // no parameter is a second address for the same page.
    expect(pageHref({ cari: 'kopi' }, 1)).toBe('/laporan?cari=kopi')
    expect(pageHref({}, 1)).toBe('/laporan')
  })

  it('replaces a page already in the parameters rather than adding a second', () => {
    expect(pageHref({ cari: 'kopi', hal: '4' }, 5)).toBe('/laporan?cari=kopi&hal=5')
  })

  it('escapes what a person typed', () => {
    expect(pageHref({ cari: 'kopi & roti' }, 2)).toBe('/laporan?cari=kopi+%26+roti&hal=2')
  })
})
