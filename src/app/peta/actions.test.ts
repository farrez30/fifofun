import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createScopeStub } from '@/test/scope-stub'

/**
 * What the map lets a household write.
 *
 * Every write must carry the household that `context()` found, never one the
 * form named, and a coordinate the map could not have produced must be refused
 * before it reaches the database's own check.
 */

const stub = createScopeStub()
const search = vi.fn()
let signedIn = true

vi.mock('@/db/client', () => ({ db: {} }))
vi.mock('@/lib/auth/session', () => ({ getUser: async () => null, userScope: async () => null }))
vi.mock('@/lib/actions', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/actions')>()),
  context: async () => (signedIn ? { db: stub.scope, householdId: 'h1', userId: 'u1' } : null),
}))
vi.mock('@/lib/places/nominatim', () => ({ searchPlaces: (query: string) => search(query) }))
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
  revalidateTag: vi.fn(),
  cacheTag: vi.fn(),
  cacheLife: vi.fn(),
}))

const { saveMerchantLocation, markPlaceless, deleteMerchantLocation, searchPlace } = await import('./actions')
const { updateTag } = await import('next/cache')

function form(fields: Record<string, string>) {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.append(key, value)
  return data
}

const PLACE = {
  merchantKey: 'boga rasaa',
  label: 'Boga Rasaa',
  address: 'Jl. Tebet Raya',
  lat: '-6.2297465',
  lng: '106.8540123',
  source: 'osm',
}

beforeEach(() => {
  stub.reset()
  signedIn = true
  search.mockReset()
  vi.mocked(updateTag).mockClear()
})

describe('saveMerchantLocation', () => {
  it('upserts one row per merchant under the signed-in household', async () => {
    stub.queue([])
    stub.queue([{ id: 'l1' }])

    const result = await saveMerchantLocation(null, form({ ...PLACE, householdId: 'someone-else' }))

    expect(result.ok).toBe(true)
    const [read, call] = stub.calls
    expect(read.sql).toContain('WHERE household_id = $1 AND merchant_key = $2')
    expect(read.params).toEqual(['h1', 'boga rasaa'])
    expect(call.sql).toContain('INSERT INTO public.merchant_locations')
    expect(call.params).toEqual(['h1', 'boga rasaa', 'Boga Rasaa', 'Jl. Tebet Raya', -6.2297465, 106.8540123, 'osm', null, null])
    expect(call.sql).toContain('ON CONFLICT (household_id, merchant_key, valid_from) DO UPDATE')
    expect(updateTag).toHaveBeenCalledWith('places:h1')
  })

  const KOST = '00000000-0000-4000-8000-0000000000b2'
  const HOUSE = { id: '00000000-0000-4000-8000-0000000000b1', label: 'Rumah Jatiasih', valid_from: null, valid_to: '2025-12-31' }

  it('moves one stored point by its id, inside the household', async () => {
    stub.queue([HOUSE, { id: KOST, label: 'Tata Kost', valid_from: '2026-06-01', valid_to: null }])
    stub.queue([{ id: KOST }])
    const result = await saveMerchantLocation(null, form({ ...PLACE, merchantKey: 'pln iconpay', id: KOST, validFrom: '2026-06-01' }))
    expect(result.ok).toBe(true)
    const [, call] = stub.calls
    expect(call.sql).toContain('UPDATE public.merchant_locations SET')
    expect(call.sql).toMatch(/WHERE id = \$\d+ AND household_id = \$\d+/)
    expect(call.params.slice(-2)).toEqual([KOST, 'h1'])
    expect(call.sql).toContain('"valid_from" = ')
    expect(call.params).toContain('2026-06-01')
  })

  it('refuses a period that shares a day with another point of the same merchant', async () => {
    stub.queue([HOUSE])
    const result = await saveMerchantLocation(null, form({ ...PLACE, merchantKey: 'pln iconpay', validFrom: '2025-11-01' }))
    expect(result.ok).toBe(false)
    expect(result.message).toContain('bertabrakan')
    expect(stub.calls).toHaveLength(1)
  })

  it('accepts a later period beside an earlier one', async () => {
    stub.queue([HOUSE])
    stub.queue([{ id: KOST }])
    const result = await saveMerchantLocation(null, form({ ...PLACE, merchantKey: 'pln iconpay', validFrom: '2026-06-01' }))
    expect(result.ok).toBe(true)
  })

  it('refuses dates the wrong way round before asking the database', async () => {
    const result = await saveMerchantLocation(null, form({ ...PLACE, validFrom: '2026-06-01', validTo: '2025-12-31' }))
    expect(result.ok).toBe(false)
    expect(stub.calls).toHaveLength(0)
  })

  it('refuses a point no map could produce', async () => {
    for (const bad of [{ lat: '91' }, { lng: '-181' }, { lat: '1e3' }, { lat: '' }, { lng: 'NaN' }]) {
      const result = await saveMerchantLocation(null, form({ ...PLACE, ...bad }))
      expect(result.ok).toBe(false)
    }
    expect(stub.calls).toHaveLength(0)
  })

  it('refuses a source the database does not know', async () => {
    const result = await saveMerchantLocation(null, form({ ...PLACE, source: 'riset' }))
    expect(result.ok).toBe(false)
  })

  it('stores an empty address as none', async () => {
    stub.queue([])
    stub.queue([{ id: 'l1' }])
    await saveMerchantLocation(null, form({ ...PLACE, address: '  ', source: 'manual' }))
    // household, key, label, then address
    expect(stub.calls[1].params[3]).toBeNull()
  })

  it('asks a signed-out visitor to sign in again', async () => {
    signedIn = false
    const result = await saveMerchantLocation(null, form(PLACE))
    expect(result.ok).toBe(false)
    expect(result.message).toContain('Sesi')
  })

  it('keeps the database message on the server', async () => {
    stub.queue([])
    stub.queueError('violates check constraint "merchant_locations_bounds"', '23514')
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await saveMerchantLocation(null, form(PLACE))
    expect(result.ok).toBe(false)
    expect(JSON.stringify(result)).not.toContain('merchant_locations_bounds')
    spy.mockRestore()
  })
})

describe('markPlaceless', () => {
  it('keeps the merchant with no coordinates', async () => {
    stub.queue([{ id: 'l1' }])
    const result = await markPlaceless(null, form({ merchantKey: 'lynkid', label: 'LynkId' }))
    expect(result.ok).toBe(true)
    const [call] = stub.calls
    expect(call.sql).toContain('VALUES ($1, $2, $3, NULL, NULL, NULL,')
    expect(call.params.slice(0, 3)).toEqual(['h1', 'lynkid', 'LynkId'])
    expect(call.sql).toContain('ON CONFLICT (household_id, merchant_key, valid_from)')
  })
})

describe('deleteMerchantLocation', () => {
  const id = '00000000-0000-4000-8000-0000000000a1'

  it('deletes only inside the household', async () => {
    stub.queue([{ id }])
    const result = await deleteMerchantLocation(null, form({ id }))
    expect(result.ok).toBe(true)
    const [call] = stub.calls
    expect(call.sql).toContain('DELETE FROM public.merchant_locations')
    expect(call.sql).toContain('WHERE id = $1 AND household_id = $2')
    expect(call.params).toEqual([id, 'h1'])
  })

  it('says so when nothing was there to delete', async () => {
    stub.queue([])
    const result = await deleteMerchantLocation(null, form({ id }))
    expect(result.ok).toBe(false)
  })

  it('refuses an id that is not one', async () => {
    const result = await deleteMerchantLocation(null, form({ id: "1' or '1'='1" }))
    expect(result.ok).toBe(false)
    expect(stub.calls).toHaveLength(0)
  })
})

describe('searchPlace', () => {
  it('needs a session before it asks OpenStreetMap anything', async () => {
    signedIn = false
    const result = await searchPlace(null, form({ q: 'boga rasaa' }))
    expect(result.ok).toBe(false)
    expect(search).not.toHaveBeenCalled()
  })

  it('refuses a query too short or too long to be a name', async () => {
    expect((await searchPlace(null, form({ q: 'a' }))).ok).toBe(false)
    expect((await searchPlace(null, form({ q: 'x'.repeat(101) }))).ok).toBe(false)
    expect(search).not.toHaveBeenCalled()
  })

  it('hands back the candidates', async () => {
    const candidate = { label: 'Boga Rasaa', address: 'Tebet, Jakarta', lat: -6.23, lng: 106.85 }
    search.mockResolvedValue([candidate])
    const result = await searchPlace(null, form({ q: '  boga rasaa ' }))
    expect(search).toHaveBeenCalledWith('boga rasaa')
    expect(result).toMatchObject({ ok: true, candidates: [candidate] })
  })

  it('tells "nothing found" apart from "could not ask"', async () => {
    search.mockResolvedValue([])
    const none = await searchPlace(null, form({ q: 'warung tak bernama' }))
    expect(none.ok).toBe(true)
    expect(none.message).toContain('Tidak ada')

    search.mockResolvedValue(null)
    const down = await searchPlace(null, form({ q: 'warung tak bernama' }))
    expect(down.ok).toBe(false)
    expect(down.message).toContain('tidak menjawab')
  })
})
