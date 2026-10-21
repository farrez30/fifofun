import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createScopeStub } from '@/test/scope-stub'

/**
 * What the queue is allowed to write.
 *
 * The interesting part is not that a category is saved; it is that a category
 * pointing the other way is refused before the database has to. The check
 * `transactions_account_sides` fails a whole batch of a hundred rows, and the
 * message it produces names a constraint rather than a decision, so a person
 * would see ninety nine rows fail to save with no way to tell why.
 */

const stub = createScopeStub()
let signedIn = true

vi.mock('@/db/client', () => ({ db: {} }))
vi.mock('@/lib/auth/session', () => ({ getUser: async () => null, userScope: async () => null }))
vi.mock('@/lib/actions', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/actions')>()),
  context: async () => (signedIn ? { db: stub.scope, householdId: 'h1', userId: 'u1' } : null),
}))
vi.mock('@/lib/queries/categories', () => ({ groupRefusal: async () => null }))
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
  revalidateTag: vi.fn(),
  cacheTag: vi.fn(),
  cacheLife: vi.fn(),
}))

const unconfirmed = vi.fn()
const rules = vi.fn()
vi.mock('@/lib/queries/household', () => ({
  getUnconfirmed: (...args: unknown[]) => unconfirmed(...args),
  getRules: (...args: unknown[]) => rules(...args),
}))
vi.mock('@/lib/queries/tidy', () => ({ planLedgerTidy: vi.fn() }))

const { applyCategory, categoriseOne, deleteRule } = await import('./actions')

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

function applyForm(categoryId: string, remember = false) {
  const data = new FormData()
  data.append('pattern', 'anis rengganis')
  data.append('matchType', 'contains')
  data.append('categoryId', categoryId)
  if (remember) data.append('remember', 'on')
  return data
}

const CATEGORY = '11111111-1111-4111-8111-111111111111'
const TRANSACTION = '22222222-2222-4222-8222-222222222222'
const RULE = '33333333-3333-4333-8333-333333333333'

beforeEach(() => {
  vi.clearAllMocks()
  stub.reset()
  signedIn = true
  unconfirmed.mockResolvedValue([])
  rules.mockResolvedValue([])
})

describe('applyCategory', () => {
  it('refuses an income category on outgoing rows, before touching them', async () => {
    stub.queue({ id: CATEGORY, name: 'Gaji', cashflow: 'income' })
    unconfirmed.mockResolvedValue([row('a', 'spending'), row('b', 'spending')])

    const result = await applyCategory(null, applyForm(CATEGORY))

    expect(result.ok).toBe(false)
    expect(result.message).toBe('Arah kategorinya tidak cocok dengan transaksinya.')
    expect(result.detail).toContain('Gaji untuk uang masuk')
    expect(result.detail).toContain('transaksi ini uang keluar')
    // Only the category lookup ran.
    expect(stub.calls).toHaveLength(1)
  })

  it('applies only to the rows whose direction agrees and says how many were left', async () => {
    stub.queue({ id: CATEGORY, name: 'Keluarga', cashflow: 'spending' })
    stub.queue([{ id: 'a' }])
    unconfirmed.mockResolvedValue([row('a', 'spending'), row('b', 'income')])

    const result = await applyCategory(null, applyForm(CATEGORY))

    expect(result.ok).toBe(true)
    expect(result.applied).toBe(1)
    expect(result.message).toBe('1 transaksi masuk ke Keluarga.')
    expect(result.detail).toContain('1 transaksi dengan arah sebaliknya dibiarkan')

    const write = stub.calls[1]
    expect(write.sql).toContain('UPDATE public.transactions')
    expect(write.sql).toContain('household_id = $5 AND id = ANY($6::uuid[])')
    expect(write.params.slice(0, 2)).toEqual([CATEGORY, 'spending'])
    // The incoming row is never in the id list, so the account-sides check
    // never sees a row it would have to refuse.
    expect(write.params.slice(-2)).toEqual(['h1', ['a']])
  })

  it('remembers the pattern as a rule for this household', async () => {
    stub.queue({ id: CATEGORY, name: 'Keluarga', cashflow: 'spending' })
    stub.queue([{ id: 'a' }])
    stub.queue([{ id: 'r1' }])
    unconfirmed.mockResolvedValue([row('a', 'spending')])

    const result = await applyCategory(null, applyForm(CATEGORY, true))

    expect(result.detail).toContain('Impor berikutnya')
    const insert = stub.calls[2]
    expect(insert.sql).toContain('INSERT INTO "public"."categorization_rules"')
    expect(insert.params[0]).toBe('h1')
  })

  it('says the rule failed while keeping the categories it saved', async () => {
    stub.queue({ id: CATEGORY, name: 'Keluarga', cashflow: 'spending' })
    stub.queue([{ id: 'a' }])
    stub.queueError('duplicate key value')
    unconfirmed.mockResolvedValue([row('a', 'spending')])
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await applyCategory(null, applyForm(CATEGORY, true))

    expect(result.ok).toBe(true)
    expect(result.detail).toContain('aturannya gagal dibuat')
    spy.mockRestore()
  })

  it('still refuses when the pattern matches nothing at all', async () => {
    stub.queue({ id: CATEGORY, name: 'Keluarga', cashflow: 'spending' })
    unconfirmed.mockResolvedValue([])

    const result = await applyCategory(null, applyForm(CATEGORY))
    expect(result.ok).toBe(false)
    expect(result.message).toBe('Tidak ada transaksi yang cocok dengan pola itu.')
  })

  it('never offers to write into an archived category', async () => {
    // The stub answers whatever is queued; what is being pinned here is the
    // question the action asks. Retired means retired everywhere: the entry
    // and edit forms filter archived rows, and this lookup has to as well or
    // the queue stays the one door back into the archive.
    stub.queue(null)

    const result = await applyCategory(null, applyForm(CATEGORY))

    expect(result.ok).toBe(false)
    expect(stub.calls[0].sql).toContain('archived_at IS NULL')
  })

  it('refuses a category from another household', async () => {
    stub.queue(null)

    const result = await applyCategory(null, applyForm(CATEGORY))
    expect(result.ok).toBe(false)
    expect(result.message).toBe('Kategori itu tidak ada di rumah tangga ini.')
    expect(stub.calls[0].sql).toContain('household_id = $1 AND id = $2')
    expect(stub.calls[0].params).toEqual(['h1', CATEGORY])
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
    stub.queue({ id: CATEGORY, name: 'Gaji', cashflow: 'income' })
    stub.queue({ id: TRANSACTION, cashflow: 'spending' })

    const result = await categoriseOne(null, form())

    expect(result.ok).toBe(false)
    expect(result.detail).toContain('Gaji untuk uang masuk')
    // The read happened, the write did not.
    expect(stub.calls).toHaveLength(2)
    expect(stub.calls[1].sql).toContain('deleted_at IS NULL')
  })

  it('says so when the row has since been deleted or split away', async () => {
    stub.queue({ id: CATEGORY, name: 'Keluarga', cashflow: 'spending' })
    stub.queue(null)

    const result = await categoriseOne(null, form())
    expect(result.ok).toBe(false)
    expect(result.message).toBe('Transaksinya tidak ditemukan.')
  })

  it('writes the category and the cashflow that came with it', async () => {
    stub.queue({ id: CATEGORY, name: 'Keluarga', cashflow: 'spending' })
    stub.queue({ id: TRANSACTION, cashflow: 'spending' })
    stub.queue([{ id: TRANSACTION }])

    const result = await categoriseOne(null, form())

    expect(result.ok).toBe(true)
    expect(result.message).toBe('Masuk ke Keluarga.')
    const write = stub.calls[2]
    expect(write.sql).toContain('needs_review = false')
    expect(write.params.slice(0, 2)).toEqual([CATEGORY, 'spending'])
    expect(write.params.slice(-2)).toEqual(['h1', [TRANSACTION]])
  })

  it('keeps the database message of a failed write on the server', async () => {
    stub.queue({ id: CATEGORY, name: 'Keluarga', cashflow: 'spending' })
    stub.queue({ id: TRANSACTION, cashflow: 'spending' })
    stub.queueError('violates check constraint "transactions_account_sides"', '23514')
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await categoriseOne(null, form())
    expect(result.ok).toBe(false)
    expect(JSON.stringify(result)).not.toContain('transactions_account_sides')
    spy.mockRestore()
  })

  it('asks for a live category, not an archived one', async () => {
    stub.queue(null)

    const result = await categoriseOne(null, form())

    expect(result.ok).toBe(false)
    expect(stub.calls[0].sql).toContain('archived_at IS NULL')
  })

  it('refuses when the session is gone', async () => {
    signedIn = false
    const result = await categoriseOne(null, form())
    expect(result.ok).toBe(false)
    expect(result.message).toBe('Sesi kamu sudah berakhir. Masuk lagi lalu ulangi.')
  })
})

describe('deleteRule', () => {
  it('deletes the rule inside the household only', async () => {
    const data = new FormData()
    data.append('ruleId', RULE)
    stub.queue([{ id: RULE }])

    const result = await deleteRule(null, data)
    expect(result.ok).toBe(true)
    expect(stub.calls[0].sql).toContain('DELETE FROM public.categorization_rules')
    expect(stub.calls[0].params).toEqual([RULE, 'h1'])
  })
})
