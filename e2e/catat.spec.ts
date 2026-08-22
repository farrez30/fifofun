import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { FIXTURE_DIR } from './render'

/**
 * Typing a transaction, correcting a balance, and deciding about a pair.
 *
 * The assertions worth having here are the ones about what cannot be
 * submitted: a category that points the wrong way is not in the list, a
 * correction cannot be sent before a figure is typed, and the amount that
 * reaches the server is sen digits rather than whatever separators a person
 * happened to type.
 */

async function open(page: import('@playwright/test').Page, fixture: string) {
  await page.setContent(readFileSync(`${FIXTURE_DIR}/${fixture}.html`, 'utf8'))
  await page.evaluate(() => document.fonts.ready)
}

test.describe('catat transaksi', () => {
  test('asks for the direction first, and offers only what fits it', async ({ page }) => {
    await open(page, 'catat-entry')

    await expect(page.locator('input[name="direction"]')).toHaveCount(3)
    await expect(page.locator('input[name="direction"][value="out"]')).toBeChecked()

    const groups = await page
      .locator('select[name="categoryId"] optgroup')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('label')))
    expect(groups).toContain('Spending')
    expect(groups).toContain('Bills')
    // Income and Antar Account belong to the other two directions.
    expect(groups).not.toContain('Income')
    expect(groups).not.toContain('Antar Account')
  })

  test('sends the amount as sen digits, not as typed text', async ({ page }) => {
    await open(page, 'catat-entry')

    const hidden = page.locator('input[type="hidden"][name="amount"]')
    await expect(hidden).toHaveCount(1)
    await expect(hidden).toHaveValue(/^\d+$/)

    // The visible field is the forgiving one: separators, a Rp prefix, either.
    const visible = page.locator('input[inputmode="numeric"]').first()
    await expect(visible).toBeVisible()
    await expect(page.getByText('Rp', { exact: true }).first()).toBeVisible()
  })

  test('shows every account as a chip with its kind', async ({ page }) => {
    await open(page, 'catat-entry')
    await expect(page.locator('input[name="accountId"]')).toHaveCount(4)
    await expect(page.locator('[data-mark="account"]')).toHaveCount(4)
  })
})

test.describe('sesuaikan saldo', () => {
  test('compares the recorded figure with the real one, side by side', async ({ page }) => {
    await open(page, 'catat-adjust')

    const first = page.locator('form').first()
    await expect(first).toContainText('Tercatat di app')
    await expect(first).toContainText('Rp4.181.668')
    await expect(first).toContainText('Isi saldo sebenarnya dulu')

    // Nothing can be sent until a figure is typed: an empty form would mean
    // correcting the balance to zero.
    await expect(first.getByRole('button', { name: 'Catat penyesuaian' })).toBeDisabled()
    await expect(first.locator('input[name="expectedComputed"]')).toHaveValue(/^\d+$/)
  })

  test('warns only where a statement exists', async ({ page }) => {
    await open(page, 'catat-adjust')
    // The bank account has statements behind it, the wallet does not.
    await expect(page.getByText('belum diimpor')).toHaveCount(1)
    await expect(page.getByText('bukan sebagai perubahan saldo awal')).toHaveCount(2)
  })
})

test.describe('kemungkinan ganda', () => {
  test('puts the two rows side by side and offers both answers', async ({ page }) => {
    await open(page, 'catat-duplicates')

    await expect(page.locator('h2')).toContainText('2 catatan manual')
    await expect(page.getByRole('button', { name: /^Gabungkan/ })).toHaveCount(2)
    await expect(page.getByRole('button', { name: /^Bukan yang sama/ })).toHaveCount(2)

    const rows = page.locator('tbody tr')
    await expect(rows.filter({ hasText: 'Manual' })).toHaveCount(2)
    await expect(rows.filter({ hasText: 'Bank' })).toHaveCount(2)
    // Only the second pair's bank row was already settled by somebody.
    await expect(page.getByText('(sudah dipastikan)')).toHaveCount(3)
    await expect(page.getByText('Selisih waktu 2 hari')).toBeVisible()
  })
})

test.describe('saldo per akun', () => {
  test('names the reconciled account rather than assuming which bank it is', async ({ page }) => {
    await open(page, 'balances')
    await expect(page.getByText('Saldo Bank Mandiri cocok')).toBeVisible()
    await expect(page.locator('th', { hasText: 'Penyesuaian' })).toHaveCount(1)
    await expect(page.getByRole('button', { name: 'Sesuaikan saldo' })).toHaveCount(4)
    // Zero is written as zero; a dash would read as unknown.
    await expect(page.getByText('Rp0')).toHaveCount(1)
  })
})
