import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * src/db/query.ts against a real, migrated Postgres. The unit tests stub the
 * Scope away, so this is the only place the driver, drizzle and the RLS wiring
 * meet: a driver or ORM upgrade that changes how bigint, timestamptz or array
 * parameters cross the wire fails here instead of in somebody's ledger.
 *
 *   pnpm test:db   (DATABASE_URL on localhost, after db:migrate; see ci.yml)
 *
 * Expected values are written out by hand, not computed with the code under
 * test. Every test makes its own rows inside its own household; afterAll
 * deletes them, so a local database survives repeated runs.
 */

const url = process.env.DATABASE_POOL_URL ?? process.env.DATABASE_URL ?? ''
const host = url ? new URL(url).hostname : ''
// This file writes. It must never get near Neon, whatever .env says.
if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
  throw new Error(`query.db.test.ts only runs against a local database, not "${host || 'unset'}"`)
}

// Imported after the guard: client.ts reads the URL when the module loads.
const { asService, asUser, dbMessage, insertInto, setClause, sql } = await import('./query')

const INT4_MAX = 2_147_483_647
const run = randomUUID().slice(0, 8)
let userA = ''
let userB = ''
let homeA = ''
let homeB = ''
let accountA = ''

beforeAll(async () => {
  const users = await asService.rows<{ id: string }>(sql`
    INSERT INTO auth.users (name, email)
    VALUES ('A', ${`db-test-a-${run}@contoh.test`}), ('B', ${`db-test-b-${run}@contoh.test`})
    RETURNING id`)
  userA = users[0]!.id
  userB = users[1]!.id
  homeA = (await asService.one<{ id: string }>(insertInto('households', { name: `Rumah A ${run}` }))).id
  homeB = (await asService.one<{ id: string }>(insertInto('households', { name: `Rumah B ${run}` }))).id
  await asService.rows(sql`
    INSERT INTO public.household_members (household_id, user_id, role)
    VALUES (${homeA}, ${userA}, 'owner'), (${homeB}, ${userB}, 'owner')`)
  accountA = (await asService.one<{ id: string }>(insertInto('accounts', { household_id: homeA, name: 'BCA', kind: 'bank' }))).id
})

afterAll(async () => {
  const homes = [homeA, homeB].filter(Boolean)
  if (homes.length > 0) {
    // transactions → accounts is ON DELETE RESTRICT, so they go first.
    await asService.rows(sql`DELETE FROM public.transactions WHERE household_id = ANY(${sql.param(homes)}::uuid[])`)
    await asService.rows(sql`DELETE FROM public.households WHERE id = ANY(${sql.param(homes)}::uuid[])`)
  }
  await asService.rows(sql`DELETE FROM auth.users WHERE email LIKE ${`db-test-%-${run}@contoh.test`}`)
})

function spend(amount: number, occurred_at = '2026-01-15T10:00:00+07:00', description = 'tes') {
  return insertInto('transactions', {
    household_id: homeA,
    occurred_at,
    description,
    amount,
    cashflow: 'spending',
    source: 'manual',
    from_account_id: accountA,
  })
}

describe('bigint', () => {
  it.each([
    ['int4 max', INT4_MAX],
    ['int4 max + 1', 2_147_483_648],
    ['Rp100 miliar in sen', 10_000_000_000_000],
    ['Number.MAX_SAFE_INTEGER', 9_007_199_254_740_991],
  ])('round-trips %s as an exact number', async (_, amount) => {
    const row = await asService.one<{ amount: unknown }>(spend(amount))
    expect(row.amount).toBe(amount)
  })

  it('keeps a negative value below int4 min', async () => {
    const row = await asService.one<{ opening_balance: unknown }>(
      insertInto('accounts', { household_id: homeA, name: `Utang ${run}`, kind: 'bank', opening_balance: -2_147_483_649 }),
    )
    expect(row.opening_balance).toBe(-2_147_483_649)
  })

  it('updates through setClause past int4', async () => {
    const { id } = await asService.one<{ id: string }>(spend(1))
    const row = await asService.one<{ amount: unknown }>(
      sql`UPDATE public.transactions SET ${setClause({ amount: 3_000_000_000_000 })} WHERE id = ${id} RETURNING amount`,
    )
    expect(row.amount).toBe(3_000_000_000_000)
  })

  it('returns sum() over bigint (numeric) as a number, not a string', async () => {
    const tag = `sum-${randomUUID()}`
    await asService.rows(spend(2_147_483_648, undefined, tag))
    await asService.rows(spend(2_147_483_648, undefined, tag))
    const row = await asService.one<{ total: unknown }>(
      sql`SELECT sum(amount) AS total FROM public.transactions WHERE description = ${tag}`,
    )
    expect(row.total).toBe(4_294_967_296)
  })
})

describe('timestamptz', () => {
  it('comes back as a UTC ISO string whatever offset went in', async () => {
    const row = await asService.one<{ occurred_at: unknown }>(spend(1, '2026-01-01T00:00:00+07:00'))
    expect(row.occurred_at).toBe('2025-12-31T17:00:00.000Z')
  })

  it('keeps milliseconds', async () => {
    const row = await asService.one<{ occurred_at: unknown }>(spend(1, '2026-03-01T08:15:30.123Z'))
    expect(row.occurred_at).toBe('2026-03-01T08:15:30.123Z')
  })

  it('filters a WIB month boundary: the instant itself is in, one millisecond before is out', async () => {
    const tag = `batas-${randomUUID()}`
    await asService.rows(spend(1, '2026-01-31T23:59:59.999+07:00', tag))
    await asService.rows(spend(2, '2026-02-01T00:00:00+07:00', tag))
    await asService.rows(spend(3, '2026-02-01T00:00:00.001+07:00', tag))
    const rows = await asService.rows<{ amount: number }>(sql`
      SELECT amount FROM public.transactions
      WHERE description = ${tag} AND occurred_at >= ${'2026-02-01T00:00:00+07:00'}
      ORDER BY amount`)
    expect(rows.map((r) => r.amount)).toEqual([2, 3])
  })

  // drizzle's postgres-js driver passes timestamptz through untouched, so a Date
  // reaches the wire unserialised: postgres 4 throws, postgres 3.4.9 sent
  // Date#toString() and Postgres rejected it. The app always sends
  // toISOString(). If an upgrade makes Date work, this fails on purpose, so the
  // rule can be relaxed knowingly rather than by accident.
  it('refuses a Date parameter; timestamps go in as ISO strings', async () => {
    const err = await asService
      .rows(sql`SELECT now() >= ${new Date('2026-04-30T17:00:00.000Z')} AS ok`)
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(Error)
  })
})

describe('arrays through sql.param', () => {
  async function ids(n: number): Promise<string[]> {
    const out: string[] = []
    for (let i = 0; i < n; i++) out.push((await asService.one<{ id: string }>(spend(i + 1))).id)
    return out
  }
  const pick = (list: string[]) =>
    asService.rows<{ id: string }>(sql`SELECT id FROM public.transactions WHERE id = ANY(${sql.param(list)}::uuid[]) ORDER BY amount`)

  it('matches nothing for an empty uuid[] instead of failing', async () => {
    expect(await pick([])).toEqual([])
  })

  it('matches exactly one id', async () => {
    const [one] = await ids(1)
    expect((await pick([one!])).map((r) => r.id)).toEqual([one])
  })

  it('matches several ids and ignores one that does not exist', async () => {
    const list = await ids(3)
    const rows = await pick([...list, randomUUID()])
    expect(rows.map((r) => r.id)).toEqual(list)
  })

  it('stores a text[] given as a plain array in insertInto', async () => {
    const row = await asService.one<{ own_identifiers: unknown }>(
      insertInto('accounts', { household_id: homeA, name: `Arr ${run}`, kind: 'bank', own_identifiers: ['1234', "o'neil", 'a,b'] }),
    )
    expect(row.own_identifiers).toEqual(['1234', "o'neil", 'a,b'])
  })
})

describe('tx', () => {
  const count = async (tag: string) =>
    (await asService.one<{ n: number }>(sql`SELECT count(*)::int AS n FROM public.transactions WHERE description = ${tag}`)).n

  it('rolls back every statement when the callback throws, and rethrows that error', async () => {
    const tag = `rb-${randomUUID()}`
    const boom = new Error('boom')
    await expect(
      asService.tx(async (s) => {
        await s.rows(spend(1, undefined, tag))
        await s.rows(spend(2, undefined, tag))
        throw boom
      }),
    ).rejects.toBe(boom)
    expect(await count(tag)).toBe(0)
  })

  it('rolls back an earlier insert when a later statement breaks a constraint', async () => {
    const tag = `ck-${randomUUID()}`
    const err = await asService
      .tx(async (s) => {
        await s.rows(spend(1, undefined, tag))
        await s.rows(spend(0, undefined, tag)) // transactions_amount_positive
      })
      .catch((e: unknown) => e)
    expect((err as { code?: string }).code).toBe('23514')
    expect(await count(tag)).toBe(0)
  })

  it('commits when the callback returns', async () => {
    const tag = `ok-${randomUUID()}`
    const out = await asService.tx(async (s) => {
      await s.rows(spend(1, undefined, tag))
      return 'selesai'
    })
    expect(out).toBe('selesai')
    expect(await count(tag)).toBe(1)
  })

  it('gives a form the Postgres message, never the SQL and its parameters', async () => {
    const err = await asService.rows(spend(0, undefined, 'rahasia-param')).catch((e: unknown) => e)
    const msg = dbMessage(err)
    expect(msg).toContain('transactions_amount_positive')
    expect(msg).not.toContain('Failed query')
    expect(msg).not.toContain('rahasia-param')
  })
})

describe('RLS through asUser', () => {
  it('shows a member only their own household', async () => {
    const homes = await asUser(userA).rows<{ id: string }>(
      sql`SELECT id FROM public.households WHERE id = ANY(${sql.param([homeA, homeB])}::uuid[])`,
    )
    expect(homes.map((h) => h.id)).toEqual([homeA])
  })

  it("does not show another household's accounts", async () => {
    await asService.rows(insertInto('accounts', { household_id: homeB, name: `Rahasia B ${run}`, kind: 'bank' }))
    const rows = await asUser(userA).rows<{ household_id: string }>(
      sql`SELECT household_id FROM public.accounts WHERE household_id = ANY(${sql.param([homeA, homeB])}::uuid[])`,
    )
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.filter((r) => r.household_id !== homeA)).toEqual([])
  })

  it("refuses an insert into another household's accounts with 42501", async () => {
    const err = await asUser(userA)
      .rows(insertInto('accounts', { household_id: homeB, name: 'curi', kind: 'bank' }))
      .catch((e: unknown) => e)
    expect((err as { code?: string }).code).toBe('42501')
  })

  it("updates zero rows of another household's transactions", async () => {
    const { id } = await asService.one<{ id: string }>(
      insertInto('transactions', {
        household_id: homeB,
        occurred_at: '2026-01-15T10:00:00+07:00',
        description: 'milik B',
        amount: 5,
        cashflow: 'income',
        source: 'manual',
        to_account_id: (await asService.one<{ id: string }>(insertInto('accounts', { household_id: homeB, name: 'BCA B', kind: 'bank' }))).id,
      }),
    )
    const changed = await asUser(userA).rows(sql`UPDATE public.transactions SET amount = 1 WHERE id = ${id} RETURNING id`)
    expect(changed).toEqual([])
    expect((await asService.one<{ amount: number }>(sql`SELECT amount FROM public.transactions WHERE id = ${id}`)).amount).toBe(5)
  })

  it('keeps the identity for every statement inside tx', async () => {
    const seen = await asUser(userB).tx(async (s) => {
      const first = await s.one<{ uid: string }>(sql`SELECT auth.uid() AS uid`)
      const homes = await s.rows<{ id: string }>(sql`SELECT id FROM public.households WHERE id = ANY(${sql.param([homeA, homeB])}::uuid[])`)
      return { uid: first.uid, homes: homes.map((h) => h.id) }
    })
    expect(seen).toEqual({ uid: userB, homes: [homeB] })
  })

  it('does not leak the identity to the next query on the pool', async () => {
    await asUser(userA).rows(sql`SELECT 1`)
    const row = await asService.one<{ uid: string | null; role: string }>(sql`SELECT auth.uid() AS uid, current_user AS role`)
    expect(row.uid).toBeNull()
    expect(row.role).not.toBe('authenticated')
  })

  it('rejects a malformed user id before any query', () => {
    expect(() => asUser("x' OR '1'='1")).toThrow(/not a user id/)
  })
})
