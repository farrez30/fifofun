import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createScopeStub, type RecordedCall } from '@/test/scope-stub'

/**
 * What a hand-typed row is allowed to become.
 *
 * The assertions here are all about authority rather than arithmetic: the
 * cashflow comes from the category row and not from the form, both sides of a
 * transfer must belong to this household, a repeated save writes once, and a
 * bank row can never be hidden. Each of those is a sentence a person would
 * otherwise meet as a Postgres constraint name.
 */

const stub = createScopeStub()
const signedIn = vi.hoisted(() => ({ value: true }))

vi.mock('@/db/client', () => ({ db: {} }))
// groupRefusal reads through the user's scope, so it lands on the same stub.
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

/** The statements that touched one table, in order. */
function on(table: string): RecordedCall[] {
  const name = new RegExp(`(FROM|INTO|UPDATE) (public\\.|"public"\\.)"?${table}"?\\b`)
  return stub.calls.filter((call) => name.test(call.sql))
}

/** What an INSERT wrote, as column to value, read back from its SQL and params. */
function inserted(call: RecordedCall): Record<string, unknown> {
  const match = /INSERT INTO \S+ \(([^)]*)\)/.exec(call.sql)
  if (!match) throw new Error(`not an insert: ${call.sql}`)
  const columns = match[1].split(',').map((c) => c.trim().replace(/"/g, ''))
  return Object.fromEntries(columns.map((c, i) => [c, call.params[i]]))
}

/** What an UPDATE set, as column to value. */
function updated(call: RecordedCall): Record<string, unknown> {
  const match = /^\s*UPDATE \S+ SET ([\s\S]*?)\s+WHERE/.exec(call.sql)
  if (!match) throw new Error(`not an update: ${call.sql}`)
  return Object.fromEntries(
    match[1].split(/,\s*/).map((part) => {
      const [, column, , index] = /^"?(\w+)"? = (\$(\d+)|NULL)/.exec(part) ?? []
      return [column, index ? call.params[Number(index) - 1] : null]
    }),
  )
}
const CLIENT = '00000000-0000-4000-8000-000000000001'
const CATEGORY = '11111111-1111-4111-8111-111111111111'
const ACCOUNT = '22222222-2222-4222-8222-222222222222'
const OTHER_ACCOUNT = '33333333-3333-4333-8333-333333333333'
const MANUAL = '44444444-4444-4444-8444-444444444444'
const IMPORTED = '55555555-5555-4555-8555-555555555555'
const OTHER_CATEGORY = '77777777-7777-4777-8777-777777777777'

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
  stub.reset()
  signedIn.value = true
  vi.useRealTimers()
})

/** The category row, then groupRefusal's count of its children (none). */
function queueCategory(row: Record<string, unknown> | null) {
  stub.queue(row)
  if (row) stub.queue({ n: 0 })
}

describe('recordEntry', () => {
  it('asks for the category in words when none was picked', async () => {
    const form = entryForm()
    form.delete('categoryId')

    const result = await recordEntry(null, form)

    expect(result.ok).toBe(false)
    expect(result.fieldErrors?.categoryId).toBe('Kategorinya belum dipilih.')
    expect(result.detail).toBe('Kategorinya belum dipilih.')
    expect(stub.calls).toHaveLength(0)
  })

  it('takes the cashflow from the category row, not from the form', async () => {
    queueCategory({ id: CATEGORY, name: 'Wifi', cashflow: 'bills' })
    stub.queue([{ id: ACCOUNT }])
    stub.queue([{ id: 'tx' }])

    const result = await recordEntry(null, entryForm())

    expect(result.ok).toBe(true)
    // The category is re-read for this household, and it is the one asked about.
    const [lookup, group] = on('categories')
    expect(lookup.sql).toContain('household_id')
    expect(lookup.params).toEqual(['h1', CATEGORY])
    expect(group.sql).toContain('parent_id')
    const write = on('transactions')[0]
    expect(inserted(write)).toMatchObject({
      household_id: 'h1',
      cashflow: 'bills',
      from_account_id: ACCOUNT,
      to_account_id: null,
      source: 'manual',
      dedupe_key: `manual:${CLIENT}`,
      needs_review: false,
    })
    expect(result.message).toBe('Rp50.000 tercatat ke Wifi.')
  })

  it('says the sen back when there are any', async () => {
    queueCategory({ id: CATEGORY, name: 'Google Workspace', cashflow: 'bills' })
    stub.queue([{ id: ACCOUNT }])
    stub.queue([{ id: 'tx' }])

    const result = await recordEntry(null, entryForm({ amount: '12125229' }))
    expect(result.message).toBe('Rp121.252,29 tercatat ke Google Workspace.')
  })

  it('puts an income category on the destination side', async () => {
    queueCategory({ id: CATEGORY, name: 'Gaji', cashflow: 'income' })
    stub.queue([{ id: ACCOUNT }])
    stub.queue([{ id: 'tx' }])

    await recordEntry(null, entryForm())

    expect(inserted(on('transactions')[0])).toMatchObject({
      from_account_id: null,
      to_account_id: ACCOUNT,
    })
  })

  it('refuses a category from another household', async () => {
    queueCategory(null)

    const result = await recordEntry(null, entryForm())
    expect(result.ok).toBe(false)
    expect(result.message).toBe('Kategori itu tidak ada di rumah tangga ini.')
    expect(on('transactions')).toHaveLength(0)
  })

  it('refuses an account the household does not own', async () => {
    queueCategory({ id: CATEGORY, name: 'Wifi', cashflow: 'bills' })
    stub.queue([])

    const result = await recordEntry(null, entryForm())
    expect(result.ok).toBe(false)
    expect(result.message).toBe('Akun itu tidak ada di rumah tangga ini.')
    const [owned] = on('accounts')
    expect(owned.sql).toContain('household_id')
    expect(owned.params).toEqual(['h1', [ACCOUNT]])
    expect(on('transactions')).toHaveLength(0)
  })

  it('refuses a group, whose total is made of the categories inside it', async () => {
    stub.queue({ id: CATEGORY, name: 'Rumah', cashflow: 'bills' })
    stub.queue({ n: 3 })

    const result = await recordEntry(null, entryForm())
    expect(result.ok).toBe(false)
    expect(result.message).toBe('Kelompok tidak bisa dipakai langsung.')
    expect(result.detail).toContain('isinya 3 pos')
    expect(on('transactions')).toHaveLength(0)
  })

  it('requires both accounts for a transfer', async () => {
    queueCategory({ id: CATEGORY, name: 'Antar Account', cashflow: 'transfer' })

    const result = await recordEntry(
      null,
      entryForm({ accountId: '', fromAccountId: ACCOUNT, toAccountId: '' }),
    )
    expect(result.ok).toBe(false)
    expect(result.detail).toBe('Perpindahan butuh akun asal dan akun tujuan.')
  })

  it('checks both sides of a transfer against the household', async () => {
    queueCategory({ id: CATEGORY, name: 'Antar Account', cashflow: 'transfer' })
    stub.queue([{ id: ACCOUNT }])

    const result = await recordEntry(
      null,
      entryForm({ accountId: '', fromAccountId: ACCOUNT, toAccountId: OTHER_ACCOUNT }),
    )
    expect(result.ok).toBe(false)
    expect(result.message).toBe('Akun itu tidak ada di rumah tangga ini.')
    expect(on('accounts')[0].params).toContainEqual([ACCOUNT, OTHER_ACCOUNT])
  })

  it('refuses a date next month', async () => {
    queueCategory({ id: CATEGORY, name: 'Wifi', cashflow: 'bills' })
    stub.queue([{ id: ACCOUNT }])

    const result = await recordEntry(null, entryForm({ date: '2099-01-01' }))
    expect(result.ok).toBe(false)
    expect(result.message).toBe('Tanggalnya di luar jangkauan.')
    expect(on('transactions')).toHaveLength(0)
  })

  it('treats a repeated client id as already saved', async () => {
    queueCategory({ id: CATEGORY, name: 'Wifi', cashflow: 'bills' })
    stub.queue([{ id: ACCOUNT }])
    stub.queueError('duplicate key', '23505')

    const result = await recordEntry(null, entryForm())
    expect(result.ok).toBe(true)
    expect(result.message).toBe('Sudah tersimpan sebelumnya.')
  })

  it('refuses an amount of nothing', async () => {
    const result = await recordEntry(null, entryForm({ amount: '0' }))
    expect(result.ok).toBe(false)
    expect(result.detail).toBe('Nominalnya harus lebih dari nol.')
    expect(stub.calls).toHaveLength(0)
  })
})

describe('deleteEntry', () => {
  function form() {
    const data = new FormData()
    data.append('transactionId', MANUAL)
    return data
  }

  it('hides a row rather than deleting it, and only a typed one', async () => {
    stub.queue([{ id: MANUAL }])

    const result = await deleteEntry(null, form())
    expect(result.ok).toBe(true)

    const write = on('transactions')[0]
    expect(write.sql).not.toContain('DELETE')
    expect(updated(write)).toHaveProperty('deleted_at')
    expect(write.sql).toContain("source IN ('manual', 'telegram')")
    expect(write.sql).toContain('household_id')
    expect(write.params).toEqual(expect.arrayContaining([MANUAL, 'h1']))
  })

  it('says why a bank row cannot be deleted', async () => {
    stub.queue([])

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
    accounts.mockResolvedValue([account])
    transactions.mockResolvedValue(movement(90_367_950n))
    stub.queue({ id: 'cat-adj' })
    stub.queue([{ id: 'tx' }])

    const result = await adjustBalance(null, form())

    expect(result.ok).toBe(true)
    expect(accounts).toHaveBeenCalledWith('h1')
    const write = on('transactions')[0]
    expect(inserted(write)).toMatchObject({
      household_id: 'h1',
      category_id: 'cat-adj',
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
    accounts.mockResolvedValue([account])
    transactions.mockResolvedValue(movement(50_000_00n))

    const result = await adjustBalance(null, form())
    expect(result.ok).toBe(false)
    expect(result.message).toBe('Saldo akun ini berubah sejak halaman dibuka.')
    expect(stub.calls).toHaveLength(0)
  })

  it('writes nothing when the figures already agree', async () => {
    accounts.mockResolvedValue([account])
    transactions.mockResolvedValue(movement(12_000_000n))

    const result = await adjustBalance(null, form({ expectedComputed: '12000000' }))
    expect(result.ok).toBe(true)
    expect(result.message).toBe('Saldonya sudah sama. Tidak ada yang ditulis.')
    expect(stub.calls).toHaveLength(0)
  })

  it('creates the adjustment category when the household lacks it', async () => {
    accounts.mockResolvedValue([account])
    transactions.mockResolvedValue(movement(90_367_950n))
    stub.queue(null)
    stub.queue({ id: 'cat-new' })
    stub.queue([{ id: 'tx' }])

    const result = await adjustBalance(null, form())
    expect(result.ok).toBe(true)
    const created = on('categories')[1]
    expect(inserted(created)).toMatchObject({
      name: 'Penyesuaian Spending',
      cashflow: 'spending',
      household_id: 'h1',
    })
    expect(inserted(on('transactions')[0]).category_id).toBe('cat-new')
  })

  it('refuses an account the household does not own', async () => {
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
    stub.queue(pair())
    stub.queue({ cashflow: 'spending' })
    stub.queue([{ id: IMPORTED }])
    stub.queue([{ id: MANUAL }])

    const result = await mergeDuplicate(null, form())

    expect(result.ok).toBe(true)
    const [read, patch, hide] = on('transactions')
    expect(read.params).toEqual(['h1', [MANUAL, IMPORTED]])
    expect(updated(patch)).toMatchObject({ category_id: CATEGORY, cashflow: 'spending' })
    expect(patch.params).toEqual(expect.arrayContaining([IMPORTED, 'h1']))
    expect(updated(hide)).toHaveProperty('deleted_at')
    expect(hide.params).toEqual(expect.arrayContaining([MANUAL, 'h1']))
  })

  it('refuses to pick a side for the person when a settled bank category disagrees', async () => {
    const [manualRow, importedRow] = pair()
    const rows = [manualRow, { ...importedRow, category_id: OTHER_CATEGORY, confirmed_at: '2026-10-12T12:00:00.000Z' }]
    stub.queue(rows)
    stub.queue({ cashflow: 'spending' })

    const result = await mergeDuplicate(null, form())

    expect(result.ok).toBe(false)
    expect(result.message).toBe('Pilih kategori yang dipakai.')
    // Nothing written: only the read happened.
    expect(on('transactions')).toHaveLength(1)
  })

  it('writes the kept manual category over a settled bank row', async () => {
    const [manualRow, importedRow] = pair()
    const rows = [manualRow, { ...importedRow, category_id: OTHER_CATEGORY, confirmed_at: '2026-10-12T12:00:00.000Z' }]
    stub.queue(rows)
    stub.queue({ cashflow: 'spending' })
    stub.queue([{ id: IMPORTED }])
    stub.queue([{ id: MANUAL }])
    const data = form()
    data.append('keep', 'manual')

    const result = await mergeDuplicate(null, data)

    expect(result.ok).toBe(true)
    expect(updated(on('transactions')[1])).toMatchObject({ category_id: CATEGORY })
  })

  it('is idempotent once the pair has already been merged', async () => {
    stub.queue(pair({ deleted_at: '2026-08-21T05:00:00.000Z' }))

    const result = await mergeDuplicate(null, form())
    expect(result.ok).toBe(true)
    expect(result.message).toBe('Sudah digabungkan sebelumnya.')
    expect(stub.calls).toHaveLength(1)
  })

  it('refuses a pair the import never linked', async () => {
    stub.queue(pair({ duplicate_of: null }))

    const result = await mergeDuplicate(null, form())
    expect(result.ok).toBe(false)
    expect(result.message).toBe('Pasangan itu tidak ditemukan lagi.')
    expect(stub.calls).toHaveLength(1)
  })

  it('clears the link and keeps both', async () => {
    stub.queue([{ id: MANUAL }])

    const result = await keepBoth(null, form())
    expect(result.ok).toBe(true)
    const write = on('transactions')[0]
    expect(updated(write)).toEqual({ duplicate_of: null })
    expect(write.sql).toContain("source = 'manual'")
    expect(write.params).toEqual([MANUAL, 'h1', IMPORTED])
  })

  it('says the pair was already kept rather than failing on a second press', async () => {
    stub.queue([])
    stub.queue({ id: MANUAL, duplicate_of: null })

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
    accounts.mockResolvedValue([gopay])
    transactions.mockResolvedValue(ledger(10_000_000n))
    adjustments.mockResolvedValue([counted])
    stub.queue({ id: 'cat-adj' })
    stub.queue([{ id: ADJUSTMENT }])

    const result = await recomputeAdjustments()

    expect(result).toMatchObject({ ok: true, applied: 1 })
    const write = on('transactions')[0]
    expect(updated(write)).toEqual({
      amount: '603448100',
      cashflow: 'spending',
      category_id: 'cat-adj',
      from_account_id: ACCOUNT,
      to_account_id: null,
      note: 'Penyesuaian saldo GoPay: tercatat Rp6.034.481, sebenarnya Rp0.',
    })
    // Scoped to this household and to hand-written rows, so a bank row can never be rewritten.
    expect(write.sql).toMatch(/WHERE id = \$\d+ AND household_id = \$\d+ AND source = 'manual'/)
    expect(write.params.slice(-2)).toEqual([ADJUSTMENT, 'h1'])
  })

  it('writes nothing when every correction still lands where it should', async () => {
    accounts.mockResolvedValue([gopay])
    transactions.mockResolvedValue(ledger(0n))
    adjustments.mockResolvedValue([counted])

    const result = await recomputeAdjustments()
    expect(result.ok).toBe(true)
    expect(stub.calls).toHaveLength(0)
  })

  it('hides a correction the balance no longer needs', async () => {
    accounts.mockResolvedValue([gopay])
    transactions.mockResolvedValue(ledger(613_448_100n))
    adjustments.mockResolvedValue([counted])
    stub.queue([{ id: ADJUSTMENT }])

    await recomputeAdjustments()
    expect(updated(on('transactions')[0])).toHaveProperty('deleted_at')
  })

  it('asks a signed-out visitor to sign in again', async () => {
    signedIn.value = false
    expect((await recomputeAdjustments()).ok).toBe(false)
    expect(adjustments).not.toHaveBeenCalled()
  })
})
