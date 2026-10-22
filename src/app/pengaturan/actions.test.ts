import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createScopeStub, type RecordedCall } from '@/test/scope-stub'

/**
 * What settings will and will not let happen.
 *
 * Renaming is meant to be free, so the interesting assertions are the three
 * places where it is not: an import key that two accounts would both claim, a
 * cashflow that transactions already depend on, and a savings pot whose two
 * halves have to keep the same name.
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

const {
  createAccount,
  updateAccount,
  setAccountArchived,
  reorderAccounts,
  reorderCategories,
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
  description: 'Menyisihkan uang ke tabungan umum.',
}

beforeEach(() => {
  stub.reset()
  signedIn = true
})

/** The table a statement reads or writes: the first one it names. */
function tableOf(sql: string): string | undefined {
  return /(?:public\.|"public"\.")(\w+)/.exec(sql)?.[1]
}

/** Every statement against one table, in order. */
function on(table: string): RecordedCall[] {
  return stub.calls.filter((call) => tableOf(call.sql) === table)
}

/** What an INSERT or UPDATE wrote, rebuilt as the object it was built from. */
function written(call: RecordedCall): Record<string, unknown> {
  const value = (n: string) => call.params[Number(n) - 1]
  if (call.sql.startsWith('INSERT')) {
    const columns = /\(([^)]*)\) VALUES \(([^)]*)\)/.exec(call.sql)
    if (!columns) throw new Error(`not an insert: ${call.sql}`)
    const names = columns[1].split(', ').map((c) => c.replaceAll('"', ''))
    const slots = columns[2].split(', ').map((v) => v.slice(1))
    return Object.fromEntries(names.map((name, i) => [name, value(slots[i])]))
  }
  const set = call.sql.slice(call.sql.indexOf(' SET ') + 5, call.sql.search(/\s+WHERE /))
  const patch: Record<string, unknown> = {}
  for (const m of set.matchAll(/"?(\w+)"? = \$(\d+)/g)) patch[m[1]] = value(m[2])
  return patch
}

describe('createAccount', () => {
  it('numbers the new account after the ones already there', async () => {
    stub.queue(ACCOUNTS)
    stub.queue([{ id: '00000000-0000-4000-8000-0000000000a4' }])

    const result = await createAccount(
      null,
      form({ ...ACCOUNT_FIELDS, name: 'Jago', kind: 'bank', key: '', institution: '' }),
    )

    expect(result.ok).toBe(true)
    const insert = on('accounts')[1]
    const payload = written(insert) as Record<string, unknown>
    expect(payload.sort_order).toBe(4)
    expect(payload.key).toBeNull()
    expect(payload.household_id).toBe('h1')
  })

  it('refuses a name another account already has, whatever the case', async () => {
    stub.queue(ACCOUNTS)

    const result = await createAccount(null, form({ ...ACCOUNT_FIELDS, name: 'bank mandiri' }))
    expect(result.ok).toBe(false)
    expect(result.message).toContain('Sudah ada akun bernama')
    // Nothing written: the refusal happens before the insert.
    expect(on('accounts')).toHaveLength(1)
  })

  it('names the key when two accounts claim the same one', async () => {
    stub.queue(ACCOUNTS)
    stub.queueError('duplicate key', '23505')

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
    stub.queue(ACCOUNTS)
    stub.queue([{ id: '00000000-0000-4000-8000-0000000000a4' }])

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

    const payload = written(on('accounts')[1]) as Record<string, unknown>
    // The numbers answer "is this top-up mine", which is a question only the
    // statement asks, and the statement is the bank account.
    expect(payload.own_identifiers).toEqual([])
  })
})

describe('updateAccount', () => {
  it('warns when the opening balance changes and stays quiet otherwise', async () => {
    stub.queue(ACCOUNTS)
    stub.queue([{ id: '00000000-0000-4000-8000-0000000000a1' }])
    const quiet = await updateAccount(null, form({ ...ACCOUNT_FIELDS, id: '00000000-0000-4000-8000-0000000000a1' }))
    expect(quiet.detail).toBeUndefined()

    stub.queue(ACCOUNTS)
    stub.queue([{ id: '00000000-0000-4000-8000-0000000000a1' }])
    const loud = await updateAccount(
      null,
      form({ ...ACCOUNT_FIELDS, id: '00000000-0000-4000-8000-0000000000a1', openingBalance: '250000' }),
    )
    expect(loud.detail).toContain('Saldo awal menggeser saldo akun ini di semua bulan')
  })

  it('refuses to turn the statement account into a wallet', async () => {
    stub.queue(ACCOUNTS)

    const result = await updateAccount(
      null,
      form({ ...ACCOUNT_FIELDS, id: '00000000-0000-4000-8000-0000000000a1', kind: 'ewallet' }),
    )
    expect(result.message).toBe('Rekening dengan kunci mandiri harus tetap berjenis Bank.')
  })

  it('stores the colour in one spelling and keeps the icon when no file was chosen', async () => {
    stub.queue(ACCOUNTS)
    stub.queue([{ id: '00000000-0000-4000-8000-0000000000a1' }])

    const data = form({ ...ACCOUNT_FIELDS, id: '00000000-0000-4000-8000-0000000000a1', color: '#003D79' })
    data.append('logo', new File([], ''))
    const result = await updateAccount(null, data)
    expect(result.ok).toBe(true)
    const patch = written(on('accounts')[1]) as Record<string, unknown>
    expect(patch.color).toBe('#003d79')
    expect('logo' in patch).toBe(false)
  })

  it('redraws an uploaded icon and refuses one that is not a picture', async () => {
    const sharp = (await import('sharp')).default
    const png = await sharp({ create: { width: 128, height: 128, channels: 3, background: '#ee4d2d' } }).png().toBuffer()

    stub.queue(ACCOUNTS)
    stub.queue([{ id: '00000000-0000-4000-8000-0000000000a2' }])
    const data = form({ ...ACCOUNT_FIELDS, id: '00000000-0000-4000-8000-0000000000a2', name: 'GoPay', kind: 'ewallet', key: 'gopay' })
    data.append('logo', new File([new Uint8Array(png)], 'gopay.png', { type: 'image/png' }))
    expect((await updateAccount(null, data)).ok).toBe(true)
    const stored = (written(on('accounts')[1]) as Record<string, string>).logo
    expect((await sharp(Buffer.from(stored, 'base64')).metadata()).format).toBe('webp')

    stub.reset()
    const svg = form({ ...ACCOUNT_FIELDS, id: '00000000-0000-4000-8000-0000000000a2', name: 'GoPay', kind: 'ewallet', key: 'gopay' })
    svg.append('logo', new File(['<svg xmlns="http://www.w3.org/2000/svg"/>'], 'x.png', { type: 'image/png' }))
    const refused = await updateAccount(null, svg)
    expect(refused.message).toBe('Logonya belum bisa dipakai.')
    // Refused before a single query: a bad file never costs a round trip.
    expect(stub.calls).toHaveLength(0)
  })

  it('removes the icon when asked, and refuses a colour the database would', async () => {
    stub.queue(ACCOUNTS)
    stub.queue([{ id: '00000000-0000-4000-8000-0000000000a1' }])
    const data = form({ ...ACCOUNT_FIELDS, id: '00000000-0000-4000-8000-0000000000a1', removeLogo: 'on', color: '' })
    expect((await updateAccount(null, data)).ok).toBe(true)
    const patch = written(on('accounts')[1]) as Record<string, unknown>
    expect(patch.logo).toBeNull()
    expect(patch.color).toBeNull()

    const bad = await updateAccount(null, form({ ...ACCOUNT_FIELDS, id: '00000000-0000-4000-8000-0000000000a1', color: 'red' }))
    expect(bad.ok).toBe(false)
    expect(bad.detail).toBe('Warnanya ditulis seperti #003d79.')
  })

  it('lets an account be renamed freely', async () => {
    stub.queue(ACCOUNTS)
    stub.queue([{ id: '00000000-0000-4000-8000-0000000000a1' }])

    const result = await updateAccount(
      null,
      form({ ...ACCOUNT_FIELDS, id: '00000000-0000-4000-8000-0000000000a1', name: 'Rekening Gaji' }),
    )
    expect(result.ok).toBe(true)
    const patch = written(on('accounts')[1]) as Record<string, unknown>
    // The key stays put, which is the entire reason renaming is safe.
    expect(patch.name).toBe('Rekening Gaji')
    expect(patch.key).toBe('mandiri')
  })
})

describe('own money moved between accounts, on save', () => {
  const BANK_ID = '00000000-0000-4000-8000-0000000000a1'
  const GOPAY_ID = '00000000-0000-4000-8000-0000000000a2'
  const JAGO_ID = '00000000-0000-4000-8000-0000000000a5'
  const ANTAR_ACCOUNT = { id: '00000000-0000-4000-8000-0000000000c9', name: 'Antar Account', cashflow: 'transfer', sort_order: 9, archived_at: null }
  const PENYESUAIAN = { id: '00000000-0000-4000-8000-0000000000c8', name: 'Penyesuaian Income', cashflow: 'income', sort_order: 8, archived_at: null }

  /** What the backfill reads for itself: numbers live on the accounts. */
  function backfillAccounts(extra: Record<string, unknown>[] = []) {
    return [
      { id: BANK_ID, name: 'Bank Mandiri', key: 'mandiri', reference: null, own_identifiers: ['085800000001'], archived_at: null },
      { id: GOPAY_ID, name: 'GoPay', key: 'gopay', reference: null, own_identifiers: [], archived_at: null },
      ...extra,
    ]
  }

  const OWN_TOP_UP = {
    id: '00000000-0000-4000-8000-0000000000e1',
    cashflow: 'spending',
    raw_description: 'Pembayaran GoPay Customer\n085800000001',
    category_id: '00000000-0000-4000-8000-0000000000c3',
    category_locked_at: null,
    split_of: null,
  }
  const SOMEONE_ELSE = { ...OWN_TOP_UP, id: '00000000-0000-4000-8000-0000000000e2', raw_description: 'Pembayaran GoPay Customer\n08567800000' }
  const FROM_JAGO = {
    id: '00000000-0000-4000-8000-0000000000e3',
    cashflow: 'income',
    raw_description: 'Transfer BI Fast\nDari BANK JAGO\nBUDI SANTOSO 103000000001\ntransfer back',
    category_id: PENYESUAIAN.id,
    category_locked_at: null,
    split_of: null,
  }

  function saveBank(identifiers: string) {
    return updateAccount(null, form({ ...ACCOUNT_FIELDS, id: BANK_ID, ownIdentifiers: identifiers }))
  }

  it('turns old own top-ups into transfers to the wallet account, and says so', async () => {
    stub.queue(ACCOUNTS)
    stub.queue([{ id: BANK_ID }])
    stub.queue(backfillAccounts())
    stub.queue([...CATEGORIES, ANTAR_ACCOUNT])
    stub.queue([OWN_TOP_UP, SOMEONE_ELSE])
    stub.queue([{ id: OWN_TOP_UP.id }])

    const result = await saveBank('085800000001')

    expect(result.ok).toBe(true)
    expect(result.detail).toContain('1 transaksi lama dengan GoPay ternyata pindah dana')

    const [read, write] = on('transactions')
    // Only rows the import left with one side empty, and only imported ones.
    expect(read.sql).toContain("source = 'xlsx' AND deleted_at IS NULL")
    expect(read.sql.replace(/\s+/g, ' ')).toContain(
      "((cashflow = 'spending' AND to_account_id IS NULL) OR (cashflow = 'income' AND from_account_id IS NULL))",
    )
    expect(read.params).toEqual(['h1'])

    expect(written(write)).toMatchObject({
      cashflow: 'transfer',
      to_account_id: GOPAY_ID,
      category_id: ANTAR_ACCOUNT.id,
      needs_review: false,
    })
    expect(write.params).toContainEqual([OWN_TOP_UP.id])
    expect(write.params).toContain('h1')
    // Repeated on the write, so a row changed since the read is skipped.
    expect(write.sql).toMatch(/AND cashflow = \$\d+ AND "to_account_id" IS NULL/)
    expect(write.params).toContain('spending')
  })

  it('gives old income from a new own account its source, as soon as the account is created', async () => {
    stub.queue(ACCOUNTS)
    stub.queue([{ id: JAGO_ID }])
    stub.queue(backfillAccounts([{ id: JAGO_ID, name: 'Bank Jago', key: null, reference: '103000000001', own_identifiers: [], archived_at: null }]))
    stub.queue([...CATEGORIES, ANTAR_ACCOUNT, PENYESUAIAN])
    stub.queue([FROM_JAGO])
    stub.queue([{ id: FROM_JAGO.id }])

    const result = await createAccount(
      null,
      form({ ...ACCOUNT_FIELDS, name: 'Bank Jago', key: '', institution: 'Bank Jago', reference: '1030-0000-0001' }),
    )

    expect(result.ok).toBe(true)
    expect(result.detail).toContain('1 transaksi lama dengan Bank Jago ternyata pindah dana')
    // Stored as digits, however it was typed.
    expect((written(on('accounts')[1]) as Record<string, unknown>).reference).toBe('103000000001')

    const write = on('transactions')[1]
    expect(written(write)).toMatchObject({ cashflow: 'transfer', from_account_id: JAGO_ID, category_id: ANTAR_ACCOUNT.id })
    expect(write.sql).toMatch(/AND cashflow = \$\d+ AND "from_account_id" IS NULL/)
    expect(write.params).toContain('income')
  })

  it('refuses a number another account already holds', async () => {
    stub.queue(ACCOUNTS.map((account) => (account.id === GOPAY_ID ? { ...account, reference: '103000000001' } : account)))

    const result = await createAccount(
      null,
      form({ ...ACCOUNT_FIELDS, name: 'Bank Jago', key: '', reference: '103000000001' }),
    )

    expect(result.ok).toBe(false)
    expect(result.message).toBe('Nomor rekening 103000000001 sudah dipakai akun GoPay.')
    expect(on('accounts')).toHaveLength(1)
  })

  it('refuses a number that is not one, before touching anything', async () => {
    const letters = await createAccount(null, form({ ...ACCOUNT_FIELDS, name: 'Bank Jago', key: '', reference: 'rek jago' }))
    const short = await createAccount(null, form({ ...ACCOUNT_FIELDS, name: 'Bank Jago', key: '', reference: '123' }))

    expect(letters.detail).toBe('Tulis nomor rekeningnya dengan angka saja.')
    expect(short.detail).toBe('Nomor rekening biasanya 6 sampai 20 digit.')
    expect(stub.calls).toHaveLength(0)
  })

  it('does not look at transactions when there is no number to go on', async () => {
    stub.queue(ACCOUNTS)
    stub.queue([{ id: BANK_ID }])

    const result = await saveBank('')

    expect(result.ok).toBe(true)
    expect(on('transactions')).toHaveLength(0)
  })

  it('keeps the save when the backfill fails, and says what did not happen', async () => {
    stub.queue(ACCOUNTS)
    stub.queue([{ id: BANK_ID }])
    stub.queue(backfillAccounts())
    stub.queue(CATEGORIES)
    stub.queueError('boom')

    const result = await saveBank('085800000001')

    expect(result.ok).toBe(true)
    expect(result.message).toBe('Akun Bank Mandiri disimpan.')
    expect(result.detail).toContain('transaksi lama belum ikut diperbarui')
  })
})

describe('setAccountArchived', () => {
  it('lets go of the import key and says so', async () => {
    stub.queue(ACCOUNTS)
    stub.queue([{ id: '00000000-0000-4000-8000-0000000000a2' }])

    const result = await setAccountArchived(null, form({ id: '00000000-0000-4000-8000-0000000000a2', archived: '1' }))

    expect(result.ok).toBe(true)
    expect(result.detail).toContain('Kunci impornya, gopay, dilepas.')
    const patch = written(on('accounts')[1]) as Record<string, unknown>
    expect(patch.key).toBeNull()
    expect(patch.archived_at).toBeTruthy()
  })

  it('brings one back without inventing a key for it', async () => {
    stub.queue(ACCOUNTS)
    stub.queue([{ id: '00000000-0000-4000-8000-0000000000a3' }])

    const result = await setAccountArchived(null, form({ id: '00000000-0000-4000-8000-0000000000a3', archived: '0' }))
    const patch = written(on('accounts')[1]) as Record<string, unknown>
    expect(patch).toEqual({ archived_at: null })
    expect(result.detail).toContain('pasang lagi kunci impornya')
  })
})

describe('reorderAccounts', () => {
  it('writes only the rows whose place changed', async () => {
    stub.queue(ACCOUNTS)
    stub.queue([{ id: '00000000-0000-4000-8000-0000000000a2' }])
    stub.queue([{ id: '00000000-0000-4000-8000-0000000000a1' }])

    const result = await reorderAccounts(['00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000a1'])

    expect(result.ok).toBe(true)
    const writes = on('accounts').slice(1)
    expect(writes).toHaveLength(2)
    expect((written(writes[0]) as Record<string, unknown>).sort_order).toBe(1)
    expect((written(writes[1]) as Record<string, unknown>).sort_order).toBe(2)
  })

  it('refuses an order that leaves a live account out, as a stale screen would send', async () => {
    stub.queue([...ACCOUNTS, { ...ACCOUNTS[1], id: '00000000-0000-4000-8000-0000000000a4', name: 'OVO', sort_order: 4 }])

    const result = await reorderAccounts(['00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000a1'])
    expect(result.message).toBe('Urutannya tidak disimpan.')
    expect(on('accounts')).toHaveLength(1)
  })

  it('refuses an archived account, which has no place in the order', async () => {
    stub.queue(ACCOUNTS)

    const result = await reorderAccounts(['00000000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000a1'])
    expect(result.ok).toBe(false)
    expect(on('accounts')).toHaveLength(1)
  })

  it('refuses anything that is not a list of ids, before touching anything', async () => {
    const result = await reorderAccounts(['a1', 'a2'])
    expect(result.ok).toBe(false)
    expect(stub.calls).toHaveLength(0)
  })

  it('says nothing changed when the order is the same', async () => {
    stub.queue(ACCOUNTS)

    const result = await reorderAccounts(['00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a2'])
    expect(result).toEqual({ ok: true, message: 'Urutannya tidak berubah.' })
  })
})

describe('reorderCategories', () => {
  const C3 = '00000000-0000-4000-8000-0000000000c3'
  const G = '00000000-0000-4000-8000-0000000000d1'
  const M1 = '00000000-0000-4000-8000-0000000000d2'
  const M2 = '00000000-0000-4000-8000-0000000000d3'
  const TREE = [
    { id: C3, name: 'Belanja', cashflow: 'spending', parent_id: null, sort_order: 1, archived_at: null },
    { id: G, name: 'Makan & Minum', cashflow: 'spending', parent_id: null, sort_order: 2, archived_at: null },
    { id: M1, name: 'Makan/minum', cashflow: 'spending', parent_id: G, sort_order: 3, archived_at: null },
    { id: M2, name: 'Jajan', cashflow: 'spending', parent_id: G, sort_order: 4, archived_at: null },
  ]

  it('reorders the members of one group among themselves', async () => {
    stub.queue(TREE)
    stub.queue([{ id: M2 }])
    stub.queue([{ id: M1 }])

    const result = await reorderCategories([M2, M1])

    expect(result.ok).toBe(true)
    const writes = on('categories').slice(1).map((call) => written(call))
    expect(writes).toEqual([{ sort_order: 3 }, { sort_order: 4 }])
  })

  it('refuses to mix a member in among the groups', async () => {
    stub.queue(TREE)

    const result = await reorderCategories([C3, M1, G])
    expect(result.ok).toBe(false)
    expect(on('categories')).toHaveLength(1)
  })

  it('refuses categories from another cashflow in the same run', async () => {
    stub.queue([...TREE, ...CATEGORIES])

    const result = await reorderCategories([G, C3, '00000000-0000-4000-8000-0000000000c1'])
    expect(result.ok).toBe(false)
  })
})

describe('createCategory', () => {
  it('stores the hue as text and the icon by name', async () => {
    stub.queue(CATEGORIES)
    stub.queue([{ id: '00000000-0000-4000-8000-0000000000c5' }])

    const result = await createCategory(null, form({ ...CATEGORY_FIELDS, name: 'Kopi', cashflow: 'spending' }))

    expect(result.ok).toBe(true)
    const payload = written(on('categories')[1]) as Record<string, unknown>
    expect(payload.color).toBe('120')
    expect(payload.icon).toBe('PiggyBank')
    expect(payload.sort_order).toBe(5)
    expect(payload.description).toBe('Menyisihkan uang ke tabungan umum.')
  })

  it('stores a blank kamus as null rather than an empty string', async () => {
    stub.queue(CATEGORIES)
    stub.queue([{ id: '00000000-0000-4000-8000-0000000000c5' }])

    const result = await createCategory(
      null,
      form({ ...CATEGORY_FIELDS, name: 'Kopi', cashflow: 'spending', description: '   ' }),
    )

    expect(result.ok).toBe(true)
    const payload = written(on('categories')[1]) as Record<string, unknown>
    expect(payload.description).toBeNull()
  })

  it('refuses a kamus longer than one sentence has any business being', async () => {
    const result = await createCategory(
      null,
      form({ ...CATEGORY_FIELDS, description: 'x'.repeat(161) }),
    )
    expect(result.ok).toBe(false)
    expect(stub.calls).toHaveLength(0)
  })

  it('allows the same name under a different cashflow', async () => {
    stub.queue(CATEGORIES)
    stub.queue([{ id: '00000000-0000-4000-8000-0000000000c5' }])

    // Tabungan the goal is not Tabungan the savings pot, and the unique index
    // is on the pair rather than on the name.
    const result = await createCategory(
      null,
      form({ ...CATEGORY_FIELDS, name: 'Tabungan', cashflow: 'financial_goal' }),
    )
    expect(result.ok).toBe(true)
  })

  it('refuses a duplicate under the same cashflow', async () => {
    stub.queue(CATEGORIES)

    const result = await createCategory(null, form(CATEGORY_FIELDS))
    expect(result.message).toContain('Sudah ada kategori Tabungan di')
    expect(on('categories')).toHaveLength(1)
  })

  it('refuses an icon that is not in the registry', async () => {
    const result = await createCategory(null, form({ ...CATEGORY_FIELDS, icon: 'Rocket' }))
    expect(result.ok).toBe(false)
    expect(stub.calls).toHaveLength(0)
  })

  it('stores a bill with the amount it costs and the day it is due', async () => {
    stub.queue(CATEGORIES)
    stub.queue([{ id: '00000000-0000-4000-8000-0000000000c5' }])

    const result = await createCategory(
      null,
      form({ ...CATEGORY_FIELDS, name: 'Biznet', cashflow: 'bills', billAmount: '27800000', billDueDay: '5' }),
    )

    expect(result.ok).toBe(true)
    const payload = written(on('categories')[1]) as Record<string, unknown>
    expect(payload.bill_amount).toBe('27800000')
    expect(payload.bill_due_day).toBe(5)
  })

  it('stores a bill with neither half stated as nulls', async () => {
    stub.queue(CATEGORIES)
    stub.queue([{ id: '00000000-0000-4000-8000-0000000000c5' }])

    // A MoneyInput left empty posts '0', which means "not stated", not a free bill.
    const result = await createCategory(
      null,
      form({ ...CATEGORY_FIELDS, name: 'Listrik', cashflow: 'bills', billAmount: '0', billDueDay: '' }),
    )

    expect(result.ok).toBe(true)
    const payload = written(on('categories')[1]) as Record<string, unknown>
    expect(payload.bill_amount).toBeNull()
    expect(payload.bill_due_day).toBeNull()
  })

  it('drops a schedule posted for something that is not a bill', async () => {
    stub.queue(CATEGORIES)
    stub.queue([{ id: '00000000-0000-4000-8000-0000000000c5' }])

    const result = await createCategory(
      null,
      form({ ...CATEGORY_FIELDS, name: 'Kopi', cashflow: 'spending', billAmount: '5000000', billDueDay: '10' }),
    )

    expect(result.ok).toBe(true)
    const payload = written(on('categories')[1]) as Record<string, unknown>
    expect(payload.bill_amount).toBeNull()
    expect(payload.bill_due_day).toBeNull()
  })

  it.each(['0', '32', '1.5', 'lima'])('refuses %s as a due day, before touching anything', async (day) => {
    const result = await createCategory(
      null,
      form({ ...CATEGORY_FIELDS, name: 'Listrik', cashflow: 'bills', billDueDay: day }),
    )
    expect(result.ok).toBe(false)
    expect(result.fieldErrors?.billDueDay).toBe('Tanggal jatuh tempo antara 1 dan 31.')
    expect(stub.calls).toHaveLength(0)
  })
})

describe('updateCategory', () => {
  it('renames both halves of a savings pot', async () => {
    stub.queue(CATEGORIES)
    stub.queue([{ id: '00000000-0000-4000-8000-0000000000c1' }])
    stub.queue([{ id: '00000000-0000-4000-8000-0000000000c2' }])

    const result = await updateCategory(
      null,
      form({ ...CATEGORY_FIELDS, id: '00000000-0000-4000-8000-0000000000c1', name: 'Tabungan Utama' }),
    )

    expect(result.ok).toBe(true)
    expect(result.detail).toContain('Sisi pengambilannya ikut diganti nama')
    const writes = on('categories').slice(1)
    expect(writes).toHaveLength(2)
    expect((written(writes[1]) as Record<string, unknown>).name).toBe('Tabungan Utama')
    expect(writes[1].sql).toContain('WHERE id = $2 AND household_id = $3')
    expect(writes[1].params.slice(1)).toEqual(['00000000-0000-4000-8000-0000000000c2', 'h1'])
  })

  it('refuses to rename onto a name a twin already holds', async () => {
    stub.queue([...CATEGORIES, { id: '00000000-0000-4000-8000-0000000000c5', name: 'Dana Menikah', cashflow: 'from_asset', sort_order: 5, archived_at: null }])

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
    stub.queue(CATEGORIES)
    stub.queue({ n: 12 })

    const result = await updateCategory(
      null,
      form({ ...CATEGORY_FIELDS, id: '00000000-0000-4000-8000-0000000000c3', name: 'Belanja', cashflow: 'bills' }),
    )
    expect(result.message).toBe('Cashflow kategori ini sudah terkunci.')
    expect(result.detail).toContain('12 transaksi')
  })

  it('allows the cashflow to move on a category nothing uses yet', async () => {
    stub.queue(CATEGORIES)
    stub.queue({ n: 0 })
    stub.queue([{ id: '00000000-0000-4000-8000-0000000000c3' }])

    const result = await updateCategory(
      null,
      form({ ...CATEGORY_FIELDS, id: '00000000-0000-4000-8000-0000000000c3', name: 'Belanja', cashflow: 'bills' }),
    )
    expect(result.ok).toBe(true)
  })

  it('changes a bill amount and clears its due day', async () => {
    const bills = [...CATEGORIES, { id: '00000000-0000-4000-8000-0000000000c6', name: 'Internet', cashflow: 'bills', sort_order: 5, archived_at: null }]
    stub.queue(bills)
    stub.queue([{ id: '00000000-0000-4000-8000-0000000000c6' }])

    const result = await updateCategory(
      null,
      form({
        ...CATEGORY_FIELDS,
        id: '00000000-0000-4000-8000-0000000000c6',
        name: 'Internet',
        cashflow: 'bills',
        billAmount: '41600000',
        billDueDay: '',
      }),
    )

    expect(result.ok).toBe(true)
    const payload = written(on('categories')[1]) as Record<string, unknown>
    expect(payload.bill_amount).toBe('41600000')
    expect(payload.bill_due_day).toBeNull()
  })
})

describe('setCategoryArchived', () => {
  it('archives a pot together with the side money leaves it by', async () => {
    stub.queue(CATEGORIES)
    stub.queue([{ id: '00000000-0000-4000-8000-0000000000c1' }])
    stub.queue([{ id: '00000000-0000-4000-8000-0000000000c2' }])

    const result = await setCategoryArchived(null, form({ id: '00000000-0000-4000-8000-0000000000c1', archived: '1' }))

    expect(result.ok).toBe(true)
    const writes = on('categories').slice(1)
    expect(writes).toHaveLength(2)
    for (const write of writes) {
      expect(written(write).archived_at).toBeTruthy()
    }
  })

  it('leaves an ordinary category on its own', async () => {
    stub.queue(CATEGORIES)
    stub.queue([{ id: '00000000-0000-4000-8000-0000000000c3' }])

    await setCategoryArchived(null, form({ id: '00000000-0000-4000-8000-0000000000c3', archived: '1' }))
    expect(on('categories').slice(1)).toHaveLength(1)
  })
})
