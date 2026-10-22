import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createScopeStub } from '@/test/scope-stub'
import { planFields } from '@/lib/planning/plan'

/**
 * What a saved plan is allowed to contain.
 *
 * The table carries a check constraint on every bound, and reaching it from a
 * form means a person sees a Postgres message naming a constraint instead of a
 * sentence naming their mistake. Everything the constraint knows is therefore
 * refused here first, in the same words the fields use.
 */

const stub = createScopeStub()
let signedIn = true

vi.mock('@/db/client', () => ({ db: {} }))
vi.mock('@/lib/auth/session', () => ({ getUser: async () => null, userScope: async () => null }))
vi.mock('@/lib/actions', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/actions')>()),
  context: async () => (signedIn ? { db: stub.scope, householdId: 'h1', userId: 'u1' } : null),
}))
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
  revalidateTag: vi.fn(),
  cacheTag: vi.fn(),
  cacheLife: vi.fn(),
}))

const { savePlan, resetPlan } = await import('./actions')

const VALID = {
  income: '817162900',
  adults: '2',
  children: '1',
  irregularIncome: '1',
  wantsZakat: '0',
  frameworkId: 'ojk-10-20-30-40',
  track: 'swasta',
  targetTier: 'nyaman',
  targetSavings: '163432580',
  childPlans: '[{"birthYear":2027,"track":"swasta"}]',
  goalTarget: '50000000000',
  goalYears: '10',
  goalSaved: '0',
  hajjMonthly: '100000000',
}

function form(overrides: Partial<typeof VALID> = {}) {
  const data = new FormData()
  for (const [key, value] of Object.entries({ ...VALID, ...overrides })) {
    data.append(key, value)
  }
  return data
}

beforeEach(() => {
  stub.reset()
  signedIn = true
})

describe('savePlan', () => {
  it('writes one row per household and says the figures will come back', async () => {
    stub.queue([{ updated_at: '2026-08-22T03:00:00Z' }])

    const result = await savePlan(null, form())

    expect(result.ok).toBe(true)
    expect(result.message).toBe('Rencana tersimpan.')

    expect(stub.calls).toHaveLength(1)
    const write = stub.calls[0]
    expect(write.sql).toContain('INSERT INTO public.plans')
    expect(write.sql).toContain('ON CONFLICT (household_id) DO UPDATE')

    expect(write.params[0]).toBe('h1')
    // Money goes as digits, not as a number: a float would carry a rounding
    // error waiting in it.
    expect(write.params[1]).toBe('817162900')
    expect(write.params[4]).toBe(true)
    expect(write.params).toContain(JSON.stringify([{ birthYear: 2027, track: 'swasta' }]))
  })

  it('accepts exactly what the planner serialises', async () => {
    stub.queue([{ updated_at: '2026-08-22T03:00:00Z' }])

    const fields = planFields({
      income: 5_000_000_00n,
      adults: 1,
      children: 0,
      irregularIncome: false,
      wantsZakat: true,
      frameworkId: 'zapfin',
      track: 'negeri',
      targetTier: 'hemat',
      targetSavings: 1_000_000_00n,
      childPlans: [],
      goalTarget: 100_000_000_00n,
      goalYears: 5,
      goalSaved: 2_000_000_00n,
      hajjMonthly: 500_000_00n,
    })
    const data = new FormData()
    for (const [key, value] of Object.entries(fields)) data.append(key, value)

    expect((await savePlan(null, data)).ok).toBe(true)
  })

  it('refuses a household size the table would refuse anyway', async () => {
    const result = await savePlan(null, form({ adults: '3' }))

    expect(result.ok).toBe(false)
    expect(result.detail).toContain('antara 1 dan 2')
    // Refused before the session is even looked up, so nothing is written.
    expect(stub.calls).toHaveLength(0)
  })

  it('refuses a framework nobody can pick', async () => {
    const result = await savePlan(null, form({ frameworkId: 'kerangka-karangan' }))
    expect(result.detail).toBe('Kerangkanya tidak dikenal.')
  })

  it('refuses a child count that disagrees with the children planned', async () => {
    const result = await savePlan(null, form({ children: '2' }))
    expect(result.detail).toContain('tidak cocok')
  })

  it('refuses child plans that are not JSON at all', async () => {
    const result = await savePlan(null, form({ childPlans: 'dua anak' }))
    expect(result.ok).toBe(false)
    expect(stub.calls).toHaveLength(0)
  })

  it('says the session ended rather than failing silently', async () => {
    signedIn = false
    const result = await savePlan(null, form())
    expect(result.message).toBe('Sesi kamu sudah berakhir. Masuk lagi lalu ulangi.')
  })

  it('reports a refused write instead of claiming a save', async () => {
    stub.queue([])

    const result = await savePlan(null, form())
    expect(result.ok).toBe(false)
    expect(result.message).toBe('Rencananya tidak tersimpan.')
  })

  it('reports a failed write without the Postgres sentence', async () => {
    stub.queueError('new row violates check constraint "plans_adults_check"', '23514')

    const result = await savePlan(null, form())
    expect(result.ok).toBe(false)
    expect(result.message).toBe('Rencananya gagal disimpan.')
    expect(result.detail).not.toContain('constraint')
  })
})

describe('resetPlan', () => {
  it('deletes the household own row and nothing else', async () => {
    stub.queue([{ id: 'p1' }])

    const result = await resetPlan()

    expect(result.ok).toBe(true)
    const call = stub.calls[0]
    expect(call.sql).toContain('DELETE FROM public.plans WHERE household_id = $1')
    expect(call.params).toEqual(['h1'])
  })

  it('treats a household with no saved plan as already reset', async () => {
    stub.queue([])

    const result = await resetPlan()
    expect(result.ok).toBe(true)
    expect(result.message).toBe('Belum ada rencana tersimpan.')
  })
})
