import { config } from 'dotenv'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

/**
 * Applies pending migrations.
 *
 * Run against the Supabase session-mode connection (port 5432), not the
 * transaction pooler on 6543: the pooler does not support the DDL and advisory
 * locks a migration needs.
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
    // Supabase's pooler rejects prepared statements.
    prepare: false,
  })

  try {
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
