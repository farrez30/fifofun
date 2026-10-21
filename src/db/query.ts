import { type SQL, sql } from 'drizzle-orm'
import { db } from './client'

/**
 * Query scopes: the replacement for the Supabase clients.
 *
 *   asUser(userId)  what createClient() was: RLS applies, auth.uid() = userId.
 *   asService       what the secret-key client was: the owner, RLS bypassed.
 *
 * Every method takes a drizzle `sql` template, so values are always bound
 * parameters. Rows come back in the shape PostgREST returned, which is what the
 * code reading them was written against:
 *   - column names exactly as in SQL (snake_case), no camelCase mapping;
 *   - timestamptz as ISO strings;
 *   - bigint and numeric as numbers. The client parses int8 to BigInt (see
 *     client.ts); PostgREST sent numbers, BigInt cannot cross into a client
 *     component, and every amount here is sen well inside 2^53;
 *   - date as "YYYY-MM-DD", jsonb parsed, arrays as arrays.
 *
 * Errors throw, and they are the Postgres error itself: drizzle's wrapper says
 * "Failed query: <SQL> params: <values>", and that must never reach a form.
 *
 * Each call outside tx() is its own short transaction, so Promise.all over
 * several queries still runs them in parallel on separate pooled connections.
 */

export type Row = Record<string, unknown>

type Runner = { execute: (q: SQL) => Promise<unknown> }
type AnyTx = Parameters<Parameters<typeof db.transaction>[0]>[0]
type Column = { name: string; type: number }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TIMESTAMP = new Set([1114, 1184])
const NUMBER = new Set([20, 1700])

/** Bring one driver row to the PostgREST shape. Exported for the tests. */
export function normalise(row: Row, columns: readonly Column[] | undefined): Row {
  for (const [k, v] of Object.entries(row)) {
    if (typeof v === 'bigint') row[k] = Number(v)
  }
  if (!columns) return row
  for (const c of columns) {
    const v = row[c.name]
    if (v === null || v === undefined) continue
    if (TIMESTAMP.has(c.type) && typeof v === 'string') row[c.name] = new Date(v).toISOString()
    else if (NUMBER.has(c.type) && typeof v === 'string') row[c.name] = Number(v)
  }
  return row
}

function unwrap(e: unknown): unknown {
  return e instanceof Error && e.cause instanceof Error ? e.cause : e
}

/** The message safe to show a user for any error thrown by this module. */
export function dbMessage(err: unknown): string {
  const e = unwrap(err)
  return e instanceof Error ? e.message : String(e)
}

async function run<T>(r: Runner, q: SQL): Promise<T[]> {
  let res: Row[] & { columns?: Column[] }
  try {
    res = (await r.execute(q)) as Row[] & { columns?: Column[] }
  } catch (e) {
    throw unwrap(e)
  }
  const cols = res.columns
  return Array.from(res, (row) => normalise(row, cols) as T)
}

export interface Scope {
  rows<T = Row>(q: SQL): Promise<T[]>
  /** First row or null. The `.maybeSingle()` of the Supabase client. */
  maybeOne<T = Row>(q: SQL): Promise<T | null>
  /** Exactly one row, or throws naming `what`. The `.single()`. */
  one<T = Row>(q: SQL, what?: string): Promise<T>
  /** Statements in one transaction, under the same identity. */
  tx<T>(fn: (s: Scope) => Promise<T>): Promise<T>
  /** The id auth.uid() returns inside this scope; null for asService. */
  readonly userId: string | null
}

function scope(userId: string | null, begin: (tx: AnyTx) => Promise<void>, inside?: AnyTx): Scope {
  const transaction = <T>(fn: (tx: AnyTx) => Promise<T>): Promise<T> =>
    db
      .transaction(async (tx) => {
        await begin(tx)
        return fn(tx)
      })
      .catch((e) => {
        throw unwrap(e)
      })
  const within = <T>(fn: (r: Runner) => Promise<T>): Promise<T> => (inside ? fn(inside) : transaction(fn))
  const self: Scope = {
    userId,
    rows: <T>(q: SQL) => within((r) => run<T>(r, q)),
    maybeOne: async <T>(q: SQL) => (await self.rows<T>(q))[0] ?? null,
    one: async <T>(q: SQL, what = 'query') => {
      const rows = await self.rows<T>(q)
      const first = rows[0]
      if (rows.length !== 1 || first === undefined) {
        throw new Error(`[${what}] expected 1 row, got ${rows.length}`)
      }
      return first
    },
    tx: (fn) => (inside ? fn(self) : transaction((tx) => fn(scope(userId, begin, tx)))),
  }
  return self
}

export function asUser(userId: string): Scope {
  // auth.uid() casts to uuid; refuse a malformed id here, where the cause is obvious.
  if (!UUID.test(userId)) throw new Error(`asUser: not a user id (${String(userId).slice(0, 40)})`)
  return scope(userId, async (tx) => {
    // One round trip: `role` is a GUC, so set_config(..., true) is SET LOCAL ROLE.
    await tx.execute(
      sql`SELECT set_config('app.user_id', ${userId}, true), set_config('role', 'authenticated', true)`,
    )
  })
}

export const asService: Scope = scope(null, async () => {})

// ── Building statements from objects ────────────────────────────────────────
// Column names come from code, never from input: callers pass literal object
// keys. Values are always parameters.

/** A jsonb value that is an array (plain objects already go in as jsonb). */
export function json(v: unknown): SQL {
  return sql`${JSON.stringify(v)}::jsonb`
}

const isSql = (v: unknown): v is SQL => v instanceof Object && 'queryChunks' in (v as object)
const param = (v: unknown): SQL => {
  if (isSql(v)) return v
  if (v instanceof Uint8Array) return sql`${v}`
  if (v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) return json(v)
  // A bare array inside sql`` expands to ($1, $2); sql.param keeps it one array parameter.
  if (Array.isArray(v)) return sql`${sql.param(v)}`
  return sql`${v}`
}
const columns = (keys: string[]) => sql.join(keys.map((k) => sql.identifier(k)), sql`, `)
const values = (obj: Row, keys: string[]) => sql.join(keys.map((k) => param(obj[k])), sql`, `)

/** `"public"."t"` from "t" or "schema.t". */
export function table(name: string): SQL {
  const dot = name.indexOf('.')
  const schema = dot < 0 ? 'public' : name.slice(0, dot)
  const rel = dot < 0 ? name : name.slice(dot + 1)
  return sql`${sql.identifier(schema)}.${sql.identifier(rel)}`
}

/** INSERT … RETURNING *. Keys with value undefined are left out (column default). */
export function insertInto(name: string, obj: Row): SQL {
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined)
  return sql`INSERT INTO ${table(name)} (${columns(keys)}) VALUES (${values(obj, keys)}) RETURNING *`
}

/** Multi-row INSERT … RETURNING *, every row with the keys of the first. */
export function insertMany(name: string, rows: Row[]): SQL {
  const first = rows[0]
  if (!first) throw new Error('insertMany: no rows')
  const keys = Object.keys(first).filter((k) => first[k] !== undefined)
  const list = sql.join(
    rows.map((r) => sql`(${values(r, keys)})`),
    sql`, `,
  )
  return sql`INSERT INTO ${table(name)} (${columns(keys)}) VALUES ${list} RETURNING *`
}

/** `col = $1, col2 = $2` for UPDATE … SET. Undefined keys are left out. */
export function setClause(obj: Row): SQL {
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined)
  if (keys.length === 0) throw new Error('setClause: no columns')
  return sql.join(
    keys.map((k) => sql`${sql.identifier(k)} = ${param(obj[k])}`),
    sql`, `,
  )
}

/** The column list of an upsert's ON CONFLICT DO UPDATE: `col = EXCLUDED.col`. */
export function excludedSet(keys: string[]): SQL {
  return sql.join(
    keys.map((k) => sql`${sql.identifier(k)} = EXCLUDED.${sql.identifier(k)}`),
    sql`, `,
  )
}

export { sql }
