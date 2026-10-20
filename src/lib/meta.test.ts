import { describe, expect, it } from 'vitest'
import { metaText } from './meta'

const NBSP = '\u00a0'

describe('metaText', () => {
  it('keeps each part whole, so a line only breaks between parts', () => {
    expect(metaText(['Rp121.000', 'tgl 5'])).toBe(`Rp121.000 · tgl${NBSP}5`)
  })

  it('drops parts that are not there', () => {
    expect(metaText(['Jan 2026', null, false, '', undefined, 'dengan tagihan'])).toBe(
      `Jan${NBSP}2026 · dengan${NBSP}tagihan`,
    )
  })

  it('returns an empty string when nothing is left', () => {
    expect(metaText([null, false])).toBe('')
  })
})
