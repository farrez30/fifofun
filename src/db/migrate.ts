import { config } from 'dotenv'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { readFileSync } from 'node:fs'
import postgres from 'postgres'

/**
 * Applies pending migrations.
 *
 * Run against Neon's DIRECT endpoint, not -pooler: PgBouncer in transaction
 * mode does not support the DDL and advisory locks a migration needs.
 *
 * drizzle/prelude-neon.sql runs first, every time: it recreates what Supabase
 * used to provide before 0000 (roles, the auth schema, auth.users, auth.uid())
 * and is idempotent. The numbered migrations stay frozen.
 */
async function main(): Promise<void> {
  config({ path: '.env.local', quiet: true })

  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.')
    process.exit(1)
  }

  const client = postgres(url, {
    max: 1,
    prepare: false,
    onnotice: () => {},
  })

  try {
    console.log('Applying prelude...')
    await client.unsafe(readFileSync('./drizzle/prelude-neon.sql', 'utf8'))
    console.log('Applying migrations...')
    await migrate(drizzle(client), { migrationsFolder: './drizzle' })
    console.log('Migrations applied.')
  } finally {
    await client.end()
  }
}

main().catch((error: unknown) => {
  console.error('Migration failed:', error instanceof Error ? error.message : error)
  process.exit(1)
})
