import { describe, expect, it } from 'vitest'
import { backFrom, transactionHref } from './back'

const LAPORAN = { href: '/laporan', label: 'Laporan' }
const ID = '3f0c2b7e-9a41-4d2e-8c55-1b2a3c4d5e6f'

describe('backFrom', () => {
  it('names the page it goes back to, by the label the navigation uses', () => {
    expect(backFrom('/catat', LAPORAN)).toEqual({ href: '/catat', label: 'Catat' })
    expect(backFrom('/', LAPORAN)).toEqual({ href: '/', label: 'Ringkasan' })
    expect(backFrom('/pengaturan', LAPORAN)).toEqual({ href: '/pengaturan', label: 'Pengaturan' })
  })

  it('keeps the filters, the page and the anchor of the list it came from', () => {
    expect(backFrom('/laporan?kategori=Bensin&hal=3#daftar', LAPORAN)).toEqual({
      href: '/laporan?kategori=Bensin&hal=3#daftar',
      label: 'Laporan',
    })
  })

  it('goes back to the whole row from one of its parts', () => {
    expect(backFrom(`/transaksi/${ID}?dari=%2Flaporan`, LAPORAN)).toEqual({
      href: `/transaksi/${ID}?dari=%2Flaporan`,
      label: 'Transaksi utuh',
    })
  })

  it('takes the first value when the parameter is repeated', () => {
    expect(backFrom(['/tinjau', '/catat'], LAPORAN).label).toBe('Tinjau')
  })

  it('falls back to the logical parent when there is no origin', () => {
    expect(backFrom(undefined, LAPORAN)).toBe(LAPORAN)
    expect(backFrom('', LAPORAN)).toBe(LAPORAN)
  })

  it('never leaves the site, however the address is dressed up', () => {
    for (const hostile of [
      'https://evil.example/laporan',
      '//evil.example/laporan',
      '/\\evil.example',
      '\\\\evil.example',
      'javascript:alert(1)',
      ' /laporan',
    ]) {
      expect(backFrom(hostile, LAPORAN)).toBe(LAPORAN)
    }
  })

  it('refuses a path that is not one of the app’s pages', () => {
    expect(backFrom('/api/export', LAPORAN)).toBe(LAPORAN)
    expect(backFrom('/transaksi/bukan-uuid', LAPORAN)).toBe(LAPORAN)
    expect(backFrom('/laporan/../api', LAPORAN)).toBe(LAPORAN)
  })

  it('refuses an origin long enough to be abuse rather than a filter', () => {
    expect(backFrom(`/laporan?cari=${'a'.repeat(1000)}`, LAPORAN)).toBe(LAPORAN)
    expect(backFrom(`/laporan?cari=${'a'.repeat(900)}`, LAPORAN).label).toBe('Laporan')
  })
})

describe('transactionHref', () => {
  it('carries the origin encoded, so its own query does not leak into the detail page', () => {
    expect(transactionHref(ID, '/laporan?kategori=Bensin&hal=2#daftar')).toBe(
      `/transaksi/${ID}?dari=%2Flaporan%3Fkategori%3DBensin%26hal%3D2%23daftar`,
    )
  })

  it('is the bare address when there is nothing to remember', () => {
    expect(transactionHref(ID)).toBe(`/transaksi/${ID}`)
  })
})
