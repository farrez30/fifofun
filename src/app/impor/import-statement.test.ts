import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SESSION_EXPIRED } from '@/lib/actions'
import { readXlsx } from '@/lib/xlsx'
import { ENCRYPTED_WORKBOOK, ENCRYPTED_WORKBOOK_PASSWORD } from '@/lib/xlsx/fixtures/encrypted-workbook'
import { createScopeStub } from '@/test/scope-stub'

/**
 * The failure paths that would otherwise escape the route as a bare 500:
 * `importStatement` has to answer every one of these with an `ImportReport`,
 * never let one fall through to the caller. What matters here is which stage
 * the message names and whether it tells the truth about what is already
 * saved, not the statement parsing itself, which mandiri-xlsx.test.ts
 * already covers.
 */

const stub = createScopeStub()

let userScopeImpl: () => Promise<unknown> = async () => stub.scope
vi.mock('@/db/client', () => ({ db: {} }))
vi.mock('@/lib/auth/session', () => ({ getUser: async () => null, userScope: () => userScopeImpl() }))
const revalidateTag = vi.fn()
vi.mock('next/cache', () => ({ revalidateTag: (...args: unknown[]) => revalidateTag(...args) }))

const parseMandiriStatement = vi.fn()
vi.mock('@/lib/statement/mandiri-xlsx', async (importActual) => ({
  StatementParseError: (await importActual<typeof import('@/lib/statement/mandiri-xlsx')>()).StatementParseError,
  parseMandiriStatement: (...args: unknown[]) => parseMandiriStatement(...args),
}))

const statementToLedger = vi.fn()
vi.mock('@/lib/statement/to-ledger', async (importActual) => ({
  WALLET_ACCOUNT_KEYS: (await importActual<typeof import('@/lib/statement/to-ledger')>()).WALLET_ACCOUNT_KEYS,
  statementToLedger: (...args: unknown[]) => statementToLedger(...args),
}))

vi.mock('@/lib/xlsx', () => ({ readXlsx: vi.fn(() => ({})) }))

const { importStatement } = await import('./import-statement')

const VALID_STATEMENT = {
  header: {
    periodStart: { year: 2026, month: 3, day: 1 },
    periodEnd: { year: 2026, month: 3, day: 31 },
    openingBalance: 1_000_000_00n,
    closingBalance: 1_149_000_00n,
  },
  reconciliation: { ok: true, issues: [] },
  rows: [],
}

const BANK = { id: 'acc-mandiri', name: 'Bank Mandiri', key: 'mandiri', own_identifiers: [] }

/** Every .xlsx is a ZIP; only the magic bytes matter here, the rest is mocked. */
function statementFile(bytes: number[] = [0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]): File {
  return new File([new Uint8Array(bytes)], 'statement.xlsx')
}

function formWith(file: File): FormData {
  const data = new FormData()
  data.append('statement', file)
  return data
}

beforeEach(() => {
  vi.clearAllMocks()
  stub.reset()
  userScopeImpl = async () => stub.scope
  parseMandiriStatement.mockReturnValue(VALID_STATEMENT)
  statementToLedger.mockReturnValue({
    entries: [],
    classifications: [],
    passThroughIds: [],
    review: [],
    walletCoverage: { seen: 0, matchedOwn: 0 },
  })
})

/** The four reads before anything is written: household, accounts, categories, rules. */
function lookups(accounts: unknown[] = [BANK], categories: unknown[] = []) {
  stub.queue({ id: 'h1' })
  stub.queue(accounts)
  stub.queue(categories)
  stub.queue([])
}

describe('importStatement', () => {
  it('rejects a file with no ZIP magic the same way it always has', async () => {
    const result = await importStatement(formWith(statementFile([0, 0, 0, 0])))

    expect(result).toEqual({
      ok: false,
      message: 'Berkas ini bukan .xlsx.',
      detail:
        'Sebuah .xlsx sebenarnya arsip ZIP, dan berkas ini tidak diawali penanda ZIP. Kalau yang kamu punya PDF, gunakan menu impor PDF.',
    })
    expect(parseMandiriStatement).not.toHaveBeenCalled()
  })

  it('passes the parser own sentence through, but not what the ZIP reader throws', async () => {
    const { StatementParseError } = await import('@/lib/statement/mandiri-xlsx')
    stub.queue({ id: 'h1' })
    parseMandiriStatement.mockImplementation(() => {
      throw new StatementParseError('Kolom saldo tidak ditemukan.')
    })
    const parser = await importStatement(formWith(statementFile()))

    stub.queue({ id: 'h1' })
    parseMandiriStatement.mockImplementation(() => {
      throw new Error('invalid zip data')
    })
    const zip = await importStatement(formWith(statementFile()))

    expect(parser.detail).toBe('Kolom saldo tidak ditemukan.')
    expect(zip.message).toBe('Berkasnya tidak bisa dibaca sebagai e-Statement Mandiri.')
    expect(zip.detail).not.toMatch(/zip data/)
  })

  describe('a password-protected statement', () => {
    // Synthetic; see src/lib/xlsx/encrypted.test.ts.
    const encrypted = () => new File([new Uint8Array(ENCRYPTED_WORKBOOK)], 'agustus.xlsx')

    function formWithPassword(file: File, password?: string): FormData {
      const data = formWith(file)
      if (password !== undefined) data.append('password', password)
      return data
    }

    it('asks for the password instead of calling it "not an .xlsx"', async () => {
      stub.queue({ id: 'h1' })

      const result = await importStatement(formWithPassword(encrypted()))

      expect(result).toMatchObject({
        ok: false,
        needsPassword: true,
        filename: 'agustus.xlsx',
        message: 'Berkas ini dikunci kata sandi.',
      })
      expect(readXlsx).not.toHaveBeenCalled()
    })

    it('asks again, saying so, when the password is wrong', async () => {
      stub.queue({ id: 'h1' })

      const result = await importStatement(formWithPassword(encrypted(), 'salah'))

      expect(result).toMatchObject({ ok: false, needsPassword: true, message: 'Kata sandinya belum cocok.' })
      expect(readXlsx).not.toHaveBeenCalled()
    })

    it('opens it with the right password and imports the plain workbook inside', async () => {
      lookups()
      stub.queue({ id: 'batch1' })
      stub.queue([])

      const result = await importStatement(formWithPassword(encrypted(), ENCRYPTED_WORKBOOK_PASSWORD))

      expect(result.ok).toBe(true)
      const [workbook] = vi.mocked(readXlsx).mock.calls[0] as [Uint8Array]
      expect([...workbook.subarray(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04])
    })

    it('does not spend a single hash round before the session is known', async () => {
      userScopeImpl = async () => null

      const result = await importStatement(formWithPassword(encrypted(), ENCRYPTED_WORKBOOK_PASSWORD))

      expect(result.message).toBe(SESSION_EXPIRED)
      expect(readXlsx).not.toHaveBeenCalled()
    })

    it('never echoes the password back in the report', async () => {
      stub.queue({ id: 'h1' })
      const secret = 'kata-sandi-rahasia-sekali'

      const result = await importStatement(formWithPassword(encrypted(), secret))

      expect(JSON.stringify(result)).not.toContain(secret)
    })

    it('names a legacy .xls for what it is', async () => {
      stub.queue({ id: 'h1' })
      const legacy = new Uint8Array(1024)
      legacy.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])

      const result = await importStatement(formWith(new File([legacy], 'lama.xls')))

      expect(result.message).toBe('Berkas ini format .xls lama, bukan .xlsx.')
    })
  })

  it('reports the "memeriksa sesi" stage, not a throw, when the client cannot be created', async () => {
    userScopeImpl = async () => {
      throw new Error('ECONNREFUSED')
    }

    const result = await importStatement(formWith(statementFile()))

    expect(result.ok).toBe(false)
    expect(result.message).toBe('Impor berhenti saat memeriksa sesi.')
    expect(result.detail).toBe('Belum ada yang tersimpan.')
  })

  it('reports the "mencocokkan" stage when classifying the statement throws', async () => {
    lookups()
    statementToLedger.mockImplementation(() => {
      throw new Error('unexpected shape')
    })

    const result = await importStatement(formWith(statementFile()))

    expect(result.ok).toBe(false)
    expect(result.message).toBe('Impor berhenti saat mencocokkan.')
    // The transactions table was never reached, so nothing is saved yet.
    expect(result.detail).toBe('Belum ada yang tersimpan.')
    expect(stub.calls.some((call) => call.sql.includes('public.transactions'))).toBe(false)
  })

  it('reports the "menyimpan" stage, and that data may already be there, when the write throws', async () => {
    statementToLedger.mockReturnValue({
      entries: [
        { id: 'e1', occurredAt: new Date('2026-03-02T02:00:00Z'), description: 'Kopi', amount: 50_000_00n, cashflow: 'spending', fromAccountId: 'mandiri', toAccountId: null },
      ],
      classifications: [{ kind: 'purchase' }],
      passThroughIds: [],
      review: [],
      walletCoverage: { seen: 0, matchedOwn: 0 },
    })
    parseMandiriStatement.mockReturnValue({ ...VALID_STATEMENT, rows: [{ description: 'Kopi' }] })
    lookups()
    stub.queue({ id: 'batch1' })
    // A thrown network error, not a Postgres refusal: the write itself rejects.
    const rows = stub.scope.rows
    stub.scope.rows = async (q) => {
      const result = await rows(q)
      if (stub.calls.at(-1)?.sql.includes('INSERT INTO public.transactions')) throw new Error('stream cut off')
      return result as never
    }

    const result = await importStatement(formWith(statementFile())).finally(() => {
      stub.scope.rows = rows
    })

    expect(result.ok).toBe(false)
    expect(result.message).toBe('Impor berhenti saat menyimpan.')
    expect(result.detail).toMatch(/mungkin sudah tersimpan/)
  })

  it('still saves normally when nothing throws', async () => {
    lookups()
    stub.queue({ id: 'batch1' })
    stub.queue([])

    const result = await importStatement(formWith(statementFile()))

    expect(result.ok).toBe(true)
    expect(result.message).toBe('0 transaksi masuk, dan saldonya cocok sampai ke sen terakhir.')
    // Expired outright: the form refreshes straight after, and a stale ledger
    // there would read as an import that saved nothing.
    expect(revalidateTag.mock.calls).toEqual([
      ['tx:h1', { expire: 0 }],
      ['imports:h1', { expire: 0 }],
      ['rules:h1', { expire: 0 }],
    ])
  })

  it('files an own top-up to a wallet with no account as spending, not under a transfer category', async () => {
    parseMandiriStatement.mockReturnValue({
      ...VALID_STATEMENT,
      rows: [{ description: 'Pembayaran GoPay Customer\n085800000001' }],
    })
    statementToLedger.mockReturnValue({
      entries: [
        {
          id: 'e1',
          occurredAt: new Date('2026-03-02T02:00:00Z'),
          description: 'GoPay',
          amount: 50_000_00n,
          cashflow: 'transfer',
          fromAccountId: 'mandiri',
          toAccountId: 'gopay',
        },
      ],
      classifications: [{ kind: 'wallet-topup' }],
      passThroughIds: [],
      review: [],
      walletCoverage: { seen: 1, matchedOwn: 1 },
    })
    // No GoPay account, so the transfer has nowhere to land.
    lookups([BANK], [{ id: 'cat-antar', name: 'Antar Account', cashflow: 'transfer' }])
    stub.queue({ id: 'batch1' })
    stub.queue([])

    await importStatement(formWith(statementFile()))

    const insert = stub.calls.find((call) => call.sql.includes('INSERT INTO public.transactions'))
    expect(insert?.sql).toContain('ON CONFLICT (household_id, dedupe_key) DO NOTHING')
    const [written] = JSON.parse(String(insert?.params[0])) as Record<string, unknown>[]
    expect(written).toMatchObject({
      household_id: 'h1',
      import_batch_id: 'batch1',
      cashflow: 'spending',
      category_id: null,
      needs_review: true,
    })
  })

  it('says the write was refused, not that data may be there, when Postgres refuses it', async () => {
    statementToLedger.mockReturnValue({
      entries: [
        { id: 'e1', occurredAt: new Date('2026-03-02T02:00:00Z'), description: 'Kopi', amount: 50_000_00n, cashflow: 'spending', fromAccountId: 'mandiri', toAccountId: null },
      ],
      classifications: [{ kind: 'purchase' }],
      passThroughIds: [],
      review: [],
      walletCoverage: { seen: 0, matchedOwn: 0 },
    })
    parseMandiriStatement.mockReturnValue({ ...VALID_STATEMENT, rows: [{ description: 'Kopi' }] })
    lookups()
    stub.queue({ id: 'batch1' })
    stub.queueError('new row violates check constraint "transactions_account_sides"', '23514')
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await importStatement(formWith(statementFile()))

    expect(result.message).toBe('Transaksinya gagal disimpan.')
    expect(JSON.stringify(result)).not.toContain('transactions_account_sides')
    spy.mockRestore()
  })

  it('says a statement uploaded twice changes nothing', async () => {
    lookups()
    stub.queueError('duplicate key value violates unique constraint', '23505')

    const result = await importStatement(formWith(statementFile()))

    expect(result).toMatchObject({ ok: true, message: 'Berkas ini sudah pernah diimpor.' })
    const batch = stub.calls.at(-1)
    expect(batch?.sql).toContain('INSERT INTO "public"."import_batches"')
    expect(batch?.params[0]).toBe('h1')
  })

  it('scopes every lookup to the household', async () => {
    lookups()
    stub.queue({ id: 'batch1' })
    stub.queue([])

    await importStatement(formWith(statementFile()))

    for (const call of stub.calls.slice(1, 4)) expect(call.params).toEqual(['h1'])
    expect(stub.calls[1].sql).toContain('archived_at IS NULL')
    expect(stub.calls[3].sql).toContain('auto_apply = true')
  })

  it('leaves the cache alone when nothing was saved', async () => {
    userScopeImpl = async () => {
      throw new Error('ECONNREFUSED')
    }

    await importStatement(formWith(statementFile()))

    expect(revalidateTag).not.toHaveBeenCalled()
  })
})
