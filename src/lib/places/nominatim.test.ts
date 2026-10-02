import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/cache', () => ({ cacheLife: vi.fn() }))

const { readCandidates, searchPlaces, searchUrl } = await import('./nominatim')

/** Trimmed from a real answer for "boga rasaa tebet". */
const ANSWER = [
  {
    place_id: 1,
    lat: '-6.2297465',
    lon: '106.8540123',
    name: 'Boga Rasaa',
    display_name: 'Boga Rasaa, Jalan Tebet Raya, Tebet, Jakarta Selatan, Daerah Khusus Jakarta, 12810, Indonesia',
  },
  {
    place_id: 2,
    lat: '-6.9',
    lon: '107.6',
    name: '',
    display_name: 'Jalan Braga, Sumur Bandung, Bandung, Jawa Barat, Indonesia',
  },
]

describe('searchUrl', () => {
  it('asks Indonesia only, biased to where the household spends, and encodes the name', () => {
    const url = new URL(searchUrl('a&w la riviera'))
    expect(url.origin).toBe('https://nominatim.openstreetmap.org')
    expect(url.searchParams.get('q')).toBe('a&w la riviera')
    expect(url.searchParams.get('countrycodes')).toBe('id')
    expect(url.searchParams.get('bounded')).toBe('0')
    expect(url.searchParams.get('format')).toBe('jsonv2')
  })
})

describe('readCandidates', () => {
  it('keeps a name, an address and the point', () => {
    expect(readCandidates(ANSWER)).toEqual([
      {
        label: 'Boga Rasaa',
        address: ANSWER[0].display_name,
        lat: -6.2297465,
        lng: 106.8540123,
      },
      { label: 'Jalan Braga', address: ANSWER[1].display_name, lat: -6.9, lng: 107.6 },
    ])
  })

  it('drops an answer it cannot trust instead of drawing it', () => {
    expect(readCandidates({ error: 'Unable to geocode' })).toEqual([])
    expect(readCandidates([{ ...ANSWER[0], lat: '95' }])).toEqual([])
    expect(readCandidates([{ ...ANSWER[0], lon: 'javascript:alert(1)' }])).toEqual([])
  })
})

describe('searchPlaces', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('identifies itself and never follows a redirect', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(ANSWER)))
    vi.stubGlobal('fetch', fetchMock)
    const found = await searchPlaces('Boga Rasaa')
    expect(found).toHaveLength(2)
    const [url, init] = fetchMock.mock.calls[0]
    expect(new URL(url).searchParams.get('q')).toBe('boga rasaa')
    expect(init.headers['User-Agent']).toMatch(/^FiFoFun\//)
    expect(init.redirect).toBe('error')
  })

  it('answers null, not an empty list, when OpenStreetMap is down', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('busy', { status: 503 })))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await searchPlaces('boga rasaa')).toBeNull()
    spy.mockRestore()
  })
})
