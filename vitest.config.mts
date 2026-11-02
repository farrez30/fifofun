import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      // The real next/cache throws outside a Next request; see the stub.
      'next/cache': fileURLToPath(new URL('./src/test/next-cache-stub.ts', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    // These need a database; see vitest.db.config.mts.
    exclude: ['**/node_modules/**', 'src/**/*.db.test.ts'],
    environment: 'node',
  },
})
