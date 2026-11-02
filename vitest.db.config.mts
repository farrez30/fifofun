import { defineConfig } from 'vitest/config'
import base from './vitest.config.mjs'

// Tests that need a migrated Postgres (*.db.test.ts). Kept out of `pnpm test`,
// which runs without a database; `pnpm test:db` runs only these. Spread rather
// than mergeConfig, which would append to `include` instead of replacing it.
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ['src/**/*.db.test.ts'],
    exclude: ['**/node_modules/**'],
  },
})
