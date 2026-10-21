import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createScopeStub, type RecordedCall } from '@/test/scope-stub'

/**
 * Writing a month of budgets.
 *
 * The table is submitted whole, so the assertions worth having are about what
 * is not written: categories a household does not own, categories that cannot
 * carry a budget at all, and rows that did not change.
 */

const stub = createScopeStub()
const signedIn = vi.hoisted(() => ({ value: true }))

vi.mock('@/db/client', () => ({ db: {} }))
vi.mock('@/lib/auth/session', () => ({
  getUser: async () => (signedIn.value ? { id: 'u1', email: null } : null),
  userScope: async () => (signedIn.value ? stub.scope : null),
}))
vi.mock('@/lib/actions', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/actions')>()),
  context: async () => (signedIn.value ? { db: stub.scope, householdId: 'h1', userId: 'u1' } : null),
}))
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
  revalidateTag: vi.fn(),
  cacheTag: vi.fn(),
  cacheLife: vi.fn(),
}))

const { saveBudgets, copyBudgets } = await import('./actions')

const BELANJA = '00000000-0000-4000-8000-0000000000c1'
const WIFI = '00000000-0000-4000-8000-0000000000c2'
const GAJI = '00000000-0000-4000-8000-0000000000c3'

function form(fields: Record<string, string>) {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.append(key, value)
  return data
}

/** The rows an INSERT wrote, as column to value, read back from its SQL and params. */
function inserted(call: RecordedCall): Record<string, unknown>[] {
  const match = /INSERT INTO \S+ \(([^)]*)\)/.exec(call.sql)
  if (!match) throw new Error(`not an insert: ${call.sql}`)
  const columns = match[1].split(',').map((c) => c.trim().replace(/"/g, ''))
  const rows: Record<string, unknown>[] = []
  for (let at = 0; at < call.params.length; at += columns.length) {
    rows.push(Object.fromEntries(columns.map((c, i) => [c, call.params[at + i]])))
  }
  return rows
}

beforeEach(() => {
  stub.reset()
  signedIn.value = true
})

describe('saveBudgets', () => {
  it('writes only the rows that changed', async () => {
    stub.queue([{ id: BELANJA }, { id: WIFI }])
    stub.queue([
      { category_id: BELANJA, amount: 130000000 },
      { category_id: WIFI, amount: 30000000 },
    ])
    stub.queue([{ id: 'b1' }])

    const result = await saveBudgets(
      null,
      form({ period: '2026-07', [`b-${BELANJA}`]: '150000000', [`b-${WIFI}`]: '30000000' }),
    )

    expect(result.ok).toBe(true)
    // The allowed categories are re-read for this household, never trusted from the form.
    expect(stub.calls[0].sql).toContain('household_id')
    expect(stub.calls[0].params).toContain('h1')
    const upsert = inserted(stub.calls[2])
    expect(stub.calls[2].sql).toContain('ON CONFLICT (household_id, period, category_id)')
    expect(upsert).toHaveLength(1)
    expect(upsert[0]).toMatchObject({
      household_id: 'h1',
      category_id: BELANJA,
      amount: '150000000',
      period: '2026-07',
      source: 'manual',
    })
  })

  it('deletes a budget whose field was emptied', async () => {
    stub.queue([{ id: BELANJA }])
    stub.queue([{ category_id: BELANJA, amount: 130000000 }])
    stub.queue([{ id: 'b1' }])

    const result = await saveBudgets(null, form({ period: '2026-07', [`b-${BELANJA}`]: '' }))

    expect(result.ok).toBe(true)
    expect(result.detail).toContain('1 dikosongkan')
    const call = stub.calls[2]
    expect(call.sql).toContain('DELETE FROM public.budgets')
    expect(call.sql).toContain('household_id')
    expect(call.params).toContain('h1')
    expect(call.params).toContainEqual([BELANJA])
  })

  it('refuses to budget a category that cannot carry one', async () => {
    // Nothing in row level security stops a household budgeting its own Gaji.
    stub.queue([])
    stub.queue([])

    const result = await saveBudgets(null, form({ period: '2026-07', [`b-${GAJI}`]: '500000000' }))

    expect(result).toEqual({ ok: true, message: 'Tidak ada yang berubah.' })
    expect(stub.calls[0].sql).toContain("cashflow IN ('spending', 'bills')")
    // The category read and the budget read, and no write.
    expect(stub.calls).toHaveLength(2)
  })

  it('says nothing changed rather than writing an empty batch', async () => {
    stub.queue([{ id: BELANJA }])
    stub.queue([{ category_id: BELANJA, amount: 130000000 }])

    const result = await saveBudgets(
      null,
      form({ period: '2026-07', [`b-${BELANJA}`]: '130000000' }),
    )
    expect(result.message).toBe('Tidak ada yang berubah.')
    expect(stub.calls).toHaveLength(2)
  })

  it('refuses a month that is not one', async () => {
    const result = await saveBudgets(null, form({ period: 'Juli', [`b-${BELANJA}`]: '1' }))
    expect(result.ok).toBe(false)
    expect(stub.calls).toHaveLength(0)
  })

  it('ignores a field whose name is not a category id', async () => {
    stub.queue([{ id: BELANJA }])
    stub.queue([])
    stub.queue([{ id: 'b1' }])

    await saveBudgets(
      null,
      form({ period: '2026-07', 'b-bukan-uuid': '999', [`b-${BELANJA}`]: '130000000' }),
    )

    // Not even asked about: only the uuid reaches the category lookup.
    expect(stub.calls[0].params).toContainEqual([BELANJA])
    const upsert = inserted(stub.calls[2])
    expect(upsert).toHaveLength(1)
    expect(upsert[0].category_id).toBe(BELANJA)
  })

  it('reports how many made it when a batch is refused halfway', async () => {
    stub.queue([{ id: BELANJA }, { id: WIFI }])
    stub.queue([])
    stub.queueError('gagal')

    const result = await saveBudgets(
      null,
      form({ period: '2026-07', [`b-${BELANJA}`]: '130000000', [`b-${WIFI}`]: '30000000' }),
    )
    expect(result.ok).toBe(false)
    expect(result.message).toContain('Baru 0 dari 2')
  })

  it('says the session ended rather than failing silently', async () => {
    signedIn.value = false
    const result = await saveBudgets(null, form({ period: '2026-07', [`b-${BELANJA}`]: '1000' }))
    expect(result.message).toBe('Sesi kamu sudah berakhir. Masuk lagi lalu ulangi.')
    expect(stub.calls).toHaveLength(0)
  })
})

describe('copyBudgets', () => {
  it('fills only the categories that have no budget yet', async () => {
    stub.queue([
      { category_id: BELANJA, amount: 130000000 },
      { category_id: WIFI, amount: 30000000 },
    ])
    stub.queue([{ category_id: BELANJA }])
    stub.queue([{ id: 'b2' }])

    const result = await copyBudgets(null, form({ period: '2026-08', from: '2026-07' }))

    expect(result.ok).toBe(true)
    expect(result.applied).toBe(1)
    expect(stub.calls[0].params).toEqual(['h1', '2026-07'])
    expect(stub.calls[1].params).toEqual(['h1', '2026-08'])
    const rows = inserted(stub.calls[2])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ household_id: 'h1', category_id: WIFI, period: '2026-08' })
  })

  it('is safe to press twice', async () => {
    stub.queue([{ category_id: WIFI, amount: 30000000 }])
    stub.queue([{ category_id: WIFI }])

    const result = await copyBudgets(null, form({ period: '2026-08', from: '2026-07' }))
    expect(result).toMatchObject({ ok: true, message: 'Sudah disalin sebelumnya.' })
    expect(stub.calls).toHaveLength(2)
  })

  it('treats a unique violation as already copied', async () => {
    stub.queue([{ category_id: WIFI, amount: 30000000 }])
    stub.queue([])
    stub.queueError('duplicate key', '23505')

    const result = await copyBudgets(null, form({ period: '2026-08', from: '2026-07' }))
    expect(result).toMatchObject({ ok: true, message: 'Sudah disalin sebelumnya.' })
  })

  it('says when there is nothing to copy', async () => {
    stub.queue([])

    const result = await copyBudgets(null, form({ period: '2026-08', from: '2026-07' }))
    expect(result.ok).toBe(false)
    expect(result.message).toContain('Tidak ada anggaran di Jul 2026')
  })
})
