import { beforeEach, describe, expect, it, vi } from 'vitest'
import { argsFor, createSupabaseStub } from '@/test/supabase-stub'

/**
 * What the map lets a household write.
 *
 * Every write must carry the household that `context()` found, never one the
 * form named, and a coordinate the map could not have produced must be refused
 * before it reaches the database's own check.
 */

const stub = createSupabaseStub()
const search = vi.fn()

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => stub.client }))
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
  stub.calls.length = 0
  stub.setUser({ id: 'u1' })
  search.mockReset()
  vi.mocked(updateTag).mockClear()
})

function household() {
  stub.queue('households', { data: { id: 'h1' } })
}

describe('saveMerchantLocation', () => {
  it('upserts one row per merchant under the signed-in household', async () => {
    household()
    stub.queue('merchant_locations', { data: [] }, { data: [{ id: 'l1' }] })

    const result = await saveMerchantLocation(null, form({ ...PLACE, householdId: 'someone-else' }))

    expect(result.ok).toBe(true)
    const [, call] = stub.callsOn('merchant_locations')
    expect(call.payload).toEqual({
      household_id: 'h1',
      merchant_key: 'boga rasaa',
      label: 'Boga Rasaa',
      address: 'Jl. Tebet Raya',
      lat: -6.2297465,
      lng: 106.8540123,
      source: 'osm',
      valid_from: null,
      valid_to: null,
    })
    expect(argsFor(call, 'upsert')[0][1]).toEqual({ onConflict: 'household_id,merchant_key,valid_from' })
    expect(updateTag).toHaveBeenCalledWith('places:h1')
  })

  const KOST = '00000000-0000-4000-8000-0000000000b2'
  const HOUSE = { id: '00000000-0000-4000-8000-0000000000b1', label: 'Rumah Jatiasih', valid_from: null, valid_to: '2025-12-31' }

  it('moves one stored point by its id, inside the household', async () => {
    household()
    stub.queue('merchant_locations', { data: [HOUSE, { id: KOST, label: 'Tata Kost', valid_from: '2026-06-01', valid_to: null }] }, { data: [{ id: KOST }] })
    const result = await saveMerchantLocation(null, form({ ...PLACE, merchantKey: 'pln iconpay', id: KOST, validFrom: '2026-06-01' }))
    expect(result.ok).toBe(true)
    const [, call] = stub.callsOn('merchant_locations')
    expect(call.chain).toContain('update')
    expect(argsFor(call, 'eq')).toEqual([
      ['id', KOST],
      ['household_id', 'h1'],
    ])
    expect(call.payload).toMatchObject({ valid_from: '2026-06-01', valid_to: null })
  })

  it('refuses a period that shares a day with another point of the same merchant', async () => {
    household()
    stub.queue('merchant_locations', { data: [HOUSE] })
    const result = await saveMerchantLocation(null, form({ ...PLACE, merchantKey: 'pln iconpay', validFrom: '2025-11-01' }))
    expect(result.ok).toBe(false)
    expect(result.message).toContain('bertabrakan')
    expect(stub.callsOn('merchant_locations')).toHaveLength(1)
  })

  it('accepts a later period beside an earlier one', async () => {
    household()
    stub.queue('merchant_locations', { data: [HOUSE] }, { data: [{ id: KOST }] })
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
    household()
    stub.queue('merchant_locations', { data: [] }, { data: [{ id: 'l1' }] })
    await saveMerchantLocation(null, form({ ...PLACE, address: '  ', source: 'manual' }))
    expect((stub.callsOn('merchant_locations')[1].payload as { address: unknown }).address).toBeNull()
  })

  it('asks a signed-out visitor to sign in again', async () => {
    stub.setUser(null)
    const result = await saveMerchantLocation(null, form(PLACE))
    expect(result.ok).toBe(false)
    expect(result.message).toContain('Sesi')
  })

  it('keeps the database message on the server', async () => {
    household()
    stub.queue('merchant_locations', { data: [] }, { error: { message: 'violates check constraint "merchant_locations_bounds"' } })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await saveMerchantLocation(null, form(PLACE))
    expect(result.ok).toBe(false)
    expect(JSON.stringify(result)).not.toContain('merchant_locations_bounds')
    spy.mockRestore()
  })
})

describe('markPlaceless', () => {
  it('keeps the merchant with no coordinates', async () => {
    household()
    stub.queue('merchant_locations', { data: [{ id: 'l1' }] })
    const result = await markPlaceless(null, form({ merchantKey: 'lynkid', label: 'LynkId' }))
    expect(result.ok).toBe(true)
    expect(stub.callsOn('merchant_locations')[0].payload).toMatchObject({
      household_id: 'h1',
      merchant_key: 'lynkid',
      lat: null,
      lng: null,
    })
  })
})

describe('deleteMerchantLocation', () => {
  const id = '00000000-0000-4000-8000-0000000000a1'

  it('deletes only inside the household', async () => {
    household()
    stub.queue('merchant_locations', { data: [{ id }] })
    const result = await deleteMerchantLocation(null, form({ id }))
    expect(result.ok).toBe(true)
    const [call] = stub.callsOn('merchant_locations')
    expect(argsFor(call, 'eq')).toEqual([
      ['id', id],
      ['household_id', 'h1'],
    ])
  })

  it('says so when nothing was there to delete', async () => {
    household()
    stub.queue('merchant_locations', { data: [] })
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
    stub.setUser(null)
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
    household()
    const candidate = { label: 'Boga Rasaa', address: 'Tebet, Jakarta', lat: -6.23, lng: 106.85 }
    search.mockResolvedValue([candidate])
    const result = await searchPlace(null, form({ q: '  boga rasaa ' }))
    expect(search).toHaveBeenCalledWith('boga rasaa')
    expect(result).toMatchObject({ ok: true, candidates: [candidate] })
  })

  it('tells "nothing found" apart from "could not ask"', async () => {
    household()
    search.mockResolvedValue([])
    const none = await searchPlace(null, form({ q: 'warung tak bernama' }))
    expect(none.ok).toBe(true)
    expect(none.message).toContain('Tidak ada')

    household()
    search.mockResolvedValue(null)
    const down = await searchPlace(null, form({ q: 'warung tak bernama' }))
    expect(down.ok).toBe(false)
    expect(down.message).toContain('tidak menjawab')
  })
})
