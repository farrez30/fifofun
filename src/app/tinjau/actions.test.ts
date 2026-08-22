import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSupabaseStub } from '@/test/supabase-stub'

/**
 * What the queue is allowed to write.
 *
 * The interesting part is not that a category is saved; it is that a category
 * pointing the other way is refused before the database has to. The check
 * `transactions_account_sides` fails a whole batch of a hundred rows, and the
 * message it produces names a constraint rather than a decision, so a person
 * would see ninety nine rows fail to save with no way to tell why.
 */

const stub = createSupabaseStub()

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => stub.client }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const unconfirmed = vi.fn()
vi.mock('@/lib/queries/household', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/queries/household')>()
  return {
    ...actual,
    getUnconfirmed: (...args: unknown[]) => unconfirmed(...args),
    getRules: async () => [],
  }
})

const { applyCategory, categoriseOne } = await import('./actions')

const HOUSEHOLD = { id: 'h1' }

function row(id: string, cashflow: string, description = 'ANIS RENGGANIS - arisan') {
  return {
    id,
    description,
    rawDescription: `Transfer ke BANK MANDIRI\nANIS RENGGANIS 1160005668471\narisan`,
    amount: 300_000_00n,
    cashflow,
    categoryName: null,
    occurredAt: new Date('2026-01-10T05:00:00.000Z'),
    fromAccountId: 'acc-mandiri',
    toAccountId: null,
    source: 'xlsx',
  }
}

function applyForm(categoryId: string) {
  const data = new FormData()
  data.append('pattern', 'anis rengganis')
  data.append('matchType', 'contains')
  data.append('categoryId', categoryId)
  return data
}

const CATEGORY = '11111111-1111-4111-8111-111111111111'
const TRANSACTION = '22222222-2222-4222-8222-222222222222'

beforeEach(() => {
  vi.clearAllMocks()
  stub.calls.length = 0
  stub.setUser({ id: 'u1' })
  unconfirmed.mockResolvedValue([])
})

describe('applyCategory', () => {
  it('refuses an income category on outgoing rows, before touching them', async () => {
    stub.queue('households', { data: HOUSEHOLD })
    stub.queue('categories', { data: { id: CATEGORY, name: 'Gaji', cashflow: 'income' } })
    unconfirmed.mockResolvedValue([row('a', 'spending'), row('b', 'spending')])

    const result = await applyCategory(null, applyForm(CATEGORY))

    expect(result.ok).toBe(false)
    expect(result.message).toBe('Arah kategorinya tidak cocok dengan transaksinya.')
    expect(result.detail).toContain('Gaji untuk uang masuk')
    expect(result.detail).toContain('transaksi ini uang keluar')
    expect(stub.callsOn('transactions')).toHaveLength(0)
  })

  it('applies only to the rows whose direction agrees and says how many were left', async () => {
    stub.queue('households', { data: HOUSEHOLD })
    stub.queue('categories', { data: { id: CATEGORY, name: 'Keluarga', cashflow: 'spending' } })
    stub.queue('transactions', { data: [{ id: 'a' }] })
    unconfirmed.mockResolvedValue([row('a', 'spending'), row('b', 'income')])

    const result = await applyCategory(null, applyForm(CATEGORY))

    expect(result.ok).toBe(true)
    expect(result.applied).toBe(1)
    expect(result.message).toBe('1 transaksi masuk ke Keluarga.')
    expect(result.detail).toContain('1 transaksi dengan arah sebaliknya dibiarkan')

    const write = stub.callsOn('transactions')[0]
    expect(write.payload).toMatchObject({ category_id: CATEGORY, cashflow: 'spending' })
    // The incoming row is never in the id list, so the account-sides check
    // never sees a row it would have to refuse.
    const ids = write.args[write.chain.indexOf('in')]
    expect(ids[1]).toEqual(['a'])
  })

  it('still refuses when the pattern matches nothing at all', async () => {
    stub.queue('households', { data: HOUSEHOLD })
    stub.queue('categories', { data: { id: CATEGORY, name: 'Keluarga', cashflow: 'spending' } })
    unconfirmed.mockResolvedValue([])

    const result = await applyCategory(null, applyForm(CATEGORY))
    expect(result.ok).toBe(false)
    expect(result.message).toBe('Tidak ada transaksi yang cocok dengan pola itu.')
  })

  it('refuses a category from another household', async () => {
    stub.queue('households', { data: HOUSEHOLD })
    stub.queue('categories', { data: null })

    const result = await applyCategory(null, applyForm(CATEGORY))
    expect(result.ok).toBe(false)
    expect(result.message).toBe('Kategori itu tidak ada di rumah tangga ini.')
  })
})

describe('categoriseOne', () => {
  function form() {
    const data = new FormData()
    data.append('transactionId', TRANSACTION)
    data.append('categoryId', CATEGORY)
    return data
  }

  it('reads the row cashflow from the database and refuses a mismatch', async () => {
    stub.queue('households', { data: HOUSEHOLD })
    stub.queue(
      'categories',
      { data: { id: CATEGORY, name: 'Gaji', cashflow: 'income' } },
    )
    stub.queue('transactions', { data: { id: TRANSACTION, cashflow: 'spending' } })

    const result = await categoriseOne(null, form())

    expect(result.ok).toBe(false)
    expect(result.detail).toContain('Gaji untuk uang masuk')
    // The read happened, the write did not.
    expect(stub.callsOn('transactions')).toHaveLength(1)
  })

  it('says so when the row has since been deleted or split away', async () => {
    stub.queue('households', { data: HOUSEHOLD })
    stub.queue('categories', { data: { id: CATEGORY, name: 'Keluarga', cashflow: 'spending' } })
    stub.queue('transactions', { data: null })

    const result = await categoriseOne(null, form())
    expect(result.ok).toBe(false)
    expect(result.message).toBe('Transaksinya tidak ditemukan.')
  })

  it('writes the category and the cashflow that came with it', async () => {
    stub.queue('households', { data: HOUSEHOLD })
    stub.queue('categories', { data: { id: CATEGORY, name: 'Keluarga', cashflow: 'spending' } })
    stub.queue('transactions', { data: { id: TRANSACTION, cashflow: 'spending' } }, { data: null })

    const result = await categoriseOne(null, form())

    expect(result.ok).toBe(true)
    expect(result.message).toBe('Masuk ke Keluarga.')
    const write = stub.callsOn('transactions')[1]
    expect(write.payload).toMatchObject({
      category_id: CATEGORY,
      cashflow: 'spending',
      needs_review: false,
    })
  })

  it('refuses when the session is gone', async () => {
    stub.setUser(null)
    const result = await categoriseOne(null, form())
    expect(result.ok).toBe(false)
    expect(result.message).toBe('Sesi kamu sudah berakhir. Masuk lagi lalu ulangi.')
  })
})
