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

  test('lets only the portfolio frame it, and refuses plugins', async ({ page }) => {
    const csp = await policy(page)
    expect(csp).toContain("frame-ancestors 'self' https://farrez.vercel.app;")
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
  for (const path of [
    '/gabung',
    '/undangan',
    '/catat',
    '/pengaturan',
    '/anggaran',
    '/peta',
    '/transaksi/00000000-0000-4000-8000-000000000000',
  ]) {
    test(`${path} sends a stranger to the login page`, async ({ page }) => {
      await page.goto(path)
      await expect(page).toHaveURL(/\/login$/)
    })
  }
  // An account icon is a picture, not a page: a stranger gets a refusal, not
  // a redirect, and nothing cacheable.
  test('an account icon answers a stranger with 401', async ({ request }) => {
    const response = await request.get('/akun/00000000-0000-4000-8000-000000000000/logo?v=x')
    expect(response.status()).toBe(401)
    expect(response.headers()['cache-control']).toContain('no-store')
  })
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

test.describe('the way back from the legal pages', () => {
  test('returns to the page they were opened from, by its name', async ({ page }) => {
    await page.goto('/legal/privasi?dari=%2Flogin')
    const back = page.getByRole('link', { name: 'Kembali ke Masuk' })
    await expect(back).toBeVisible()
    await expect(back).toHaveAttribute('href', '/login')
  })

  test('is offered from the login page itself', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('link', { name: 'Kebijakan Privasi' }).click()
    await expect(page.getByRole('link', { name: 'Kembali ke Masuk' })).toBeVisible()
  })

  test('falls back to the app, never to another site', async ({ page }) => {
    for (const dari of ['', '?dari=%2F%2Fevil.example', '?dari=https%3A%2F%2Fevil.example']) {
      await page.goto(`/legal/ketentuan${dari}`)
      await expect(page.getByRole('link', { name: 'Kembali ke FiFoFun' })).toHaveAttribute('href', '/')
    }
  })
})

test.describe('the pages a stranger sees', () => {
  // Every response is dynamic (the CSP nonce), so a route's loading fallback is
  // streamed ahead of the page even on a hard load. The root one is the
  // signed-in app's frame, and it used to flash here with live links.
  // /gabung is left out: a stranger is redirected before anything renders.
  //
  // Without JavaScript the streamed fallback is never swapped out, so what
  // stays on screen is exactly what a slow connection shows first. The DOM is
  // asked rather than the HTML searched: the flight data in <script> carries
  // every loading tree for client navigations and is never drawn.
  test.use({ javaScriptEnabled: false })

  for (const path of ['/login', '/legal/privasi', '/legal/ketentuan', '/offline']) {
    test(`${path} never streams the signed-in navigation`, async ({ page }) => {
      await page.goto(path)
      await expect(page.locator('nav[aria-label="Halaman utama"]')).toHaveCount(0)
    })
  }
})

test.describe('the eye on the password field', () => {
  test('shows what was typed or pasted, and hides it again', async ({ page }) => {
    await page.goto('/login')
    const field = page.getByLabel('Kata sandi')
    await field.fill('dari-bitwarden')
    await expect(field).toHaveAttribute('type', 'password')
    await expect(field).toHaveAttribute('autocomplete', 'current-password')

    await page.getByRole('button', { name: 'Tampilkan sandi' }).click()
    await expect(field).toHaveAttribute('type', 'text')
    await expect(field).toHaveValue('dari-bitwarden')
    // A tap on the eye leaves the caret, and a phone's keyboard, in the field.
    await expect(field).toBeFocused()
    const hide = page.getByRole('button', { name: 'Sembunyikan sandi' })
    await expect(hide).toHaveAttribute('aria-pressed', 'true')

    // From the keyboard too: Tab lands on the eye, Space flips it back.
    await page.keyboard.press('Tab')
    await expect(hide).toBeFocused()
    await page.keyboard.press('Space')
    await expect(field).toHaveAttribute('type', 'password')
    const show = page.getByRole('button', { name: 'Tampilkan sandi' })
    await expect(show).toHaveAttribute('aria-pressed', 'false')

    const box = await show.boundingBox()
    expect(box!.width).toBeGreaterThanOrEqual(44)
    expect(box!.height).toBeGreaterThanOrEqual(44)
  })
})
