import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { FIXTURE_DIR } from './render'

/**
 * The report that answers where the money went, and why that much.
 *
 * It reads on three levels, and the reason there are three is that the flat one
 * stopped working: forty-three spending categories is a list nobody finishes,
 * and the question underneath most of them is one level coarser. So the group
 * carries the figure, the categories inside it are one disclosure away, and the
 * counterparties that make each category are one more. Nothing is hidden and
 * nothing is dumped.
 *
 * The disclosures are `<details>`, which open without a line of JavaScript.
 * That matters here: this harness renders static markup, and so does the server
 * before hydration.
 */

async function open(page: import('@playwright/test').Page, fixture: string) {
  await page.setContent(readFileSync(`${FIXTURE_DIR}/${fixture}.html`, 'utf8'))
  await page.evaluate(() => document.fonts.ready)
}

/**
 * The report itself, not the filter form above it.
 *
 * Every category name is also an `<option>` in the form, so an unscoped match
 * finds the same word twice and says nothing about either.
 */
const report = (page: import('@playwright/test').Page) =>
  page.locator('section:has(#per-kategori)')

test.describe('laporan per kategori', () => {
  test('leads with the group rather than everything inside it', async ({ page }) => {
    await open(page, 'laporan-per-kategori')

    await expect(report(page).getByText('Makan & Minum')).toBeVisible()
    await expect(report(page).getByText('Transport')).toBeVisible()

    // The names inside a group are there, but not until they are asked for.
    await expect(report(page).getByText('Kopi & Snack')).toBeHidden()
  })

  test('opens a group into the pos that make it', async ({ page }) => {
    await open(page, 'laporan-per-kategori')

    await report(page).getByText('2 pos di dalamnya').last().click()
    await expect(report(page).getByText('Kopi & Snack')).toBeVisible()
  })

  test('names who the money went to, one level further down', async ({ page }) => {
    await open(page, 'laporan-per-kategori')

    // Transport is the larger group, so it is the first one listed; Bensin is
    // the larger pos inside it.
    await report(page).getByText('2 pos di dalamnya').first().click()
    await report(page).getByText('Ke mana perginya').first().click()

    await expect(report(page).getByText('spbu 31.11802')).toBeVisible()
    await expect(report(page).getByText('shell jatimekar')).toBeVisible()
  })

  test('leaves a category with no group standing on its own', async ({ page }) => {
    await open(page, 'laporan-per-kategori')

    const laundry = report(page).locator('li', { hasText: 'Laundry' }).first()
    await expect(laundry).toBeVisible()
    // Nothing to open: a group of one would show the same figure twice.
    await expect(laundry.getByText('pos di dalamnya')).toHaveCount(0)
  })

  test('gives every group a share of its own direction', async ({ page }) => {
    await open(page, 'laporan-per-kategori')

    // Income and spending are measured against different totals, so a spending
    // group is never a percentage of money that came in.
    await expect(report(page).getByText('Gaji')).toBeVisible()
    await expect(report(page).getByText('100,0%')).toBeVisible()
  })

  test('makes every disclosure a real target on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 })
    await open(page, 'laporan-per-kategori')

    // A disclosure sized to its own eight-point label is the smallest thing on
    // the page and the one most often reached for with a thumb.
    const heights = await report(page)
      .locator('summary')
      .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height))
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(44)
  })

  test('never pushes the page sideways on a narrow screen', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 })
    await open(page, 'laporan-per-kategori')

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })
})
