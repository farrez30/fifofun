import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

/**
 * The database client.
 *
 * The `int8` type parser below is not optional. Postgres `bigint` arrives over
 * the wire as text, and postgres-js hands it back as a JavaScript string by
 * default to avoid silently truncating values past `Number.MAX_SAFE_INTEGER`.
 * That default is safe for precision but dangerous for money: `amount + amount`
 * on two strings concatenates them instead of adding, and nothing throws. Every
 * amount in this app is `bigint` sen, so the parser is set explicitly.
 */

declare global {
  // Reused across hot reloads in development so the pool is not recreated.
  var __fifofunDb: ReturnType<typeof create> | undefined
}

function connectionString(): string {
  // The -pooler endpoint is the right choice for serverless request handling;
  // migrations use the direct endpoint instead (see migrate.ts).
  const url = process.env.DATABASE_POOL_URL ?? process.env.DATABASE_URL
  if (url) return url
  // `next build` imports every route with no runtime env. postgres.js does not
  // connect until the first query, so a placeholder there touches nothing; at
  // runtime a missing URL still fails loudly.
  if (process.env.NEXT_PHASE === 'phase-production-build') return 'postgres://build@localhost/build'
  throw new Error('DATABASE_POOL_URL or DATABASE_URL must be set')
}

function create() {
  const client = postgres(connectionString(), {
    // Neon's pooler (PgBouncer, transaction mode) does not support prepared statements.
    prepare: false,
    // Inside Next the pool lives as long as the instance; a script has nothing
    // to reuse a connection for, and an idle socket keeps Node alive.
    idle_timeout: process.env.NEXT_RUNTIME ? 20 : 1,
    types: {
      bigint: postgres.BigInt,
    },
  })
  return drizzle(client, { schema })
}

export const db = globalThis.__fifofunDb ?? create()

if (process.env.NODE_ENV !== 'production') {
  globalThis.__fifofunDb = db
}

export { schema }
