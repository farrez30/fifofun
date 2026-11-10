import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createScopeStub } from '@/test/scope-stub'
import { monthBounds, resetRateLimit, tokenMatches } from '@/lib/agregat'

/**
 * Like the Telegram tests, these are about the gates. The route reads the
 * ledger as the database owner with no signed-in user, so the questions are:
 * can anything without the token read a figure, can a token read a different
 * household, and does anything beyond one total per category ever leave?
 */

const TOKEN = 'token-uji-agregat_0123456789abcdef'
const HASH = createHash('sha256').update(TOKEN).digest('hex')
const HOUSEHOLD = '11111111-2222-3333-4444-555555555555'

const stub = createScopeStub(null)
vi.mock('@/db/client', () => ({ db: {} }))
vi.mock('@/db/query', async (importActual) => ({
  ...(await importActual<typeof import('@/db/query')>()),
  asService: stub.scope,
}))

const { GET } = await import('./route')

let ip = 0
function request(bulan: string | null = '2026-11', token: string | null = TOKEN, query = ''): Request {
  const url = `https://example.test/api/agregat/pemasukan${bulan === null ? '' : `?bulan=${bulan}`}${query}`
  return new Request(url, {
    headers: {
      // A fresh address per request, so the rate limit only bites in the test about it.
      'x-forwarded-for': `10.0.0.${++ip % 250}`,
      ...(token === null ? {} : { authorization: `Bearer ${token}` }),
    },
  })
}

beforeEach(() => {
  stub.reset()
  resetRateLimit()
  vi.stubEnv('AGREGAT_TOKEN_SHA256', HASH)
  vi.stubEnv('AGREGAT_HOUSEHOLD_ID', HOUSEHOLD)
})
afterEach(() => {
  vi.unstubAllEnvs()
})

describe('gates', () => {
  it('refuses a missing, wrong, or malformed token without touching the database', async () => {
    for (const token of [null, 'salah-salah-salah-salah-salah', `${TOKEN}x`, 'pendek']) {
      expect((await GET(request('2026-11', token))).status).toBe(401)
    }
    expect(stub.calls).toHaveLength(0)
  })

  it('refuses every token when the hash is not configured or not a sha256', async () => {
    vi.stubEnv('AGREGAT_TOKEN_SHA256', '')
    expect((await GET(request())).status).toBe(401)
    vi.stubEnv('AGREGAT_TOKEN_SHA256', TOKEN)
    expect((await GET(request())).status).toBe(401)
    expect(stub.calls).toHaveLength(0)
  })

  it('reads only the configured household, whatever the request says', async () => {
    stub.queue([])
    const res = await GET(request('2026-11', TOKEN, '&household_id=99999999-0000-0000-0000-000000000000'))
    expect(res.status).toBe(200)
    expect(stub.calls).toHaveLength(1)
    expect(stub.calls[0].params).toContain(HOUSEHOLD)
    expect(stub.calls[0].params).not.toContain('99999999-0000-0000-0000-000000000000')
  })

  it('answers 503 rather than reading anything when the household is not configured', async () => {
    vi.stubEnv('AGREGAT_HOUSEHOLD_ID', '')
    expect((await GET(request())).status).toBe(503)
    expect(stub.calls).toHaveLength(0)
  })

  it('rate limits one caller after 30 requests a minute', async () => {
    const same = () =>
      new Request('https://example.test/api/agregat/pemasukan?bulan=2026-11', {
        headers: { 'x-forwarded-for': '203.0.113.9', authorization: `Bearer ${TOKEN}` },
      })
    for (let i = 0; i < 30; i++) expect((await GET(same())).status).toBe(200)
    expect((await GET(same())).status).toBe(429)
  })
})

describe('what is read and what leaves', () => {
  it('sums income only, skipping deleted rows and pass-through money, within the Jakarta month', async () => {
    stub.queue([])
    await GET(request('2026-11'))
    const q = stub.calls[0].sql.replace(/\s+/g, ' ')
    expect(q).toContain("t.cashflow = 'income'")
    expect(q).toContain('t.deleted_at IS NULL')
    expect(q).toContain('t.is_pass_through = false')
    expect(q).toContain('GROUP BY c.name')
    expect(stub.calls[0].params).toContain('2026-10-31T17:00:00.000Z')
    expect(stub.calls[0].params).toContain('2026-11-30T17:00:00.000Z')
  })

  it('returns one total per category as sen strings, and nothing else', async () => {
    stub.queue([
      { kategori: 'Gaji', total: '875000000' },
      { kategori: 'Freelance', total: '123456789012345678' },
      { kategori: null, total: '5000' },
    ])
    const res = await GET(request('2026-11'))
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.json()).toEqual({
      bulan: '2026-11',
      perKategori: { Gaji: '875000000', Freelance: '123456789012345678', 'Tanpa kategori': '5000' },
    })
  })

  it('rejects a month that is not YYYY-MM before reading', async () => {
    for (const bulan of [null, '2026-13', '2026-00', '2026-1', 'abc', '1999-12', "2026-11' OR 1=1"]) {
      expect((await GET(request(bulan))).status, String(bulan)).toBe(400)
    }
    expect(stub.calls).toHaveLength(0)
  })

  it('a database error answers 500 without its message', async () => {
    stub.queueError('relation "transactions" ... detail with 875000000', '42P01')
    const res = await GET(request('2026-11'))
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('875000000')
  })
})

describe('monthBounds', () => {
  it('is midnight Jakarta at both ends, across a year end', () => {
    expect(monthBounds('2026-12')).toEqual({
      start: new Date('2026-11-30T17:00:00.000Z'),
      end: new Date('2026-12-31T17:00:00.000Z'),
    })
    expect(monthBounds('2026-02')?.end).toEqual(new Date('2026-02-28T17:00:00.000Z'))
  })
})

describe('tokenMatches', () => {
  it('needs the Bearer scheme and a token-shaped value', () => {
    expect(tokenMatches(`Bearer ${TOKEN}`, HASH)).toBe(true)
    expect(tokenMatches(TOKEN, HASH)).toBe(false)
    expect(tokenMatches(`bearer ${TOKEN}`, HASH)).toBe(false)
    expect(tokenMatches(`Bearer ${TOKEN} `, HASH)).toBe(false)
    expect(tokenMatches(null, HASH)).toBe(false)
    expect(tokenMatches(`Bearer ${TOKEN}`, HASH.toUpperCase())).toBe(false)
  })
})
