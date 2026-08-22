import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { FIXTURE_DIR } from './render'

/**
 * What a person needs to see before deciding a category.
 *
 * The queue used to show a counterparty, a count and a total. Every one of
 * these assertions is a question that could not be answered from that: which
 * way did the money go, when, from which account, and what is it filed as
 * now. The category list being filtered by direction is the same fix seen
 * from the writing end: a category that cannot be saved is never offered.
 */

async function open(page: import('@playwright/test').Page, fixture: string) {
  await page.setContent(readFileSync(`${FIXTURE_DIR}/${fixture}.html`, 'utf8'))
  await page.evaluate(() => document.fonts.ready)
}

test.describe('penanda', () => {
  test('draws every mark with an icon and words beside it', async ({ page }) => {
    await open(page, 'marks')

    // Every category carries its name; the swatch is never alone.
    for (const mark of await page.locator('[data-mark="category"]').all()) {
      await expect(mark.locator('svg')).toHaveCount(1)
      expect((await mark.innerText()).trim().length).toBeGreaterThan(0)
      await expect(mark.locator('[data-hue]')).toHaveCount(1)
    }

    const swatches = await page.locator('[data-mark="category"] [data-hue]').evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLElement).style.backgroundColor),
    )
    expect(swatches.length).toBeGreaterThan(0)
    for (const colour of swatches) expect(colour).toContain('oklch(var(--category-l)')

    const words = await page
      .locator('[data-mark="direction"] .sr-only')
      .evaluateAll((nodes) => nodes.map((node) => node.textContent))
    expect(words.sort()).toEqual(['antar akun', 'keluar', 'masuk'])
  })
})

test.describe('antrean tinjau', () => {
  test('says which way the money went, when, and from which account', async ({ page }) => {
    await open(page, 'review-queue')

    const opened = page.locator('[aria-expanded="true"]')
    await expect(opened).toHaveCount(1)

    const body = page.locator('[id$="-isi"]').first()
    // The per-row list is collapsed by default, because needing it is the
    // exception; opening it is what somebody does to check one row.
    await body.locator('summary', { hasText: 'Atur satu per satu' }).click()

    // Date and time to the second, the way the statement writes it.
    await expect(body).toContainText(/\d{2} \w{3} \d{4} \d{2}:\d{2}:\d{2}/)
    await expect(body.locator('[data-mark="account"]').first()).toBeVisible()
    await expect(body.locator('[data-mark="cashflow"]').first()).toBeVisible()

    const header = await page.locator('button[aria-expanded]').first().innerText()
    expect(header).toMatch(/\d+ transaksi · /)
  })

  test('offers only the categories that can actually be saved', async ({ page }) => {
    await open(page, 'review-queue')

    const select = page.locator('select[name="categoryId"]').first()
    const groups = await select.locator('optgroup').evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('label')),
    )
    expect(groups).toContain('Spending')
    // An income category on an outgoing row is what the database refuses, so
    // it is never in the list to begin with.
    expect(groups).not.toContain('Income')
    await expect(select.locator('option', { hasText: 'Gaji' })).toHaveCount(0)
  })

  test('splits one counterparty that both pays and gets paid', async ({ page }) => {
    await open(page, 'review-queue')

    // The header carries the pattern a rule would use, which is the tidied,
    // lower-cased counterparty rather than one row's own wording.
    const headers = await page.locator('button[aria-expanded]').allInnerTexts()
    const anis = headers.filter((text) => text.includes('anis rengganis'))
    expect(anis).toHaveLength(2)
    // One group takes money out, the other brings it back.
    expect(anis.some((text) => text.startsWith('-') || text.includes('−'))).toBe(true)
    expect(anis.some((text) => text.includes('+'))).toBe(true)
  })

  test('reads by month when asked, newest first', async ({ page }) => {
    await open(page, 'review-queue-bulan')

    const headers = await page.locator('button[aria-expanded]').allInnerTexts()
    expect(headers[0]).toMatch(/Agu 2026\n?.*\d+ transaksi · Agu 2026/s)

    // A month is not a pattern, so nothing here offers to save one as a rule.
    await expect(page.locator('input[name="pattern"]')).toHaveCount(0)
    await expect(page.locator('nav[aria-label="Urutan dan kelompok antrean"]')).toContainText(
      'Terbaru, karena kelompoknya bulan',
    )
    await expect(page.locator('nav a[aria-current="true"]')).toHaveCount(1)
  })
})
