import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
  // auth.* is created by hand (drizzle/prelude-neon.sql, 0016) and owned by
  // Better Auth; drizzle-kit must never diff or drop it.
  schemaFilter: ['public'],
  verbose: true,
  strict: true,
})
