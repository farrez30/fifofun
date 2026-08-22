import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSupabaseStub } from '@/test/supabase-stub'

/**
 * What may be written back to one transaction.
 *
 * The line these tests defend is between a bank fact and a decision about it.
 * A statement row whose amount could be edited would make the reconciliation
 * against the printed balance meaningless, and that check is the only external
 * verification this app has.
 */

const stub = createSupabaseStub()

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => stub.client }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { updateEntry, splitEntry, unsplitEntry } = await import('./actions')

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
    amount: '15000000',
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

const EDIT = {
  id: TX,
  categoryId: CAT_SPEND,
  description: 'ALFAMART CIPUTAT',
  note: '',
  passThrough: '0',
}

beforeEach(() => {
  stub.reset()
  stub.setUser({ id: 'u1' })
  stub.queue('households', { data: { id: 'h1' } })
})

describe('updateEntry', () => {
  it('files a statement row under a new category without touching the figure', async () => {
    stub.queue('transactions', { data: bankRow() }, { data: [{ id: TX }] })
    stub.queue('categories', { data: { id: CAT_BILLS, name: 'Wifi', cashflow: 'bills' } })

    const result = await updateEntry(
      null,
      // A crafted form can carry an amount. A statement row must ignore it.
      form({ ...EDIT, categoryId: CAT_BILLS, amount: '99900000', date: '2020-01-01', time: '00:00' }),
    )

    expect(result.ok).toBe(true)
    const patch = stub.callsOn('transactions')[1].payload as Record<string, unknown>
    expect(patch.category_id).toBe(CAT_BILLS)
    expect(patch.cashflow).toBe('bills')
    expect(patch.needs_review).toBe(false)
    expect(patch.amount).toBeUndefined()
    expect(patch.occurred_at).toBeUndefined()
    expect(patch.from_account_id).toBeUndefined()
  })

  it('refuses a category pointing the other way', async () => {
    stub.queue('transactions', { data: bankRow() })
    stub.queue('categories', { data: { id: CAT_INCOME, name: 'Gaji', cashflow: 'income' } })

    const result = await updateEntry(null, form({ ...EDIT, categoryId: CAT_INCOME }))

    expect(result.ok).toBe(false)
    expect(result.detail).toContain('Gaji untuk uang masuk')
    // Refused before the write, so the account sides check never has to fail.
    expect(stub.callsOn('transactions')).toHaveLength(1)
  })

  it('refuses an archived category', async () => {
    stub.queue('transactions', { data: bankRow() })
    stub.queue('categories', { data: null })

    const result = await updateEntry(null, form(EDIT))
    expect(result.message).toBe('Kategori itu tidak ada di rumah tangga ini.')
  })

  it('moves the amount, the time and the account of a row somebody typed', async () => {
    stub.queue(
      'transactions',
      { data: bankRow({ source: 'manual', import_batch_id: null }) },
      { data: [{ id: TX }] },
    )
    stub.queue('categories', { data: { id: CAT_SPEND, name: 'Belanja', cashflow: 'spending' } })
    stub.queue('accounts', { data: [{ id: ACC }] })

    const result = await updateEntry(
      null,
      form({ ...EDIT, amount: '20000000', date: '2026-07-16', time: '19:30', accountId: ACC }),
    )

    expect(result.ok).toBe(true)
    const patch = stub.callsOn('transactions')[1].payload as Record<string, unknown>
    expect(patch.amount).toBe('20000000')
    expect(patch.from_account_id).toBe(ACC)
    expect(patch.to_account_id).toBeNull()
    // Half past seven in Jakarta is half past noon in UTC.
    expect(patch.occurred_at).toBe('2026-07-16T12:30:00.000Z')
  })

  it('leaves a transfer its cashflow and asks for no category', async () => {
    stub.queue(
      'transactions',
      { data: bankRow({ cashflow: 'transfer', source: 'manual', to_account_id: ACC_TO }) },
      { data: [{ id: TX }] },
    )
    stub.queue('accounts', { data: [{ id: ACC }, { id: ACC_TO }] })

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
    const patch = stub.callsOn('transactions')[1].payload as Record<string, unknown>
    expect(patch.cashflow).toBeUndefined()
    expect(patch.category_id).toBeUndefined()
  })

  it('refuses a transfer from an account to itself', async () => {
    stub.queue('transactions', {
      data: bankRow({ cashflow: 'transfer', source: 'manual', to_account_id: ACC_TO }),
    })

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
    stub.queue('transactions', { data: bankRow() }, { data: [{ id: TX }] })
    stub.queue('categories', { data: { id: CAT_SPEND, name: 'Belanja', cashflow: 'spending' } })

    const result = await updateEntry(null, form({ ...EDIT, passThrough: '1' }))
    expect(result.detail).toContain('tidak ikut dihitung sebagai pemasukan atau pengeluaran')
  })

  it('reports a row that is not there rather than claiming a save', async () => {
    stub.queue('transactions', { data: null })
    const result = await updateEntry(null, form(EDIT))
    expect(result.message).toBe('Transaksinya tidak ditemukan.')
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

  function categories() {
    stub.queue('categories', {
      data: [
        { id: CAT_SPEND, name: 'Belanja', cashflow: 'spending' },
        { id: CAT_BILLS, name: 'Wifi', cashflow: 'bills' },
      ],
    })
  }

  it('writes parts that add up, keeps the batch, and hides the original', async () => {
    stub.queue(
      'transactions',
      { data: bankRow() },
      { data: [] },
      { data: [{ id: 'child-1' }, { id: 'child-2' }] },
      { data: { id: 'child-1' } },
      { data: [] },
      { data: [{ id: TX }] },
    )
    categories()

    const result = await splitEntry(null, parts('10000000', '5000000'))

    expect(result.ok).toBe(true)
    expect(result.applied).toBe(2)

    const children = stub.callsOn('transactions')[2].payload as Record<string, unknown>[]
    expect(children).toHaveLength(2)
    expect(children[0].split_of).toBe(TX)
    expect(children[0].dedupe_key).toBe(`split:${TX}:1`)
    // The parts belong to the statement the original came from, so re-importing
    // it does not bring the original back beside them.
    expect(children[0].import_batch_id).toBe('batch-1')
    expect(children[0].external_ref).toBeNull()
    expect(children[1].cashflow).toBe('bills')

    const hidden = stub.callsOn('transactions').at(-1)!.payload as Record<string, unknown>
    expect(hidden.deleted_at).toBeTruthy()
  })

  it('refuses parts that do not add up, and says by how much', async () => {
    stub.queue('transactions', { data: bankRow() }, { data: [] })
    categories()

    const result = await splitEntry(null, parts('10000000', '4000000'))
    expect(result.message).toBe('Masih kurang Rp10.000.')
    expect(result.detail).toContain('Rp150.000')
  })

  it('refuses to split a transfer', async () => {
    stub.queue('transactions', { data: bankRow({ cashflow: 'transfer' }) })

    const result = await splitEntry(null, parts('10000000', '5000000'))
    expect(result.message).toBe('Perpindahan antar akun tidak bisa dipisah.')
  })

  it('refuses a part whose category points the other way', async () => {
    stub.queue('transactions', { data: bankRow() }, { data: [] })
    stub.queue('categories', {
      data: [
        { id: CAT_SPEND, name: 'Belanja', cashflow: 'spending' },
        { id: CAT_BILLS, name: 'Gaji', cashflow: 'income' },
      ],
    })

    const result = await splitEntry(null, parts('10000000', '5000000'))
    expect(result.detail).toContain('Gaji untuk uang masuk')
  })

  it('treats a row already split as already split', async () => {
    stub.queue(
      'transactions',
      { data: bankRow({ deleted_at: '2026-07-20T00:00:00Z' }) },
      { data: [{ id: 'child-1' }, { id: 'child-2' }] },
    )

    const result = await splitEntry(null, parts('10000000', '5000000'))
    expect(result).toMatchObject({ ok: true, message: 'Sudah dipisah sebelumnya.' })
  })

  it('refuses a single part, which would change nothing', async () => {
    const result = await splitEntry(null, parts('15000000'))
    expect(result.ok).toBe(false)
    expect(stub.callsOn('transactions')).toHaveLength(0)
  })
})

describe('unsplitEntry', () => {
  it('hides the parts and brings the original back', async () => {
    stub.queue(
      'transactions',
      { data: [{ id: 'child-1' }, { id: 'child-2' }] },
      { data: [] },
      { data: [{ id: 'child-1' }, { id: 'child-2' }] },
      { data: [] },
      { data: [{ id: TX }] },
    )

    const result = await unsplitEntry(null, form({ id: TX }))

    expect(result.ok).toBe(true)
    expect(result.message).toBe('Digabungkan kembali dari 2 bagian.')
    const restore = stub.callsOn('transactions').at(-1)!.payload as Record<string, unknown>
    expect(restore).toEqual({ deleted_at: null })
  })

  it('refuses while one of the parts is itself split', async () => {
    stub.queue(
      'transactions',
      { data: [{ id: 'child-1' }] },
      { data: [{ id: 'grandchild-1' }] },
    )

    const result = await unsplitEntry(null, form({ id: TX }))
    expect(result.message).toBe('Ada bagian yang dipisah lagi.')
    // Nothing written: two of these in a row would lose a level of the tree.
    expect(stub.callsOn('transactions')).toHaveLength(2)
  })

  it('treats a row with no parts as already whole', async () => {
    stub.queue('transactions', { data: [] })

    const result = await unsplitEntry(null, form({ id: TX }))
    expect(result).toEqual({ ok: true, message: 'Transaksinya sudah utuh.' })
  })
})
