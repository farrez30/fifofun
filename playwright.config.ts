import { defineConfig, devices } from '@playwright/test'

/**
 * Browser tests, for the things only a browser knows.
 *
 * Vitest covers every calculation in this repo and cannot see a single pixel.
 * These tests exist for the two questions it cannot answer: did the layout put
 * the marks where the numbers say they belong, and can the page be used by
 * somebody who is not looking at it.
 *
 * There is no `webServer` here on purpose. Every spec renders its component on
 * its own page, so the suite runs without a build, a session or a database, and
 * a failure points at a component rather than at the login form.
 */
export default defineConfig({
  testDir: './e2e',
  // Whole-page tests need a build and a server, so they live in their own
  // config. Keeping them out of this one is what lets this one stay fast.
  testIgnore: '**/pages/**',
  fullyParallel: true,
  // A test that only passes on the second attempt is a test nobody can trust.
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI
    ? [['github'], ['list'], ['html', { open: 'never' }]]
    : 'list',
  use: {
    viewport: { width: 1280, height: 900 },
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
