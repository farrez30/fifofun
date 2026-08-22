import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSupabaseStub } from '@/test/supabase-stub'

/**
 * What settings will and will not let happen.
 *
 * Renaming is meant to be free, so the interesting assertions are the three
 * places where it is not: an import key that two accounts would both claim, a
 * cashflow that transactions already depend on, and a savings pot whose two
 * halves have to keep the same name.
 */

const stub = createSupabaseStub()

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => stub.client }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const {
  createAccount,
  updateAccount,
  setAccountArchived,
  moveAccount,
  createCategory,
  updateCategory,
  setCategoryArchived,
} = await import('./actions')

const ACCOUNTS = [
  { id: '00000000-0000-4000-8000-0000000000a1', name: 'Bank Mandiri', kind: 'bank', key: 'mandiri', sort_order: 1, archived_at: null, opening_balance: '100000' },
  { id: '00000000-0000-4000-8000-0000000000a2', name: 'GoPay', kind: 'ewallet', key: 'gopay', sort_order: 2, archived_at: null, opening_balance: '0' },
  { id: '00000000-0000-4000-8000-0000000000a3', name: 'OVO lama', kind: 'ewallet', key: null, sort_order: 3, archived_at: '2026-01-01T00:00:00Z', opening_balance: '0' },
]

const CATEGORIES = [
  { id: '00000000-0000-4000-8000-0000000000c1', name: 'Tabungan', cashflow: 'invest_savings', sort_order: 1, archived_at: null },
  { id: '00000000-0000-4000-8000-0000000000c2', name: 'Tabungan', cashflow: 'from_asset', sort_order: 2, archived_at: null },
  { id: '00000000-0000-4000-8000-0000000000c3', name: 'Belanja', cashflow: 'spending', sort_order: 3, archived_at: null },
  { id: '00000000-0000-4000-8000-0000000000c4', name: 'Dana Menikah', cashflow: 'financial_goal', sort_order: 4, archived_at: null },
]

/*
  Real ids, because the actions refuse anything that is not a uuid before they
  touch the database. Short strings would have made half of these tests pass
  through a validation error rather than through the branch they are about.
*/
function form(fields: Record<string, string>) {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.append(key, value)
  return data
}

const ACCOUNT_FIELDS = {
  name: 'Bank Mandiri',
  kind: 'bank',
  institution: 'Bank Mandiri',
  key: 'mandiri',
  openingBalance: '100000',
  openingBalanceAt: '',
  ownIdentifiers: '',
}

const CATEGORY_FIELDS = {
  name: 'Tabungan',
  cashflow: 'invest_savings',
  icon: 'PiggyBank',
  hue: '120',
}

beforeEach(() => {
  stub.calls.length = 0
  stub.setUser({ id: 'u1' })
})

function household() {
  stub.queue('households', { data: { id: 'h1' } })
}

describe('createAccount', () => {
  it('numbers the new account after the ones already there', async () => {
    household()
    stub.queue('accounts', { data: ACCOUNTS }, { data: [{ id: '00000000-0000-4000-8000-0000000000a4' }] })

    const result = await createAccount(
      null,
      form({ ...ACCOUNT_FIELDS, name: 'Jago', kind: 'bank', key: '', institution: '' }),
    )

    expect(result.ok).toBe(true)
    const insert = stub.callsOn('accounts')[1]
    const payload = insert.payload as Record<string, unknown>
    expect(payload.sort_order).toBe(4)
    expect(payload.key).toBeNull()
    expect(payload.household_id).toBe('h1')
  })

  it('refuses a name another account already has, whatever the case', async () => {
    household()
    stub.queue('accounts', { data: ACCOUNTS })

    const result = await createAccount(null, form({ ...ACCOUNT_FIELDS, name: 'bank mandiri' }))
    expect(result.ok).toBe(false)
    expect(result.message).toContain('Sudah ada akun bernama')
    // Nothing written: the refusal happens before the insert.
    expect(stub.callsOn('accounts')).toHaveLength(1)
  })

  it('names the key when two accounts claim the same one', async () => {
    household()
    stub.queue(
      'accounts',
      { data: ACCOUNTS },
      { error: { message: 'duplicate key', code: '23505' } },
    )

    const result = await createAccount(null, form({ ...ACCOUNT_FIELDS, name: 'Mandiri baru' }))
    expect(result.message).toBe('Kunci impor mandiri sudah dipakai akun lain.')
  })

  it('refuses a phone number that is not one, and says which', async () => {
    const result = await createAccount(
      null,
      form({ ...ACCOUNT_FIELDS, name: 'Jago', key: '', ownIdentifiers: '081234567890, gopay saya' }),
    )
    expect(result.ok).toBe(false)
    expect(result.detail).toContain('gopay saya')
    expect(stub.calls).toHaveLength(0)
  })

  it('keeps e-wallet numbers off accounts that are not the bank', async () => {
    household()
    stub.queue('accounts', { data: ACCOUNTS }, { data: [{ id: '00000000-0000-4000-8000-0000000000a4' }] })

    await createAccount(
      null,
      form({
        ...ACCOUNT_FIELDS,
        name: 'DANA',
        kind: 'ewallet',
        key: 'dana',
        ownIdentifiers: '081234567890',
      }),
    )

    const payload = stub.callsOn('accounts')[1].payload as Record<string, unknown>
    // The numbers answer "is this top-up mine", which is a question only the
    // statement asks, and the statement is the bank account.
    expect(payload.own_identifiers).toEqual([])
  })
})

describe('updateAccount', () => {
  it('warns when the opening balance changes and stays quiet otherwise', async () => {
    household()
    stub.queue('accounts', { data: ACCOUNTS }, { data: [{ id: '00000000-0000-4000-8000-0000000000a1' }] })
    const quiet = await updateAccount(null, form({ ...ACCOUNT_FIELDS, id: '00000000-0000-4000-8000-0000000000a1' }))
    expect(quiet.detail).toBeUndefined()

    household()
    stub.queue('accounts', { data: ACCOUNTS }, { data: [{ id: '00000000-0000-4000-8000-0000000000a1' }] })
    const loud = await updateAccount(
      null,
      form({ ...ACCOUNT_FIELDS, id: '00000000-0000-4000-8000-0000000000a1', openingBalance: '250000' }),
    )
    expect(loud.detail).toContain('Saldo awal menggeser saldo akun ini di semua bulan')
  })

  it('refuses to turn the statement account into a wallet', async () => {
    household()
    stub.queue('accounts', { data: ACCOUNTS })

    const result = await updateAccount(
      null,
      form({ ...ACCOUNT_FIELDS, id: '00000000-0000-4000-8000-0000000000a1', kind: 'ewallet' }),
    )
    expect(result.message).toBe('Rekening dengan kunci mandiri harus tetap berjenis Bank.')
  })

  it('lets an account be renamed freely', async () => {
    household()
    stub.queue('accounts', { data: ACCOUNTS }, { data: [{ id: '00000000-0000-4000-8000-0000000000a1' }] })

    const result = await updateAccount(
      null,
      form({ ...ACCOUNT_FIELDS, id: '00000000-0000-4000-8000-0000000000a1', name: 'Rekening Gaji' }),
    )
    expect(result.ok).toBe(true)
    const patch = stub.callsOn('accounts')[1].payload as Record<string, unknown>
    // The key stays put, which is the entire reason renaming is safe.
    expect(patch.name).toBe('Rekening Gaji')
    expect(patch.key).toBe('mandiri')
  })
})

describe('setAccountArchived', () => {
  it('lets go of the import key and says so', async () => {
    household()
    stub.queue('accounts', { data: ACCOUNTS }, { data: [{ id: '00000000-0000-4000-8000-0000000000a2' }] })

    const result = await setAccountArchived(null, form({ id: '00000000-0000-4000-8000-0000000000a2', archived: '1' }))

    expect(result.ok).toBe(true)
    expect(result.detail).toContain('Kunci impornya, gopay, dilepas.')
    const patch = stub.callsOn('accounts')[1].payload as Record<string, unknown>
    expect(patch.key).toBeNull()
    expect(patch.archived_at).toBeTruthy()
  })

  it('brings one back without inventing a key for it', async () => {
    household()
    stub.queue('accounts', { data: ACCOUNTS }, { data: [{ id: '00000000-0000-4000-8000-0000000000a3' }] })

    const result = await setAccountArchived(null, form({ id: '00000000-0000-4000-8000-0000000000a3', archived: '0' }))
    const patch = stub.callsOn('accounts')[1].payload as Record<string, unknown>
    expect(patch).toEqual({ archived_at: null })
    expect(result.detail).toContain('pasang lagi kunci impornya')
  })
})

describe('moveAccount', () => {
  it('moves only the two neighbours that swap', async () => {
    household()
    stub.queue('accounts', { data: ACCOUNTS }, { data: [{ id: '00000000-0000-4000-8000-0000000000a2' }] }, { data: [{ id: '00000000-0000-4000-8000-0000000000a1' }] })

    const result = await moveAccount(null, form({ id: '00000000-0000-4000-8000-0000000000a2', direction: 'up' }))

    expect(result.ok).toBe(true)
    const writes = stub.callsOn('accounts').slice(1)
    expect(writes).toHaveLength(2)
    expect((writes[0].payload as Record<string, unknown>).sort_order).toBe(1)
    expect((writes[1].payload as Record<string, unknown>).sort_order).toBe(2)
  })

  it('refuses to move an archived row', async () => {
    household()
    stub.queue('accounts', { data: ACCOUNTS })

    const result = await moveAccount(null, form({ id: '00000000-0000-4000-8000-0000000000a3', direction: 'up' }))
    expect(result.ok).toBe(false)
    expect(stub.callsOn('accounts')).toHaveLength(1)
  })

  it('says nothing happened at the end of the list', async () => {
    household()
    stub.queue('accounts', { data: ACCOUNTS })

    const result = await moveAccount(null, form({ id: '00000000-0000-4000-8000-0000000000a1', direction: 'up' }))
    expect(result).toEqual({ ok: true, message: 'Sudah di ujung.' })
  })
})

describe('createCategory', () => {
  it('stores the hue as text and the icon by name', async () => {
    household()
    stub.queue('categories', { data: CATEGORIES }, { data: [{ id: '00000000-0000-4000-8000-0000000000c5' }] })

    const result = await createCategory(null, form({ ...CATEGORY_FIELDS, name: 'Kopi', cashflow: 'spending' }))

    expect(result.ok).toBe(true)
    const payload = stub.callsOn('categories')[1].payload as Record<string, unknown>
    expect(payload.color).toBe('120')
    expect(payload.icon).toBe('PiggyBank')
    expect(payload.sort_order).toBe(5)
  })

  it('allows the same name under a different cashflow', async () => {
    household()
    stub.queue('categories', { data: CATEGORIES }, { data: [{ id: '00000000-0000-4000-8000-0000000000c5' }] })

    // Tabungan the goal is not Tabungan the savings pot, and the unique index
    // is on the pair rather than on the name.
    const result = await createCategory(
      null,
      form({ ...CATEGORY_FIELDS, name: 'Tabungan', cashflow: 'financial_goal' }),
    )
    expect(result.ok).toBe(true)
  })

  it('refuses a duplicate under the same cashflow', async () => {
    household()
    stub.queue('categories', { data: CATEGORIES })

    const result = await createCategory(null, form(CATEGORY_FIELDS))
    expect(result.message).toContain('Sudah ada kategori Tabungan di')
    expect(stub.callsOn('categories')).toHaveLength(1)
  })

  it('refuses an icon that is not in the registry', async () => {
    const result = await createCategory(null, form({ ...CATEGORY_FIELDS, icon: 'Rocket' }))
    expect(result.ok).toBe(false)
    expect(stub.calls).toHaveLength(0)
  })
})

describe('updateCategory', () => {
  it('renames both halves of a savings pot', async () => {
    household()
    stub.queue('categories', { data: CATEGORIES }, { data: [{ id: '00000000-0000-4000-8000-0000000000c1' }] }, { data: [{ id: '00000000-0000-4000-8000-0000000000c2' }] })

    const result = await updateCategory(
      null,
      form({ ...CATEGORY_FIELDS, id: '00000000-0000-4000-8000-0000000000c1', name: 'Tabungan Utama' }),
    )

    expect(result.ok).toBe(true)
    expect(result.detail).toContain('Sisi pengambilannya ikut diganti nama')
    const writes = stub.callsOn('categories').slice(1)
    expect(writes).toHaveLength(2)
    expect((writes[1].payload as Record<string, unknown>).name).toBe('Tabungan Utama')
    expect(writes[1].args[writes[1].chain.indexOf('eq')]).toEqual(['id', '00000000-0000-4000-8000-0000000000c2'])
  })

  it('refuses to rename onto a name a twin already holds', async () => {
    household()
    stub.queue('categories', {
      data: [...CATEGORIES, { id: '00000000-0000-4000-8000-0000000000c5', name: 'Dana Menikah', cashflow: 'from_asset', sort_order: 5, archived_at: null }],
    })

    // Renaming the savings pot to Dana Menikah would need its withdrawal side
    // to take a name the goal withdrawal side already has.
    const result = await updateCategory(
      null,
      form({ ...CATEGORY_FIELDS, id: '00000000-0000-4000-8000-0000000000c1', name: 'Dana Menikah' }),
    )
    expect(result.ok).toBe(false)
    expect(result.message).toContain('Sudah ada kategori Dana Menikah')
  })

  it('freezes the cashflow once anything has been filed under it', async () => {
    household()
    stub.queue('categories', { data: CATEGORIES })
    stub.queue('transactions', { count: 12 })

    const result = await updateCategory(
      null,
      form({ ...CATEGORY_FIELDS, id: '00000000-0000-4000-8000-0000000000c3', name: 'Belanja', cashflow: 'bills' }),
    )
    expect(result.message).toBe('Cashflow kategori ini sudah terkunci.')
    expect(result.detail).toContain('12 transaksi')
  })

  it('allows the cashflow to move on a category nothing uses yet', async () => {
    household()
    stub.queue('categories', { data: CATEGORIES }, { data: [{ id: '00000000-0000-4000-8000-0000000000c3' }] })
    stub.queue('transactions', { count: 0 })

    const result = await updateCategory(
      null,
      form({ ...CATEGORY_FIELDS, id: '00000000-0000-4000-8000-0000000000c3', name: 'Belanja', cashflow: 'bills' }),
    )
    expect(result.ok).toBe(true)
  })
})

describe('setCategoryArchived', () => {
  it('archives a pot together with the side money leaves it by', async () => {
    household()
    stub.queue('categories', { data: CATEGORIES }, { data: [{ id: '00000000-0000-4000-8000-0000000000c1' }] }, { data: [{ id: '00000000-0000-4000-8000-0000000000c2' }] })

    const result = await setCategoryArchived(null, form({ id: '00000000-0000-4000-8000-0000000000c1', archived: '1' }))

    expect(result.ok).toBe(true)
    const writes = stub.callsOn('categories').slice(1)
    expect(writes).toHaveLength(2)
    for (const write of writes) {
      expect((write.payload as Record<string, unknown>).archived_at).toBeTruthy()
    }
  })

  it('leaves an ordinary category on its own', async () => {
    household()
    stub.queue('categories', { data: CATEGORIES }, { data: [{ id: '00000000-0000-4000-8000-0000000000c3' }] })

    await setCategoryArchived(null, form({ id: '00000000-0000-4000-8000-0000000000c3', archived: '1' }))
    expect(stub.callsOn('categories').slice(1)).toHaveLength(1)
  })
})
