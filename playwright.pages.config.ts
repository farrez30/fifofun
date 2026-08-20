import { defineConfig, devices } from '@playwright/test'

/**
 * The other browser suite: whole pages, served by a real build.
 *
 * `playwright.config.ts` renders one component per page on purpose, which keeps
 * it fast and points a failure at a component rather than at the login form.
 * The cost is that a page is more than its components. Landmarks, heading
 * order, the skip link, the document language, the title and the content
 * security policy only exist once the layout, the fonts and the proxy have all
 * run, so a fixture cannot be wrong about them and cannot be right either.
 *
 * Only the routes that need neither a session nor a database are here. The rest
 * of the app is reachable only behind Supabase, and a suite that quietly skips
 * itself when the environment is missing is worse than one that never claimed
 * to cover it.
 */
export default defineConfig({
  testDir: './e2e/pages',
  fullyParallel: true,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:3111',
    viewport: { width: 1280, height: 900 },
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // `next start`, not `next dev`: the content security policy differs between
    // them, and the strict one is the only one worth asserting.
    command: 'npx next start -p 3111',
    url: 'http://127.0.0.1:3111/login',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      // Deliberately unreachable. Every route here renders without a session,
      // and pointing at a real project would make the suite depend on secrets
      // it has no business holding.
      NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_unused',
    },
  },
})
