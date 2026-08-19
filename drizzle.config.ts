import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
  // Supabase owns these schemas; never diff or drop them.
  schemaFilter: ['public'],
  verbose: true,
  strict: true,
})
