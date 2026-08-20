import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

/**
 * The pages anyone can reach without signing in.
 *
 * These are the first thing a stranger sees and the only part of the app that
 * can be tested end to end without a database, which makes them both the most
 * exposed surface and the cheapest to hold to a standard.
 *
 * Every assertion here is about something a component fixture cannot observe:
 * the header the layout wraps around the page, the landmarks the two together
 * produce, the language on the html element, and the security policy the proxy
 * attaches on the way out.
 */

const ROUTES = [
  { path: '/login', title: /Masuk/ },
  { path: '/legal/ketentuan', title: /Ketentuan/ },
  { path: '/legal/privasi', title: /Privasi/ },
  { path: '/offline', title: /Tidak ada koneksi/ },
] as const

const SCHEMES = ['light', 'dark'] as const

async function axeOf(page: Page) {
  return new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
}

for (const route of ROUTES) {
  test.describe(route.path, () => {
    for (const scheme of SCHEMES) {
      test(`passes axe in ${scheme} mode`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: scheme })
        await page.goto(route.path)

        const { violations } = await axeOf(page)
        expect(violations.map((v) => ({ id: v.id, nodes: v.nodes.length }))).toEqual([])
      })
    }

    test('has a title of its own', async ({ page }) => {
      // A shared title makes a tab strip and a history list useless, and it is
      // the first thing a screen reader announces on arrival.
      await page.goto(route.path)
      await expect(page).toHaveTitle(route.title)
    })

    test('declares the language it is written in', async ({ page }) => {
      // Indonesian read aloud by a synthesiser set to English is unintelligible.
      await page.goto(route.path)
      await expect(page.locator('html')).toHaveAttribute('lang', 'id')
    })

    test('puts its content inside one main landmark', async ({ page }) => {
      await page.goto(route.path)
      await expect(page.locator('main')).toHaveCount(1)
    })

    test('never pushes the page sideways on a narrow screen', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 })
      await page.goto(route.path)
      const overflow = await page.evaluate(
        'document.documentElement.scrollWidth - document.documentElement.clientWidth',
      )
      expect(overflow).toBeLessThanOrEqual(0)
    })
  })
}

test.describe('the security policy the proxy attaches', () => {
  /*
    Built in src/proxy.ts and, until this ran, asserted nowhere. It differs
    between development and production, so the only honest place to check it is
    against a real `next start`.
  */
  const policy = async (page: Page) => {
    const response = await page.goto('/login')
    return response?.headers()['content-security-policy'] ?? ''
  }

  test('is present at all', async ({ page }) => {
    expect(await policy(page)).toContain("default-src 'self'")
  })

  test('lets no inline or remote script run unsigned', async ({ page }) => {
    const csp = await policy(page)
    const scriptSrc = csp.split(';').find((part) => part.trim().startsWith('script-src'))
    expect(scriptSrc).toBeDefined()
    expect(scriptSrc).not.toContain('unsafe-inline')
    // `unsafe-eval` is granted in development for the refresh runtime, and a
    // production build that still carries it would be the bug worth catching.
    expect(scriptSrc).not.toContain('unsafe-eval')
    expect(scriptSrc).toMatch(/'nonce-[^']+'/)
  })

  test('refuses to be framed, and refuses plugins', async ({ page }) => {
    const csp = await policy(page)
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("object-src 'none'")
  })

  test('gives every response a nonce of its own', async ({ page }) => {
    // A nonce reused across responses is a nonce an attacker can learn once and
    // spend afterwards, which is the same as having none.
    const first = await policy(page)
    const second = await policy(page)
    expect(first).not.toBe(second)
  })

  test('runs the page it protects, rather than blocking it', async ({ page }) => {
    // A policy strict enough to break the app fails silently in the console, so
    // the check is that nothing was refused rather than that a header exists.
    const blocked: string[] = []
    page.on('console', (msg) => {
      if (/Content Security Policy/i.test(msg.text())) blocked.push(msg.text())
    })
    await page.goto('/login')
    await page.waitForLoadState('networkidle')
    expect(blocked).toEqual([])
  })
})

test.describe('the pages that need somebody signed in', () => {
  /*
    Every page checks the user itself rather than trusting the proxy, which
    checks nobody. That is the design, and until this ran it was a claim in a
    comment. These two are the newest and the only ones reachable here, since
    the rest also need a database.
  */
  for (const path of ['/gabung', '/undangan']) {
    test(`${path} sends a stranger to the login page`, async ({ page }) => {
      await page.goto(path)
      await expect(page).toHaveURL(/\/login$/)
    })
  }
})

test.describe('a page that does not exist', () => {
  test('answers 404 rather than a blank two hundred', async ({ page }) => {
    const response = await page.goto('/tidak-ada-halaman-ini')
    expect(response?.status()).toBe(404)
  })

  test('offers the way back instead of a dead end', async ({ page }) => {
    await page.goto('/tidak-ada-halaman-ini')
    await expect(page.locator('a[href="/"]').first()).toBeVisible()
  })

  test('passes axe', async ({ page }) => {
    await page.goto('/tidak-ada-halaman-ini')
    const { violations } = await axeOf(page)
    expect(violations.map((v) => v.id)).toEqual([])
  })
})
