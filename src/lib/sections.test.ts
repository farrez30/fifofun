import { describe, expect, it } from 'vitest'
import { sectionHref, sectionOf } from './sections'

const PETA = ['peta', 'menunggu', 'tempat', 'online'] as const

describe('sectionOf', () => {
  it('reads one of the page’s own views', () => {
    expect(sectionOf('tempat', PETA)).toBe('tempat')
    expect(sectionOf(' Menunggu ', PETA)).toBe('menunggu')
  })

  it('falls back to the first view for anything else, never to nothing', () => {
    expect(sectionOf(undefined, PETA)).toBe('peta')
    expect(sectionOf('', PETA)).toBe('peta')
    expect(sectionOf('<script>', PETA)).toBe('peta')
  })

  it('takes the first value when the parameter is repeated', () => {
    expect(sectionOf(['online', 'tempat'], PETA)).toBe('online')
  })
})

describe('sectionHref', () => {
  it('keeps the filters and names the view', () => {
    expect(sectionHref('/peta', { kategori: 'Bensin', dari: '' }, 'tempat', 'peta')).toBe(
      '/peta?kategori=Bensin&bagian=tempat',
    )
  })

  it('writes the first view without a parameter', () => {
    expect(sectionHref('/peta', { kategori: 'Bensin' }, 'peta', 'peta')).toBe('/peta?kategori=Bensin')
    expect(sectionHref('/pengaturan', {}, 'akun', 'akun')).toBe('/pengaturan')
  })
})
