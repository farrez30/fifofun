import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSupabaseStub } from '@/test/supabase-stub'

/**
 * The failure paths `useOffline` (next.config.ts) turns into an endless
 * replay if they escape as a throw instead of a report: `importStatement`
 * has to answer every one of these with an `ImportReport`, never let one
 * fall through to the caller. What matters here is which stage the message
 * names and whether it tells the truth about what is already saved, not the
 * statement parsing itself, which mandiri-xlsx.test.ts already covers.
 */

const stub = createSupabaseStub()
const stubFrom = stub.client.from

let createClientImpl: () => Promise<unknown> = async () => stub.client
vi.mock('@/lib/supabase/server', () => ({ createClient: () => createClientImpl() }))
vi.mock('next/cache', () => ({ updateTag: vi.fn() }))

const parseMandiriStatement = vi.fn()
vi.mock('@/lib/statement/mandiri-xlsx', () => ({
  parseMandiriStatement: (...args: unknown[]) => parseMandiriStatement(...args),
}))

const statementToLedger = vi.fn()
vi.mock('@/lib/statement/to-ledger', () => ({
  statementToLedger: (...args: unknown[]) => statementToLedger(...args),
}))

vi.mock('@/lib/xlsx', () => ({ readXlsx: vi.fn(() => ({})) }))

const { importStatement } = await import('./actions')

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
  stub.setUser({ id: 'u1' })
  createClientImpl = async () => stub.client
  stub.client.from = stubFrom
  parseMandiriStatement.mockReturnValue(VALID_STATEMENT)
  statementToLedger.mockReturnValue({
    entries: [],
    classifications: [],
    passThroughIds: [],
    review: [],
    walletCoverage: { seen: 0, matchedOwn: 0 },
  })
})

describe('importStatement', () => {
  it('rejects a file with no ZIP magic the same way it always has', async () => {
    const result = await importStatement(null, formWith(statementFile([0, 0, 0, 0])))

    expect(result).toEqual({
      ok: false,
      message: 'Berkas ini bukan .xlsx.',
      detail:
        'Sebuah .xlsx sebenarnya arsip ZIP, dan berkas ini tidak diawali penanda ZIP. Kalau yang kamu punya PDF, gunakan menu impor PDF.',
    })
    expect(parseMandiriStatement).not.toHaveBeenCalled()
  })

  it('reports the "memeriksa sesi" stage, not a throw, when the client cannot be created', async () => {
    createClientImpl = async () => {
      throw new Error('ECONNREFUSED')
    }

    const result = await importStatement(null, formWith(statementFile()))

    expect(result.ok).toBe(false)
    expect(result.message).toBe('Impor berhenti saat memeriksa sesi.')
    expect(result.detail).toBe('Belum ada yang tersimpan.')
  })

  it('reports the "mencocokkan" stage when classifying the statement throws', async () => {
    stub.queue('households', { data: { id: 'h1' } })
    stub.queue('accounts', { data: [BANK] })
    stub.queue('categories', { data: [] })
    stub.queue('categorization_rules', { data: [] })
    statementToLedger.mockImplementation(() => {
      throw new Error('unexpected shape')
    })

    const result = await importStatement(null, formWith(statementFile()))

    expect(result.ok).toBe(false)
    expect(result.message).toBe('Impor berhenti saat mencocokkan.')
    // The transactions table was never reached, so nothing is saved yet.
    expect(result.detail).toBe('Belum ada yang tersimpan.')
    expect(stub.callsOn('transactions')).toHaveLength(0)
  })

  it('reports the "menyimpan" stage, and that data may already be there, when the write throws', async () => {
    stub.queue('households', { data: { id: 'h1' } })
    stub.queue('accounts', { data: [BANK] })
    stub.queue('categories', { data: [] })
    stub.queue('categorization_rules', { data: [] })
    stub.queue('import_batches', { data: { id: 'batch1' } })
    // The stub always resolves; a thrown network error is simulated by
    // having the next call on `transactions` reject instead of settling.
    stub.client.from = ((table: string) => {
      if (table === 'transactions') {
        return {
          upsert: () => ({
            select: () => Promise.reject(new Error('stream cut off')),
          }),
        }
      }
      return stubFrom(table)
    }) as typeof stub.client.from

    const result = await importStatement(null, formWith(statementFile()))

    expect(result.ok).toBe(false)
    expect(result.message).toBe('Impor berhenti saat menyimpan.')
    expect(result.detail).toMatch(/mungkin sudah tersimpan/)
  })

  it('still saves normally when nothing throws', async () => {
    stub.queue('households', { data: { id: 'h1' } })
    stub.queue('accounts', { data: [BANK] })
    stub.queue('categories', { data: [] })
    stub.queue('categorization_rules', { data: [] })
    stub.queue('import_batches', { data: { id: 'batch1' } })
    stub.queue('transactions', { data: [] })

    const result = await importStatement(null, formWith(statementFile()))

    expect(result.ok).toBe(true)
    expect(result.message).toBe('0 transaksi masuk, dan saldonya cocok sampai ke sen terakhir.')
  })
})
