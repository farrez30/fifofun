import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { FIXTURE_DIR } from './render'

/**
 * One transaction, and the table that leads to it.
 *
 * The line every one of these defends is the same: what the bank said cannot
 * be edited, what somebody decided about it can. A form that renders an amount
 * box for a statement row is not a cosmetic mistake, it is an invitation to
 * break the only external check this app has.
 */

async function open(page: Page, fixture: string) {
  await page.setContent(readFileSync(`${FIXTURE_DIR}/${fixture}.html`, 'utf8'))
  await page.evaluate(() => document.fonts.ready)
}

test.describe('tabel transaksi', () => {
  test('makes every row reachable from where it was seen', async ({ page }) => {
    await open(page, 'transaction-table')
    const links = page.locator('tbody a')

    await expect(links).toHaveCount(6)
    await expect(links.first()).toHaveAttribute('href', '/transaksi/tx-1')
  })

  test('says what is unusual about a row without making it read it', async ({ page }) => {
    await open(page, 'transaction-table')
    const body = await page.locator('tbody').innerText()

    expect(body).toContain('perlu ditinjau')
    expect(body).toContain('titipan')
    expect(body).toContain('bagian')
  })

  test('names a category the row never had, and an account nobody has', async ({ page }) => {
    await open(page, 'transaction-table')
    const body = await page.locator('tbody').innerText()

    // A transfer has no category and is not uncategorised either.
    expect(body).toContain('Antar Account')
    expect(body).toContain('Belum berkategori')
    // Deleted outright rather than archived. A blank cell would read as none.
    expect(body).toContain('Akun tidak dikenal')
  })

  test('draws both sides of a transfer, in order', async ({ page }) => {
    await open(page, 'transaction-table')
    const row = page.locator('tbody tr', { hasText: 'GOPAY TOPUP' })
    const marks = await row.locator('[data-mark="account"]').allInnerTexts()

    expect(marks[0]).toContain('Bank Mandiri')
    expect(marks[1]).toContain('GoPay')
  })
})

test.describe('ubah transaksi', () => {
  test('refuses to offer the figure of a statement row', async ({ page }) => {
    await open(page, 'transaksi-edit-xlsx')

    // Not disabled, not hidden: not rendered. A field that would be ignored on
    // submit is a promise the page cannot keep.
    expect(await page.locator('input[name="amount"]').count()).toBe(0)
    expect(await page.locator('input[name="date"]').count()).toBe(0)
    expect(await page.locator('input[name="time"]').count()).toBe(0)
    expect(await page.locator('input[name="accountId"]').count()).toBe(0)

    // What can be decided is still there.
    await expect(page.locator('select[name="categoryId"]')).toBeEnabled()
    await expect(page.locator('textarea[name="note"]')).toBeVisible()
  })

  test('offers the whole row on something somebody typed', async ({ page }) => {
    await open(page, 'transaksi-edit-manual')

    await expect(page.locator('input[name="amount"]')).toHaveValue('2500000')
    await expect(page.locator('input[name="date"]')).toHaveValue('2026-07-15')
    await expect(page.locator('input[name="time"]')).toHaveValue('12:00')
    expect(await page.locator('input[name="accountId"]').count()).toBe(2)
  })

  test('carries whether the row is money held for somebody else', async ({ page }) => {
    await open(page, 'transaksi-edit-manual')
    await expect(page.locator('input[name="passThrough"]')).toHaveValue('0')
    await expect(page.getByText('tetap menggerakkan saldo akun')).toBeVisible()
  })
})

test.describe('pisah transaksi', () => {
  test('starts with two empty parts and the whole amount unspoken for', async ({ page }) => {
    await open(page, 'transaksi-split')

    expect(await page.locator('input[name$="-amount"]').count()).toBe(2)
    await expect(page.getByRole('status')).toContainText('Sisa Rp150.000 belum dibagi.')
  })

  test('cannot be submitted while the parts do not add up', async ({ page }) => {
    await open(page, 'transaksi-split')
    await expect(page.getByRole('button', { name: 'Pisah' })).toBeDisabled()
  })

  test('will not go below two parts, and will go up to six', async ({ page }) => {
    await open(page, 'transaksi-split')

    await expect(page.getByRole('button', { name: 'Hapus bagian' }).first()).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Tambah bagian' })).toBeEnabled()
  })

  test('says what the parts have to add up to, and why', async ({ page }) => {
    await open(page, 'transaksi-split')
    const text = await page.locator('form').innerText()

    expect(text).toContain('berjumlah persis Rp150.000')
    expect(text).toContain('disembunyikan, bukan dihapus')
  })
})
