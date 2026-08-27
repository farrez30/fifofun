import { defineConfig, devices } from '@playwright/test'

/**
 * The same fixtures, measured at the width they are actually read at.
 *
 * A third config rather than a second project in `playwright.config.ts`. The
 * specs there assert chart geometry against a 1280px viewport, so running them
 * at 390px would fail every one of them for the right reason and tell nobody
 * anything. Splitting on viewport is the same reasoning that already split the
 * whole-page suite out into its own config.
 *
 * A device descriptor and not just a viewport size. Half of what this suite
 * checks lives behind `@media (pointer: coarse)`, which a narrow desktop window
 * does not satisfy: the touch target floor in `globals.css` would be absent and
 * the suite would pass by measuring a phone that reports a mouse.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: 'mobile.spec.ts',
  fullyParallel: true,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: { trace: 'on-first-retry' },
  projects: [
    {
      name: 'iphone',
      /*
        The phone's metrics, driven by Chromium.

        `devices['iPhone 13']` selects WebKit, which this repo has never
        installed: both existing suites are Chromium only. Pulling a second
        engine into CI buys nothing here, because none of what this suite
        measures is engine specific. Widths, computed font sizes and laid-out
        boxes are the same in both, and the iOS zoom this guards against is not
        observable in a test in either engine. What is asserted is the font size
        that causes it, which is just CSS.
      */
      use: { ...devices['iPhone 13'], browserName: 'chromium' },
    },
  ],

})
