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
  // The transaction pooler is the right choice for serverless request handling;
  // migrations use the session pooler instead (see migrate.ts).
  const url = process.env.DATABASE_POOL_URL ?? process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_POOL_URL or DATABASE_URL must be set')
  return url
}

function create() {
  const client = postgres(connectionString(), {
    // Supabase's transaction pooler does not support prepared statements.
    prepare: false,
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
