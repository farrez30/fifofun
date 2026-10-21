import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createScopeStub } from '@/test/scope-stub'

/**
 * What may be written back to one transaction.
 *
 * The line these tests defend is between a bank fact and a decision about it.
 * A statement row whose amount could be edited would make the reconciliation
 * against the printed balance meaningless, and that check is the only external
 * verification this app has.
 */

const stub = createScopeStub()
let signedIn = true
const groupRefusal = vi.fn(async (): Promise<string | null> => null)

vi.mock('@/db/client', () => ({ db: {} }))
vi.mock('@/lib/auth/session', () => ({ getUser: async () => null, userScope: async () => null }))
vi.mock('@/lib/actions', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/actions')>()),
  context: async () => (signedIn ? { db: stub.scope, householdId: 'h1', userId: 'u1' } : null),
}))
vi.mock('@/lib/queries/categories', () => ({ groupRefusal: () => groupRefusal() }))
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
  revalidateTag: vi.fn(),
  cacheTag: vi.fn(),
  cacheLife: vi.fn(),
}))

const { updateEntry, splitEntry, unsplitEntry, restoreEntry } = await import('./actions')

const TX = '00000000-0000-4000-8000-000000000001'
const CAT_SPEND = '00000000-0000-4000-8000-0000000000c1'
const CAT_INCOME = '00000000-0000-4000-8000-0000000000c2'
const CAT_BILLS = '00000000-0000-4000-8000-0000000000c3'
const ACC = '00000000-0000-4000-8000-0000000000a1'
const ACC_TO = '00000000-0000-4000-8000-0000000000a2'

function bankRow(overrides: Record<string, unknown> = {}) {
  return {
    id: TX,
    occurred_at: '2026-07-15T05:00:00.000Z',
    amount: 15000000,
    cashflow: 'spending',
    source: 'xlsx',
    description: 'ALFAMART CIPUTAT',
    from_account_id: ACC,
    to_account_id: null,
    is_pass_through: false,
    import_batch_id: 'batch-1',
    deleted_at: null,
    ...overrides,
  }
}

function form(fields: Record<string, string>) {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.append(key, value)
  return data
}

/** The SET part of an UPDATE, as `"column" = $n` pairs mapped to their values. */
function patchOf(call: { sql: string; params: unknown[] }): Record<string, unknown> {
  const set = call.sql.slice(call.sql.indexOf(' SET ') + 5, call.sql.indexOf(' WHERE '))
  const patch: Record<string, unknown> = {}
  for (const match of set.matchAll(/"(\w+)" = \$(\d+)/g)) patch[match[1]] = call.params[Number(match[2]) - 1]
  return patch
}

const EDIT = {
  id: TX,
  categoryId: CAT_SPEND,
  description: 'ALFAMART CIPUTAT',
  note: '',
  passThrough: '0',
}

beforeEach(() => {
  stub.reset()
  signedIn = true
  groupRefusal.mockReset()
  groupRefusal.mockResolvedValue(null)
})

describe('updateEntry', () => {
  it('files a statement row under a new category without touching the figure', async () => {
    stub.queue(bankRow())
    stub.queue({ id: CAT_BILLS, name: 'Wifi', cashflow: 'bills' })
    stub.queue([{ id: TX }])

    const result = await updateEntry(
      null,
      // A crafted form can carry an amount. A statement row must ignore it.
      form({ ...EDIT, categoryId: CAT_BILLS, amount: '99900000', date: '2020-01-01', time: '00:00' }),
    )

    expect(result.ok).toBe(true)
    const [read, category, write] = stub.calls
    expect(read.sql).toContain('household_id = $2 AND deleted_at IS NULL')
    expect(read.params).toEqual([TX, 'h1'])
    expect(category.sql).toContain('archived_at IS NULL')
    expect(category.params).toEqual([CAT_BILLS, 'h1'])
    expect(write.sql).toContain('UPDATE public.transactions SET')
    expect(write.params.slice(-2)).toEqual([TX, 'h1'])

    const patch = patchOf(write)
    expect(patch.category_id).toBe(CAT_BILLS)
    expect(patch.cashflow).toBe('bills')
    expect(patch.needs_review).toBe(false)
    expect(patch).not.toHaveProperty('amount')
    expect(patch).not.toHaveProperty('occurred_at')
    expect(patch).not.toHaveProperty('from_account_id')
  })

  it('refuses a category pointing the other way', async () => {
    stub.queue(bankRow())
    stub.queue({ id: CAT_INCOME, name: 'Gaji', cashflow: 'income' })

    const result = await updateEntry(null, form({ ...EDIT, categoryId: CAT_INCOME }))

    expect(result.ok).toBe(false)
    expect(result.detail).toContain('Gaji untuk uang masuk')
    // Refused before the write, so the account sides check never has to fail.
    expect(stub.calls).toHaveLength(2)
  })

  it('refuses an archived category', async () => {
    stub.queue(bankRow())
    stub.queue(null)

    const result = await updateEntry(null, form(EDIT))
    expect(result.message).toBe('Kategori itu tidak ada di rumah tangga ini.')
  })

  it('refuses a group, which would count the money twice', async () => {
    stub.queue(bankRow())
    stub.queue({ id: CAT_SPEND, name: 'Belanja', cashflow: 'spending' })
    groupRefusal.mockResolvedValue('Belanja adalah kelompok.')

    const result = await updateEntry(null, form(EDIT))
    expect(result.message).toBe('Kelompok tidak bisa dipakai langsung.')
    expect(stub.calls).toHaveLength(2)
  })

  it('moves the amount, the time and the account of a row somebody typed', async () => {
    stub.queue(bankRow({ source: 'manual', import_batch_id: null }))
    stub.queue({ id: CAT_SPEND, name: 'Belanja', cashflow: 'spending' })
    stub.queue([{ id: ACC }])
    stub.queue([{ id: TX }])

    const result = await updateEntry(
      null,
      form({ ...EDIT, amount: '20000000', date: '2026-07-16', time: '19:30', accountId: ACC }),
    )

    expect(result.ok).toBe(true)
    const accounts = stub.calls[2]
    expect(accounts.sql).toContain('id = ANY($2::uuid[]) AND archived_at IS NULL')
    expect(accounts.params).toEqual(['h1', [ACC]])

    const patch = patchOf(stub.calls[3])
    expect(patch.amount).toBe('20000000')
    expect(patch.from_account_id).toBe(ACC)
    expect(patch.to_account_id).toBeNull()
    // Half past seven in Jakarta is half past noon in UTC.
    expect(patch.occurred_at).toBe('2026-07-16T12:30:00.000Z')
  })

  it('refuses an account outside the household', async () => {
    stub.queue(bankRow({ source: 'manual', import_batch_id: null }))
    stub.queue({ id: CAT_SPEND, name: 'Belanja', cashflow: 'spending' })
    stub.queue([])

    const result = await updateEntry(
      null,
      form({ ...EDIT, amount: '20000000', date: '2026-07-16', time: '19:30', accountId: ACC }),
    )
    expect(result.message).toBe('Akun itu tidak ada di rumah tangga ini.')
    expect(stub.calls).toHaveLength(3)
  })

  it('leaves a transfer its cashflow and asks for no category', async () => {
    stub.queue(bankRow({ cashflow: 'transfer', source: 'manual', to_account_id: ACC_TO }))
    stub.queue([{ id: ACC }, { id: ACC_TO }])
    stub.queue([{ id: TX }])

    const result = await updateEntry(
      null,
      form({
        id: TX,
        categoryId: '',
        description: 'Top-up GoPay',
        note: '',
        passThrough: '0',
        amount: '15000000',
        date: '2026-07-15',
        time: '12:00',
        fromAccountId: ACC,
        toAccountId: ACC_TO,
      }),
    )

    expect(result.ok).toBe(true)
    const patch = patchOf(stub.calls[2])
    expect(patch).not.toHaveProperty('cashflow')
    expect(patch).not.toHaveProperty('category_id')
  })

  it('refuses a transfer from an account to itself', async () => {
    stub.queue(bankRow({ cashflow: 'transfer', source: 'manual', to_account_id: ACC_TO }))

    const result = await updateEntry(
      null,
      form({
        id: TX,
        categoryId: '',
        description: 'Top-up GoPay',
        note: '',
        passThrough: '0',
        amount: '15000000',
        date: '2026-07-15',
        time: '12:00',
        fromAccountId: ACC,
        toAccountId: ACC,
      }),
    )

    // Not "that account does not exist", which is what a de-duplicated lookup
    // used to answer for a row naming one account twice.
    expect(result.message).toBe('Akun asal dan tujuan tidak boleh sama.')
  })

  it('says what changed when a row becomes money held for somebody else', async () => {
    stub.queue(bankRow())
    stub.queue({ id: CAT_SPEND, name: 'Belanja', cashflow: 'spending' })
    stub.queue([{ id: TX }])

    const result = await updateEntry(null, form({ ...EDIT, passThrough: '1' }))
    expect(result.detail).toContain('tidak ikut dihitung sebagai pemasukan atau pengeluaran')
  })

  it('reports a row that is not there rather than claiming a save', async () => {
    stub.queue(null)
    const result = await updateEntry(null, form(EDIT))
    expect(result.message).toBe('Transaksinya tidak ditemukan.')
  })

  it('reports an update RLS filtered to nothing as not found', async () => {
    stub.queue(bankRow())
    stub.queue({ id: CAT_SPEND, name: 'Belanja', cashflow: 'spending' })
    stub.queue([])
    const result = await updateEntry(null, form(EDIT))
    expect(result.message).toBe('Transaksinya tidak ditemukan.')
  })

  it('keeps the database message of a failed write on the server', async () => {
    stub.queue(bankRow())
    stub.queue({ id: CAT_SPEND, name: 'Belanja', cashflow: 'spending' })
    stub.queueError('violates check constraint "transactions_sides"', '23514')
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await updateEntry(null, form(EDIT))
    expect(result.message).toBe('Perubahannya gagal disimpan.')
    expect(JSON.stringify(result)).not.toContain('transactions_sides')
    spy.mockRestore()
  })

  it('asks a signed-out visitor to sign in again', async () => {
    signedIn = false
    const result = await updateEntry(null, form(EDIT))
    expect(result.message).toContain('Sesi')
    expect(stub.calls).toHaveLength(0)
  })
})

describe('splitEntry', () => {
  function parts(...amounts: string[]) {
    const fields: Record<string, string> = { id: TX }
    amounts.forEach((amount, index) => {
      fields[`part-${index}-amount`] = amount
      fields[`part-${index}-categoryId`] = index === 0 ? CAT_SPEND : CAT_BILLS
      fields[`part-${index}-description`] = ''
    })
    return form(fields)
  }

  const CATEGORIES = [
    { id: CAT_SPEND, name: 'Belanja', cashflow: 'spending' },
    { id: CAT_BILLS, name: 'Wifi', cashflow: 'bills' },
  ]

  it('writes parts that add up, keeps the batch, and hides the original', async () => {
    stub.queue(bankRow()) // the parent
    stub.queue([]) // no parts yet
    stub.queue(CATEGORIES)
    stub.queue([]) // no groups
    stub.queue([{ id: 'child-1' }, { id: 'child-2' }]) // the parts
    stub.queue({ id: 'child-1' }) // the first part
    stub.queue([]) // fees moved
    stub.queue([{ id: TX }]) // parent hidden

    const result = await splitEntry(null, parts('10000000', '5000000'))

    expect(result.ok).toBe(true)
    expect(result.applied).toBe(2)

    expect(stub.calls[2].sql).toContain('id = ANY($2::uuid[]) AND archived_at IS NULL')
    expect(stub.calls[2].params).toEqual(['h1', [CAT_SPEND, CAT_BILLS]])

    const insert = stub.calls[4]
    expect(insert.sql).toContain('INSERT INTO public.transactions')
    expect(insert.sql).toContain('ON CONFLICT (household_id, dedupe_key) DO UPDATE')
    const columns = insert.sql
      .slice(insert.sql.indexOf('(') + 1, insert.sql.indexOf(')'))
      .split(', ')
      .map((c) => c.replaceAll('"', ''))
    const children = [0, 1].map((n) =>
      Object.fromEntries(columns.map((c, i) => [c, insert.params[n * columns.length + i]])),
    )
    expect(children.every((child) => child.household_id === 'h1')).toBe(true)
    expect(children[0].split_of).toBe(TX)
    expect(children[0].dedupe_key).toBe(`split:${TX}:1`)
    // The parts belong to the statement the original came from, so re-importing
    // it does not bring the original back beside them.
    expect(children[0].import_batch_id).toBe('batch-1')
    expect(children[0].external_ref).toBeNull()
    expect(children[1].cashflow).toBe('bills')

    const hidden = stub.calls.at(-1)
    expect(hidden?.sql).toContain('SET deleted_at = $1')
    expect(hidden?.params[0]).toBeTruthy()
    expect(hidden?.params.slice(1)).toEqual([TX, 'h1'])
  })

  it('refuses parts that do not add up, and says by how much', async () => {
    stub.queue(bankRow())
    stub.queue([])
    stub.queue(CATEGORIES)

    const result = await splitEntry(null, parts('10000000', '4000000'))
    expect(result.message).toBe('Masih kurang Rp10.000.')
    expect(result.detail).toContain('Rp150.000')
  })

  it('refuses to split a transfer', async () => {
    stub.queue(bankRow({ cashflow: 'transfer' }))

    const result = await splitEntry(null, parts('10000000', '5000000'))
    expect(result.message).toBe('Perpindahan antar akun tidak bisa dipisah.')
  })

  it('refuses a part whose category points the other way', async () => {
    stub.queue(bankRow())
    stub.queue([])
    stub.queue([
      { id: CAT_SPEND, name: 'Belanja', cashflow: 'spending' },
      { id: CAT_BILLS, name: 'Gaji', cashflow: 'income' },
    ])

    const result = await splitEntry(null, parts('10000000', '5000000'))
    expect(result.detail).toContain('Gaji untuk uang masuk')
  })

  it('refuses a part filed under a group', async () => {
    stub.queue(bankRow())
    stub.queue([])
    stub.queue(CATEGORIES)
    stub.queue([{ parent_id: CAT_BILLS }])

    const result = await splitEntry(null, parts('10000000', '5000000'))
    expect(result.message).toBe('Kelompok tidak bisa dipakai langsung.')
    expect(stub.calls).toHaveLength(4)
  })

  it('treats a row already split as already split', async () => {
    stub.queue(bankRow({ deleted_at: '2026-07-20T00:00:00Z' }))
    stub.queue([{ id: 'child-1' }, { id: 'child-2' }])

    const result = await splitEntry(null, parts('10000000', '5000000'))
    expect(result).toMatchObject({ ok: true, message: 'Sudah dipisah sebelumnya.' })
  })

  it('refuses a single part, which would change nothing', async () => {
    const result = await splitEntry(null, parts('15000000'))
    expect(result.ok).toBe(false)
    expect(stub.calls).toHaveLength(0)
  })
})

describe('unsplitEntry', () => {
  it('hides the parts and brings the original back', async () => {
    stub.queue([{ id: 'child-1' }, { id: 'child-2' }])
    stub.queue([])
    stub.queue([{ id: 'child-1' }, { id: 'child-2' }])
    stub.queue([])
    stub.queue([{ id: TX }])

    const result = await unsplitEntry(null, form({ id: TX }))

    expect(result.ok).toBe(true)
    expect(result.message).toBe('Digabungkan kembali dari 2 bagian.')
    expect(stub.calls[2].sql).toContain('id = ANY($3::uuid[])')
    expect(stub.calls[2].params).toContain('h1')
    const restore = stub.calls.at(-1)
    expect(restore?.sql).toContain('SET deleted_at = NULL')
    expect(restore?.params).toEqual([TX, 'h1'])
  })

  it('refuses while one of the parts is itself split', async () => {
    stub.queue([{ id: 'child-1' }])
    stub.queue([{ id: 'grandchild-1' }])

    const result = await unsplitEntry(null, form({ id: TX }))
    expect(result.message).toBe('Ada bagian yang dipisah lagi.')
    // Nothing written: two of these in a row would lose a level of the tree.
    expect(stub.calls).toHaveLength(2)
  })

  it('treats a row with no parts as already whole', async () => {
    stub.queue([])

    const result = await unsplitEntry(null, form({ id: TX }))
    expect(result).toEqual({ ok: true, message: 'Transaksinya sudah utuh.' })
  })
})

describe('restoreEntry', () => {
  it('brings back only a deleted row somebody typed, inside the household', async () => {
    stub.queue([])
    stub.queue([{ id: TX }])

    const result = await restoreEntry(null, form({ id: TX }))
    expect(result.ok).toBe(true)
    const write = stub.calls[1]
    expect(write.sql).toContain("source IN ('manual', 'telegram') AND deleted_at IS NOT NULL")
    expect(write.params).toEqual([TX, 'h1'])
  })

  it('refuses a row hidden because it was split', async () => {
    stub.queue([{ id: 'child-1' }])
    const result = await restoreEntry(null, form({ id: TX }))
    expect(result.message).toBe('Transaksi ini sedang dipisah.')
    expect(stub.calls).toHaveLength(1)
  })

  it('says so when there was nothing to restore', async () => {
    stub.queue([])
    stub.queue([])
    const result = await restoreEntry(null, form({ id: TX }))
    expect(result.ok).toBe(false)
  })
})
