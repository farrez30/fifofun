import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { FIXTURE_DIR } from './render'

/**
 * The way back from a page one level in.
 *
 * Production review: a transaction opened from Laporan had no visible way
 * out. `src/app/back-link.test.ts` holds every such page to passing one; this
 * holds the link itself to being one a person can use: named by where it
 * goes, first in the reading order after the skip target, reachable by Tab,
 * a full touch target, and on screen at phone width where the tab bar lights
 * nothing for this page.
 */

async function open(page: import('@playwright/test').Page) {
  await page.setContent(readFileSync(`${FIXTURE_DIR}/shell-transaksi.html`, 'utf8'))
  await page.evaluate(() => document.fonts.ready)
}

for (const width of [1280, 375]) {
  test.describe(`jalan kembali at ${width}px`, () => {
    test.use({ viewport: { width, height: 800 } })

    test('names where it goes, and keeps the list it came from', async ({ page }) => {
      await open(page)
      const back = page.getByRole('link', { name: 'Kembali ke Laporan' })
      await expect(back).toBeVisible()
      await expect(back).toHaveAttribute('href', '/laporan?kategori=Makan&hal=2#daftar')
      // The visible word is the destination; the verb is for the screen reader.
      await expect(back).toHaveText(/^\s*Kembali ke Laporan\s*$/)
      const seen = await back.evaluate((link) => {
        const copy = link.cloneNode(true) as HTMLElement
        copy.querySelectorAll('.sr-only').forEach((hidden) => hidden.remove())
        return copy.textContent?.trim()
      })
      expect(seen).toBe('Laporan')
    })

    test('sits above the title, and is a full touch target', async ({ page }) => {
      await open(page)
      const back = page.locator('[data-back]')
      const title = page.getByRole('heading', { level: 1, name: 'Ubah transaksi' })
      await expect(title).toBeVisible()
      const [link, heading] = [await back.boundingBox(), await title.boundingBox()]
      expect(link!.y + link!.height).toBeLessThanOrEqual(heading!.y + 1)
      expect(link!.height).toBeGreaterThanOrEqual(44)
      expect(link!.x).toBeGreaterThanOrEqual(0)
    })

    test('is reached by the keyboard before anything in the page', async ({ page }) => {
      await open(page)
      const order = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea')]
          .filter((el) => el.offsetParent !== null && !el.closest('nav'))
          .map((el) => (el.hasAttribute('data-back') ? 'back' : el.tagName)),
      )
      expect(order[0]).toBe('back')
      await page.locator('[data-back]').focus()
      await expect(page.locator('[data-back]')).toBeFocused()
    })
  })
}
