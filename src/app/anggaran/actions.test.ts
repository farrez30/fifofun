import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSupabaseStub } from '@/test/supabase-stub'

/**
 * Writing a month of budgets.
 *
 * The table is submitted whole, so the assertions worth having are about what
 * is not written: categories a household does not own, categories that cannot
 * carry a budget at all, and rows that did not change.
 */

const stub = createSupabaseStub()

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => stub.client }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { saveBudgets, copyBudgets } = await import('./actions')

const BELANJA = '00000000-0000-4000-8000-0000000000c1'
const WIFI = '00000000-0000-4000-8000-0000000000c2'
const GAJI = '00000000-0000-4000-8000-0000000000c3'

function form(fields: Record<string, string>) {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.append(key, value)
  return data
}

beforeEach(() => {
  stub.reset()
  stub.setUser({ id: 'u1' })
  stub.queue('households', { data: { id: 'h1' } })
})

describe('saveBudgets', () => {
  it('writes only the rows that changed', async () => {
    stub.queue('categories', { data: [{ id: BELANJA }, { id: WIFI }] })
    stub.queue(
      'budgets',
      { data: [{ category_id: BELANJA, amount: '130000000' }, { category_id: WIFI, amount: '30000000' }] },
      { data: [{ id: 'b1' }] },
    )

    const result = await saveBudgets(
      null,
      form({ period: '2026-07', [`b-${BELANJA}`]: '150000000', [`b-${WIFI}`]: '30000000' }),
    )

    expect(result.ok).toBe(true)
    const upsert = stub.callsOn('budgets')[1].payload as Record<string, unknown>[]
    expect(upsert).toHaveLength(1)
    expect(upsert[0]).toMatchObject({
      category_id: BELANJA,
      amount: '150000000',
      period: '2026-07',
      source: 'manual',
    })
  })

  it('deletes a budget whose field was emptied', async () => {
    stub.queue('categories', { data: [{ id: BELANJA }] })
    stub.queue('budgets', { data: [{ category_id: BELANJA, amount: '130000000' }] }, { data: [{ id: 'b1' }] })

    const result = await saveBudgets(null, form({ period: '2026-07', [`b-${BELANJA}`]: '' }))

    expect(result.ok).toBe(true)
    expect(result.detail).toContain('1 dikosongkan')
    const call = stub.callsOn('budgets')[1]
    expect(call.chain).toContain('delete')
  })

  it('refuses to budget a category that cannot carry one', async () => {
    // Nothing in row level security stops a household budgeting its own Gaji.
    stub.queue('categories', { data: [] })
    stub.queue('budgets', { data: [] })

    const result = await saveBudgets(null, form({ period: '2026-07', [`b-${GAJI}`]: '500000000' }))

    expect(result).toEqual({ ok: true, message: 'Tidak ada yang berubah.' })
    expect(stub.callsOn('budgets')).toHaveLength(1)
  })

  it('says nothing changed rather than writing an empty batch', async () => {
    stub.queue('categories', { data: [{ id: BELANJA }] })
    stub.queue('budgets', { data: [{ category_id: BELANJA, amount: '130000000' }] })

    const result = await saveBudgets(
      null,
      form({ period: '2026-07', [`b-${BELANJA}`]: '130000000' }),
    )
    expect(result.message).toBe('Tidak ada yang berubah.')
  })

  it('refuses a month that is not one', async () => {
    const result = await saveBudgets(null, form({ period: 'Juli', [`b-${BELANJA}`]: '1' }))
    expect(result.ok).toBe(false)
    expect(stub.calls).toHaveLength(0)
  })

  it('ignores a field whose name is not a category id', async () => {
    stub.queue('categories', { data: [{ id: BELANJA }] })
    stub.queue('budgets', { data: [] }, { data: [{ id: 'b1' }] })

    await saveBudgets(
      null,
      form({ period: '2026-07', 'b-bukan-uuid': '999', [`b-${BELANJA}`]: '130000000' }),
    )

    const upsert = stub.callsOn('budgets')[1].payload as Record<string, unknown>[]
    expect(upsert).toHaveLength(1)
    expect(upsert[0].category_id).toBe(BELANJA)
  })

  it('reports how many made it when a batch is refused halfway', async () => {
    stub.queue('categories', { data: [{ id: BELANJA }, { id: WIFI }] })
    stub.queue('budgets', { data: [] }, { error: { message: 'gagal' } })

    const result = await saveBudgets(
      null,
      form({ period: '2026-07', [`b-${BELANJA}`]: '130000000', [`b-${WIFI}`]: '30000000' }),
    )
    expect(result.ok).toBe(false)
    expect(result.message).toContain('Baru 0 dari 2')
  })

  it('says the session ended rather than failing silently', async () => {
    stub.setUser(null)
    const result = await saveBudgets(null, form({ period: '2026-07', [`b-${BELANJA}`]: '1000' }))
    expect(result.message).toBe('Sesi kamu sudah berakhir. Masuk lagi lalu ulangi.')
  })
})

describe('copyBudgets', () => {
  it('fills only the categories that have no budget yet', async () => {
    stub.queue(
      'budgets',
      { data: [{ category_id: BELANJA, amount: '130000000' }, { category_id: WIFI, amount: '30000000' }] },
      { data: [{ category_id: BELANJA }] },
      { data: [{ id: 'b2' }] },
    )

    const result = await copyBudgets(null, form({ period: '2026-08', from: '2026-07' }))

    expect(result.ok).toBe(true)
    expect(result.applied).toBe(1)
    const rows = stub.callsOn('budgets')[2].payload as Record<string, unknown>[]
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ category_id: WIFI, period: '2026-08' })
  })

  it('is safe to press twice', async () => {
    stub.queue(
      'budgets',
      { data: [{ category_id: WIFI, amount: '30000000' }] },
      { data: [{ category_id: WIFI }] },
    )

    const result = await copyBudgets(null, form({ period: '2026-08', from: '2026-07' }))
    expect(result).toMatchObject({ ok: true, message: 'Sudah disalin sebelumnya.' })
  })

  it('says when there is nothing to copy', async () => {
    stub.queue('budgets', { data: [] })

    const result = await copyBudgets(null, form({ period: '2026-08', from: '2026-07' }))
    expect(result.ok).toBe(false)
    expect(result.message).toContain('Tidak ada anggaran di Jul 2026')
  })
})
