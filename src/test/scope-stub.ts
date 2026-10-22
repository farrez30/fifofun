import type { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { Scope } from '@/db/query'

/**
 * A stand-in for a query Scope (src/db/query.ts), for testing server actions.
 * Replaces the old Supabase stub, with the same idea: every action is a
 * sequence of small queries whose order and scoping is the thing worth
 * asserting (the household id on every write, a category re-read rather than
 * trusted from the form, a refusal detected), so the stub records each
 * statement and hands back queued answers, without a database.
 *
 * Each call is recorded as the SQL text drizzle would send plus its bound
 * params, so a test can assert on both: `expect(stub.calls[0].sql).toContain(
 * 'household_id')` and `expect(stub.calls[0].params).toContain(householdId)`.
 * Answers are consumed in call order; a test that queues nothing gets [] (no
 * rows), the same as a query RLS filtered to nothing.
 */

export interface RecordedCall {
  sql: string
  params: unknown[]
  /** Which Scope method ran it: rows, maybeOne or one. */
  method: 'rows' | 'maybeOne' | 'one'
}

/** An answer for the next call: rows, or an error to throw. */
export type StubAnswer = { rows: unknown[] } | { error: { message: string; code?: string } }

export interface ScopeStub {
  scope: Scope
  calls: RecordedCall[]
  /** Queue rows (or one row) for the next call. */
  queue(rows: unknown[] | Record<string, unknown> | null): void
  /** Queue a Postgres-like error for the next call. */
  queueError(message: string, code?: string): void
  reset(): void
}

const dialect = new PgDialect()

export function createScopeStub(userId: string | null = 'u1'): ScopeStub {
  const calls: RecordedCall[] = []
  const answers: StubAnswer[] = []

  const next = (q: SQL, method: RecordedCall['method']): unknown[] => {
    const { sql, params } = dialect.sqlToQuery(q)
    calls.push({ sql, params, method })
    const a = answers.shift()
    if (!a) return []
    if ('error' in a) throw Object.assign(new Error(a.error.message), { code: a.error.code })
    return a.rows
  }

  const scope: Scope = {
    userId,
    rows: async <T>(q: SQL) => next(q, 'rows') as T[],
    maybeOne: async <T>(q: SQL) => (next(q, 'maybeOne')[0] as T | undefined) ?? null,
    one: async <T>(q: SQL, what = 'query') => {
      const rows = next(q, 'one')
      if (rows.length !== 1) throw new Error(`[${what}] expected 1 row, got ${rows.length}`)
      return rows[0] as T
    },
    tx: async (fn) => fn(scope),
  }

  return {
    scope,
    calls,
    queue(rows) {
      answers.push({ rows: rows === null ? [] : Array.isArray(rows) ? rows : [rows] })
    },
    queueError(message, code) {
      answers.push({ error: { message, code } })
    },
    reset() {
      calls.length = 0
      answers.length = 0
    },
  }
}
