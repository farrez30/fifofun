import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { FIXTURE_DIR } from './render'

/**
 * Long pages split into views, long lists into pages.
 *
 * The map was thirty phone screens and the settings twenty, mostly lists drawn
 * whole. What is worth asserting is the contract that replaced them: a view is
 * an address and only one is marked open, a list never draws more than a page,
 * every page is reachable from the ends, and a folded filter still says what
 * it holds.
 */

async function open(page: import('@playwright/test').Page, fixture: string) {
  await page.setContent(readFileSync(`${FIXTURE_DIR}/${fixture}.html`, 'utf8'))
  await page.evaluate(() => document.fonts.ready)
}

test.describe('segmen halaman', () => {
  test('marks exactly one view open, and every view is an address that keeps the filter', async ({ page }) => {
    await open(page, 'peta-segmen')
    const views = page.getByRole('navigation', { name: 'Bagian peta' }).getByRole('link')

    await expect(views).toHaveCount(4)
    await expect(page.locator('[aria-current="page"]')).toHaveCount(1)
    await expect(views.nth(2)).toHaveAttribute('aria-current', 'page')
    await expect(views.first()).toHaveAttribute('href', '/peta?kategori=Bensin')
    await expect(views.nth(1)).toHaveAttribute('href', '/peta?kategori=Bensin&bagian=menunggu')
    // How much is behind a view, before opening it.
    await expect(views.nth(1)).toContainText('168')
  })

  test('fits four views on a phone without scrolling sideways', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await open(page, 'peta-segmen')
    const track = page.getByRole('navigation', { name: 'Bagian peta' }).locator('ul')
    const overflow = await track.evaluate((node) => node.scrollWidth - node.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
  })
})

test.describe('halaman daftar', () => {
  test('keeps both ends and the neighbours of the current page one tap away', async ({ page }) => {
    await open(page, 'pager-tengah')
    const pager = page.getByRole('navigation', { name: 'Halaman daftar tempat' })

    await expect(pager.locator('[aria-current="page"]')).toHaveText(/8/)
    await expect(pager.getByRole('link', { name: 'Halaman 1', exact: true })).toHaveAttribute('href', '/peta?bagian=tempat')
    await expect(pager.getByRole('link', { name: 'Halaman 16' })).toHaveAttribute('href', '/peta?bagian=tempat&hal=16')
    await expect(pager.getByRole('link', { name: 'Halaman 7' })).toBeVisible()
    await expect(pager.getByRole('link', { name: 'Halaman 9' })).toBeVisible()
    // Pages far from here are behind an ellipsis, not a row of sixteen buttons.
    await expect(pager.getByRole('link', { name: 'Halaman 3', exact: true })).toHaveCount(0)
    await expect(pager.locator('a[rel="prev"]')).toHaveAttribute('href', '/peta?bagian=tempat&hal=7')
    await expect(pager.locator('a[rel="next"]')).toHaveAttribute('href', '/peta?bagian=tempat&hal=9')
    await expect(pager).toContainText('Halaman 8 dari 16')
  })

  test('offers no way back from the first page, and draws nothing for a single page', async ({ page }) => {
    await open(page, 'pager-awal')
    await expect(page.locator('a[rel="prev"]')).toHaveCount(0)
    await expect(page.locator('a[rel="next"]')).toHaveCount(1)

    await open(page, 'pager-satu')
    await expect(page.getByRole('navigation')).toHaveCount(0)
  })

  test('gives every pager control a finger-sized target', async ({ page }) => {
    await open(page, 'pager-tengah')
    const boxes = await page
      .getByRole('navigation', { name: 'Halaman daftar tempat' })
      .locator('a, [aria-current="page"]')
      .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect()))
    for (const box of boxes) {
      expect(box.width).toBeGreaterThanOrEqual(44)
      expect(box.height).toBeGreaterThanOrEqual(44)
    }
  })
})

test.describe('pedagang yang menunggu', () => {
  test('draws one page of twenty, with Taruh as a link to the map', async ({ page }) => {
    await open(page, 'peta-menunggu')
    const rows = page.locator('section[aria-labelledby="belum-berlokasi"] ul > li')

    await expect(rows).toHaveCount(20)
    const first = page.getByRole('link', { name: 'Taruh AEROPOLIS TOKEN di peta' })
    await expect(first).toHaveAttribute('href', '/peta?taruh=warung%200#atur')
    // The count is the whole list, not the page on screen.
    await expect(page.locator('section[aria-labelledby="belum-berlokasi"] > p').first()).toContainText('45 pedagang')
    await expect(page.getByRole('searchbox', { name: 'Cari pedagang yang belum berlokasi' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Halaman pedagang yang menunggu' })).toContainText('Halaman 1 dari 3')
  })
})

test.describe('daftar tempat', () => {
  test('counts every place, not the page it was handed', async ({ page }) => {
    await open(page, 'peta-tempat')
    await expect(page.locator('section[aria-labelledby="tempat"] > p').first()).toContainText(/^\d+ tempat, urut/)
    const said = await page.locator('section[aria-labelledby="tempat"] > p').first().textContent()
    const shown = await page.locator('section[aria-labelledby="tempat"] tbody tr').count()
    expect(Number(said?.match(/^(\d+)/)?.[1])).toBeGreaterThan(shown)
  })

  test('says how many a search found, out of how many', async ({ page }) => {
    await open(page, 'peta-tempat-cari')
    await expect(page.getByRole('status')).toContainText(/^1 dari \d+ tempat cocok/)
  })
})

test.describe('saringan laporan', () => {
  test('is folded, and says on the outside what it holds', async ({ page }) => {
    await open(page, 'laporan-per-cashflow')
    const filter = page.locator('details').first()

    await expect(filter).not.toHaveAttribute('open', /.*/)
    await expect(filter.locator('summary')).toContainText('Sumber: Dicatat manual')
    await expect(filter.locator('summary')).toContainText('cari “kopi”')
    // Applying a filter stays on the view it was applied from.
    await expect(filter.locator('input[type="hidden"][name="bagian"]')).toHaveValue('cashflow')
  })

  test('shows only the breakdown its view is for', async ({ page }) => {
    await open(page, 'laporan-per-cashflow')
    await expect(page.locator('#per-cashflow')).toHaveCount(1)
    await expect(page.locator('#per-kategori')).toHaveCount(0)
  })
})
