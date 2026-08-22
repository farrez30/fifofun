import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { FIXTURE_DIR } from './render'

/**
 * A month of budgets.
 *
 * The thing worth defending here is the difference between an unknown and a
 * zero. Every empty cell on this screen has a reason, and printing a dash for
 * all of them would tell a household it spends nothing on things it spends
 * plenty on.
 */

async function open(page: Page, fixture: string) {
  await page.setContent(readFileSync(`${FIXTURE_DIR}/${fixture}.html`, 'utf8'))
  await page.evaluate(() => document.fonts.ready)
}

test.describe('anggaran', () => {
  test('carries every figure as sen digits', async ({ page }) => {
    await open(page, 'budget-table')

    // Rp1.300.000 typed, 130000000 sent.
    await expect(page.locator('input[name="b-c-belanja"]')).toHaveValue('130000000')
    // A category with no budget posts an empty value rather than a zero, which
    // is what tells the action to remove rather than to write.
    await expect(page.locator('input[name="b-c-jajan"]')).toHaveValue('0')
  })

  test('counts and totals only what is actually budgeted', async ({ page }) => {
    await open(page, 'budget-table')
    await expect(page.getByText('2 kategori dianggarkan untuk Jul 2026')).toBeVisible()
    await expect(page.getByText('total Rp1.600.000')).toBeVisible()
  })

  test('marks a figure that is spending rather than a budget', async ({ page }) => {
    await open(page, 'budget-table')
    const jajan = page.locator('tr', { hasText: 'Jajan' })

    // No budget was set for Jajan last month, so what it cost stands in, and
    // the difference is said out loud rather than only drawn.
    await expect(jajan).toContainText('◆')
    // The mark is decoration; the words beside it are what a screen reader
    // gets, and there are several sr-only spans in a row of this shape.
    const spoken = await jajan.locator('.sr-only').allTextContents()
    expect(spoken.join(' ')).toContain('realisasi, bukan anggaran')
  })

  test('marks a category that went over, and draws how far', async ({ page }) => {
    await open(page, 'budget-table')
    const belanja = page.locator('tr', { hasText: 'Belanja' })

    await expect(belanja).toContainText('▲')
    const spoken = await belanja.locator('.sr-only').allTextContents()
    expect(spoken.join(' ')).toContain('lewat anggaran')

    const width = await belanja.locator('[data-budget]').evaluate(
      (node) => node.getBoundingClientRect().width,
    )
    expect(width).toBeGreaterThan(1)
  })

  test('says a category has never appeared rather than saying it costs nothing', async ({
    page,
  }) => {
    await open(page, 'budget-table')
    const other = page.locator('tr', { hasText: 'Other spending' })
    await expect(other).toContainText('belum pernah muncul')
  })

  test('says nothing is known when there is no history at all', async ({ page }) => {
    await open(page, 'budget-table-empty')
    const body = await page.locator('body').innerText()

    expect(body).toContain('Belum ada anggaran untuk Jan 2026')
    expect((body.match(/tidak diketahui/g) ?? []).length).toBe(5)
    // Nothing spent yet, so there is no realisation column to draw at all.
    expect(await page.getByRole('columnheader', { name: 'Realisasi' }).count()).toBe(0)
  })

  test('offers to copy last month only when it would fill something in', async ({ page }) => {
    await open(page, 'budget-table')
    await expect(
      page.getByRole('button', { name: /Salin anggaran Jun 2026/ }),
    ).toBeVisible()

    await open(page, 'budget-table-empty')
    expect(await page.getByRole('button', { name: /Salin anggaran/ }).count()).toBe(0)
  })

  test('keeps the Biasanya column about history, never about a budget', async ({ page }) => {
    await open(page, 'budget-table')
    const header = page.getByRole('columnheader', { name: 'Biasanya' })
    await expect(header).toBeVisible()

    // Said once, under the table, rather than repeated in every cell.
    await expect(page.getByText('median enam bulan sebelum Jul 2026')).toBeVisible()
  })

  test('draws every category with its own mark', async ({ page }) => {
    await open(page, 'budget-table')
    const marks = page.locator('[data-mark="category"]')

    await expect(marks).toHaveCount(5)
    for (const mark of await marks.all()) {
      await expect(mark.locator('svg')).toHaveCount(1)
      await expect(mark.locator('[data-hue]')).toHaveCount(1)
    }
  })

  test('groups the rows by cashflow across the whole width', async ({ page }) => {
    await open(page, 'budget-table-empty')
    const groups = page.locator('th[scope="colgroup"]')

    await expect(groups).toHaveCount(2)
    // Four columns while no realisation is drawn, five once there is.
    await expect(groups.first()).toHaveAttribute('colspan', '4')
  })
})
