import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSupabaseStub } from '@/test/supabase-stub'

/**
 * What a hand-typed row is allowed to become.
 *
 * The assertions here are all about authority rather than arithmetic: the
 * cashflow comes from the category row and not from the form, both sides of a
 * transfer must belong to this household, a repeated save writes once, and a
 * bank row can never be hidden. Each of those is a sentence a person would
 * otherwise meet as a Postgres constraint name.
 */

const stub = createSupabaseStub()

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => stub.client }))
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
  revalidateTag: vi.fn(),
  cacheTag: vi.fn(),
  cacheLife: vi.fn(),
}))

const accounts = vi.fn()
const transactions = vi.fn()
const adjustments = vi.fn()
vi.mock('@/lib/queries/household', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/queries/household')>()
  return {
    ...actual,
    getAccounts: (...args: unknown[]) => accounts(...args),
    getAllTransactions: (...args: unknown[]) => transactions(...args),
    getAdjustments: (...args: unknown[]) => adjustments(...args),
  }
})

const { adjustBalance, deleteEntry, keepBoth, mergeDuplicate, recomputeAdjustments, recordEntry } = await import(
  './actions'
)

const HOUSEHOLD = { id: 'h1' }
const CLIENT = '00000000-0000-4000-8000-000000000001'
const CATEGORY = '11111111-1111-4111-8111-111111111111'
const ACCOUNT = '22222222-2222-4222-8222-222222222222'
const OTHER_ACCOUNT = '33333333-3333-4333-8333-333333333333'
const MANUAL = '44444444-4444-4444-8444-444444444444'
const IMPORTED = '55555555-5555-4555-8555-555555555555'

function entryForm(over: Record<string, string> = {}) {
  const data = new FormData()
  const fields = {
    clientId: CLIENT,
    categoryId: CATEGORY,
    accountId: ACCOUNT,
    fromAccountId: '',
    toAccountId: '',
    amount: '5000000',
    date: '2026-08-20',
    time: '12:30',
    description: 'Makan siang',
    note: '',
    ...over,
  }
  for (const [key, value] of Object.entries(fields)) data.append(key, value)
  return data
}

beforeEach(() => {
  vi.clearAllMocks()
  stub.calls.length = 0
  stub.setUser({ id: 'u1' })
  vi.useRealTimers()
})

describe('recordEntry', () => {
  it('takes the cashflow from the category row, not from the form', async () => {
    stub.queue('households', { data: HOUSEHOLD })
    stub.queue('categories', { data: { id: CATEGORY, name: 'Wifi', cashflow: 'bills' } })
    stub.queue('accounts', { data: [{ id: ACCOUNT }] })
    stub.queue('transactions', { data: null })

    const result = await recordEntry(null, entryForm())

    expect(result.ok).toBe(true)
    const write = stub.callsOn('transactions')[0]
    expect(write.payload).toMatchObject({
      cashflow: 'bills',
      from_account_id: ACCOUNT,
      to_account_id: null,
      source: 'manual',
      dedupe_key: `manual:${CLIENT}`,
      needs_review: false,
    })
    expect(result.message).toBe('Rp50.000 tercatat ke Wifi.')
  })

  it('puts an income category on the destination side', async () => {
    stub.queue('households', { data: HOUSEHOLD })
    stub.queue('categories', { data: { id: CATEGORY, name: 'Gaji', cashflow: 'income' } })
    stub.queue('accounts', { data: [{ id: ACCOUNT }] })
    stub.queue('transactions', { data: null })

    await recordEntry(null, entryForm())

    expect(stub.callsOn('transactions')[0].payload).toMatchObject({
      from_account_id: null,
      to_account_id: ACCOUNT,
    })
  })

  it('refuses a category from another household', async () => {
    stub.queue('households', { data: HOUSEHOLD })
    stub.queue('categories', { data: null })

    const result = await recordEntry(null, entryForm())
    expect(result.ok).toBe(false)
    expect(result.message).toBe('Kategori itu tidak ada di rumah tangga ini.')
    expect(stub.callsOn('transactions')).toHaveLength(0)
  })

  it('refuses an account the household does not own', async () => {
    stub.queue('households', { data: HOUSEHOLD })
    stub.queue('categories', { data: { id: CATEGORY, name: 'Wifi', cashflow: 'bills' } })
    stub.queue('accounts', { data: [] })

    const result = await recordEntry(null, entryForm())
    expect(result.ok).toBe(false)
    expect(result.message).toBe('Akun itu tidak ada di rumah tangga ini.')
  })

  it('requires both accounts for a transfer', async () => {
    stub.queue('households', { data: HOUSEHOLD })
    stub.queue('categories', {
      data: { id: CATEGORY, name: 'Antar Account', cashflow: 'transfer' },
    })

    const result = await recordEntry(
      null,
      entryForm({ accountId: '', fromAccountId: ACCOUNT, toAccountId: '' }),
    )
    expect(result.ok).toBe(false)
    expect(result.detail).toBe('Perpindahan butuh akun asal dan akun tujuan.')
  })

  it('checks both sides of a transfer against the household', async () => {
    stub.queue('households', { data: HOUSEHOLD })
    stub.queue('categories', {
      data: { id: CATEGORY, name: 'Antar Account', cashflow: 'transfer' },
    })
    stub.queue('accounts', { data: [{ id: ACCOUNT }] })

    const result = await recordEntry(
      null,
      entryForm({ accountId: '', fromAccountId: ACCOUNT, toAccountId: OTHER_ACCOUNT }),
    )
    expect(result.ok).toBe(false)
    expect(result.message).toBe('Akun itu tidak ada di rumah tangga ini.')
  })

  it('refuses a date next month', async () => {
    stub.queue('households', { data: HOUSEHOLD })
    stub.queue('categories', { data: { id: CATEGORY, name: 'Wifi', cashflow: 'bills' } })
    stub.queue('accounts', { data: [{ id: ACCOUNT }] })

    const result = await recordEntry(null, entryForm({ date: '2099-01-01' }))
    expect(result.ok).toBe(false)
    expect(result.message).toBe('Tanggalnya di luar jangkauan.')
  })

  it('treats a repeated client id as already saved', async () => {
    stub.queue('households', { data: HOUSEHOLD })
    stub.queue('categories', { data: { id: CATEGORY, name: 'Wifi', cashflow: 'bills' } })
    stub.queue('accounts', { data: [{ id: ACCOUNT }] })
    stub.queue('transactions', { error: { message: 'duplicate key', code: '23505' } })

    const result = await recordEntry(null, entryForm())
    expect(result.ok).toBe(true)
    expect(result.message).toBe('Sudah tersimpan sebelumnya.')
  })

  it('refuses an amount of nothing', async () => {
    const result = await recordEntry(null, entryForm({ amount: '0' }))
    expect(result.ok).toBe(false)
    expect(result.detail).toBe('Nominalnya harus lebih dari nol.')
  })
})

describe('deleteEntry', () => {
  function form() {
    const data = new FormData()
    data.append('transactionId', MANUAL)
    return data
  }

  it('hides a row rather than deleting it, and only a typed one', async () => {
    stub.queue('households', { data: HOUSEHOLD })
    stub.queue('transactions', { data: [{ id: MANUAL }] })

    const result = await deleteEntry(null, form())
    expect(result.ok).toBe(true)

    const write = stub.callsOn('transactions')[0]
    expect(write.chain).toContain('update')
    expect(write.chain).not.toContain('delete')
    expect(write.payload).toHaveProperty('deleted_at')
    const sources = write.args[write.chain.indexOf('in')]
    expect(sources[1]).toEqual(['manual', 'telegram'])
  })

  it('says why a bank row cannot be deleted', async () => {
    stub.queue('households', { data: HOUSEHOLD })
    stub.queue('transactions', { data: [] })

    const result = await deleteEntry(null, form())
    expect(result.ok).toBe(false)
    expect(result.message).toBe('Catatan itu tidak ditemukan, atau berasal dari bank.')
    expect(result.detail).toContain('rekonsiliasi saldo')
  })
})

describe('adjustBalance', () => {
  function form(over: Record<string, string> = {}) {
    const data = new FormData()
    const fields = {
      clientId: CLIENT,
      accountId: ACCOUNT,
      actual: '12000000',
      expectedComputed: '90367950',
      date: '2026-08-20',
      ...over,
    }
    for (const [key, value] of Object.entries(fields)) data.append(key, value)
    return data
  }

  const account = {
    id: ACCOUNT,
    name: 'GoPay',
    kind: 'ewallet' as const,
    openingBalance: 0n,
    key: 'gopay',
    institution: null,
    ownIdentifiers: [],
    openingBalanceAt: null,
    sortOrder: 2,
    archivedAt: null,
  }

  const movement = (closing: bigint) => [
    {
      id: 'tx',
      occurredAt: new Date('2026-07-01T05:00:00.000Z'),
      description: 'top up',
      amount: closing,
      cashflow: 'transfer' as const,
      categoryId: null,
      fromAccountId: null,
      toAccountId: ACCOUNT,
      source: 'xlsx' as const,
      categoryName: null,
      needsReview: false,
      isPassThrough: false,
      duplicateOf: null,
      splitOf: null,
    },
  ]

  it('writes Penyesuaian Spending when the real balance is lower', async () => {
    stub.queue('households', { data: HOUSEHOLD })
    accounts.mockResolvedValue([account])
    transactions.mockResolvedValue(movement(90_367_950n))
    stub.queue('categories', { data: { id: 'cat-adj' } })
    stub.queue('transactions', { data: null })

    const result = await adjustBalance(null, form())

    expect(result.ok).toBe(true)
    const write = stub.callsOn('transactions')[0]
    expect(write.payload).toMatchObject({
      cashflow: 'spending',
      from_account_id: ACCOUNT,
      to_account_id: null,
      amount: '78367950',
      description: 'Penyesuaian saldo GoPay',
    })
    expect(result.message).toContain('dikurangi')
    expect(result.detail).toContain('bukan perubahan saldo awal')
  })

  it('refuses when the balance moved since the page was opened', async () => {
    stub.queue('households', { data: HOUSEHOLD })
    accounts.mockResolvedValue([account])
    transactions.mockResolvedValue(movement(50_000_00n))

    const result = await adjustBalance(null, form())
    expect(result.ok).toBe(false)
    expect(result.message).toBe('Saldo akun ini berubah sejak halaman dibuka.')
    expect(stub.callsOn('transactions')).toHaveLength(0)
  })

  it('writes nothing when the figures already agree', async () => {
    stub.queue('households', { data: HOUSEHOLD })
    accounts.mockResolvedValue([account])
    transactions.mockResolvedValue(movement(12_000_000n))

    const result = await adjustBalance(null, form({ expectedComputed: '12000000' }))
    expect(result.ok).toBe(true)
    expect(result.message).toBe('Saldonya sudah sama. Tidak ada yang ditulis.')
    expect(stub.callsOn('transactions')).toHaveLength(0)
  })

  it('creates the adjustment category when the household lacks it', async () => {
    stub.queue('households', { data: HOUSEHOLD })
    accounts.mockResolvedValue([account])
    transactions.mockResolvedValue(movement(90_367_950n))
    stub.queue('categories', { data: null }, { data: { id: 'cat-new' } })
    stub.queue('transactions', { data: null })

    const result = await adjustBalance(null, form())
    expect(result.ok).toBe(true)
    const created = stub.callsOn('categories')[1]
    expect(created.payload).toMatchObject({
      name: 'Penyesuaian Spending',
      cashflow: 'spending',
      household_id: 'h1',
    })
  })

  it('refuses an account the household does not own', async () => {
    stub.queue('households', { data: HOUSEHOLD })
    accounts.mockResolvedValue([])

    const result = await adjustBalance(null, form())
    expect(result.ok).toBe(false)
    expect(result.message).toBe('Akun itu tidak ada di rumah tangga ini.')
  })
})

describe('mergeDuplicate and keepBoth', () => {
  function form() {
    const data = new FormData()
    data.append('manualId', MANUAL)
    data.append('importedId', IMPORTED)
    return data
  }

  const pair = (over: Record<string, unknown> = {}) => [
    {
      id: MANUAL,
      source: 'manual',
      cashflow: 'spending',
      category_id: CATEGORY,
      note: 'makan siang',
      confirmed_at: '2026-08-10T05:00:00.000Z',
      duplicate_of: IMPORTED,
      deleted_at: null,
      ...over,
    },
    {
      id: IMPORTED,
      source: 'xlsx',
      cashflow: 'spending',
      category_id: null,
      note: null,
      confirmed_at: null,
      duplicate_of: null,
      deleted_at: null,
    },
  ]

  it('patches the bank row and hides the manual one', async () => {
    stub.queue('households', { data: HOUSEHOLD })
    stub.queue('transactions', { data: pair() }, { data: [{ id: IMPORTED }] }, { data: [{ id: MANUAL }] })
    stub.queue('categories', { data: { cashflow: 'spending' } })

    const result = await mergeDuplicate(null, form())

    expect(result.ok).toBe(true)
    const [, patch, hide] = stub.callsOn('transactions')
    expect(patch.payload).toMatchObject({ category_id: CATEGORY, cashflow: 'spending' })
    expect(hide.payload).toHaveProperty('deleted_at')
  })

  it('is idempotent once the pair has already been merged', async () => {
    stub.queue('households', { data: HOUSEHOLD })
    stub.queue('transactions', {
      data: pair({ deleted_at: '2026-08-21T05:00:00.000Z' }),
    })

    const result = await mergeDuplicate(null, form())
    expect(result.ok).toBe(true)
    expect(result.message).toBe('Sudah digabungkan sebelumnya.')
    expect(stub.callsOn('transactions')).toHaveLength(1)
  })

  it('refuses a pair the import never linked', async () => {
    stub.queue('households', { data: HOUSEHOLD })
    stub.queue('transactions', { data: pair({ duplicate_of: null }) })

    const result = await mergeDuplicate(null, form())
    expect(result.ok).toBe(false)
    expect(result.message).toBe('Pasangan itu tidak ditemukan lagi.')
  })

  it('clears the link and keeps both', async () => {
    stub.queue('households', { data: HOUSEHOLD })
    stub.queue('transactions', { data: [{ id: MANUAL }] })

    const result = await keepBoth(null, form())
    expect(result.ok).toBe(true)
    expect(stub.callsOn('transactions')[0].payload).toEqual({ duplicate_of: null })
  })

  it('says the pair was already kept rather than failing on a second press', async () => {
    stub.queue('households', { data: HOUSEHOLD })
    stub.queue('transactions', { data: [] }, { data: { id: MANUAL, duplicate_of: null } })

    const result = await keepBoth(null, form())
    expect(result.ok).toBe(true)
    expect(result.message).toBe('Keduanya sudah dipertahankan.')
  })
})

describe('recomputeAdjustments', () => {
  const ADJUSTMENT = '66666666-6666-4666-8666-666666666666'
  const gopay = {
    id: ACCOUNT,
    name: 'GoPay',
    kind: 'ewallet' as const,
    openingBalance: 0n,
    key: 'gopay',
    institution: null,
    ownIdentifiers: [],
    openingBalanceAt: null,
    sortOrder: 2,
    archivedAt: null,
  }

  function row(id: string, at: string, amount: bigint, from: string | null, to: string | null) {
    return {
      id,
      occurredAt: new Date(at),
      description: id,
      amount,
      cashflow: 'transfer' as const,
      categoryId: null,
      fromAccountId: from,
      toAccountId: to,
      source: 'xlsx' as const,
      categoryName: null,
      needsReview: false,
      isPassThrough: false,
      duplicateOf: null,
      splitOf: null,
    }
  }

  // Counted empty on 23 Aug against Rp6.134.481; the August statement then
  // added a Rp100.000 withdrawal dated before the count.
  const counted = {
    id: ADJUSTMENT,
    accountId: ACCOUNT,
    occurredAt: new Date('2026-08-23T16:59:00Z'),
    createdAt: new Date('2026-08-22T18:12:00Z'),
    amount: 613_448_100n,
    cashflow: 'spending' as const,
    note: 'Penyesuaian saldo GoPay: tercatat Rp6.134.481, sebenarnya Rp0.',
  }
  const ledger = (withdrawal: bigint) => [
    row('topup', '2026-07-01T00:00:00Z', 613_448_100n, OTHER_ACCOUNT, ACCOUNT),
    ...(withdrawal ? [row('tarik', '2026-08-23T02:39:00Z', withdrawal, ACCOUNT, OTHER_ACCOUNT)] : []),
    row(ADJUSTMENT, '2026-08-23T16:59:00Z', counted.amount, ACCOUNT, null),
  ]

  it('rewrites a stale correction so the balance lands on what was counted', async () => {
    stub.queue('households', { data: HOUSEHOLD })
    accounts.mockResolvedValue([gopay])
    transactions.mockResolvedValue(ledger(10_000_000n))
    adjustments.mockResolvedValue([counted])
    stub.queue('categories', { data: { id: 'cat-adj' } })
    stub.queue('transactions', { data: [{ id: ADJUSTMENT }] })

    const result = await recomputeAdjustments()

    expect(result).toMatchObject({ ok: true, applied: 1 })
    const write = stub.callsOn('transactions')[0]
    expect(write.payload).toEqual({
      amount: '603448100',
      cashflow: 'spending',
      category_id: 'cat-adj',
      from_account_id: ACCOUNT,
      to_account_id: null,
      note: 'Penyesuaian saldo GoPay: tercatat Rp6.034.481, sebenarnya Rp0.',
    })
    // Scoped to this household and to hand-written rows, so a bank row can never be rewritten.
    expect(write.args.filter((_, index) => write.chain[index] === 'eq')).toEqual([
      ['id', ADJUSTMENT],
      ['household_id', 'h1'],
      ['source', 'manual'],
    ])
  })

  it('writes nothing when every correction still lands where it should', async () => {
    stub.queue('households', { data: HOUSEHOLD })
    accounts.mockResolvedValue([gopay])
    transactions.mockResolvedValue(ledger(0n))
    adjustments.mockResolvedValue([counted])

    const result = await recomputeAdjustments()
    expect(result.ok).toBe(true)
    expect(stub.callsOn('transactions')).toHaveLength(0)
  })

  it('hides a correction the balance no longer needs', async () => {
    stub.queue('households', { data: HOUSEHOLD })
    accounts.mockResolvedValue([gopay])
    transactions.mockResolvedValue(ledger(613_448_100n))
    adjustments.mockResolvedValue([counted])
    stub.queue('transactions', { data: [{ id: ADJUSTMENT }] })

    await recomputeAdjustments()
    expect(stub.callsOn('transactions')[0].payload).toHaveProperty('deleted_at')
  })

  it('asks a signed-out visitor to sign in again', async () => {
    stub.setUser(null)
    expect((await recomputeAdjustments()).ok).toBe(false)
    expect(adjustments).not.toHaveBeenCalled()
  })
})
