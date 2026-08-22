import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { FIXTURE_DIR } from './render'
import { ACCOUNT_KEYS, LOOKED_UP_NAMES } from '../src/lib/ledger/settings'

/**
 * Managing accounts and categories.
 *
 * The screen is mostly ordinary editing, so these tests are about the three
 * places where it is not: the import key that decides where a statement lands,
 * the cashflow that freezes once anything depends on it, and the pair of rows
 * a savings pot is made of.
 */

async function open(page: Page, fixture: string) {
  await page.setContent(readFileSync(`${FIXTURE_DIR}/${fixture}.html`, 'utf8'))
  await page.evaluate(() => document.fonts.ready)
}

test.describe('akun', () => {
  test('says what each import key is actually for', async ({ page }) => {
    await open(page, 'settings-accounts')

    // "mandiri" on its own is a word. What a reader needs is the sentence
    // saying that this is where the e-statement goes.
    await expect(page.getByRole('cell', { name: /mandiri/ }).first()).toContainText(
      'e-statement Mandiri',
    )
    await expect(page.getByRole('cell', { name: /tidak diimpor/ })).toBeVisible()
  })

  test('keeps an archived account listed, at the end and out of the order', async ({ page }) => {
    await open(page, 'settings-accounts')
    const rows = page.locator('tbody tr')

    await expect(rows).toHaveCount(4)
    await expect(rows.last()).toContainText('OVO lama')
    await expect(rows.last()).toContainText('(arsip)')
    await expect(rows.last()).toContainText('tidak diurutkan')
    await expect(rows.last().getByRole('button', { name: 'Pakai lagi' })).toBeVisible()
  })

  test('cannot move the first row up or the last live row down', async ({ page }) => {
    await open(page, 'settings-accounts')

    await expect(page.getByRole('button', { name: 'Naikkan Bank Mandiri' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Turunkan GoPay' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Turunkan Bank Mandiri' })).toBeEnabled()
  })

  test('draws every account with its own mark', async ({ page }) => {
    await open(page, 'settings-accounts')
    expect(await page.locator('[data-mark="account"]').count()).toBe(4)
  })
})

test.describe('formulir akun', () => {
  test('offers every key the importer and the bot know, and no others', async ({ page }) => {
    await open(page, 'settings-account-form')
    const options = await page.locator('select[name="key"] option').allInnerTexts()

    // One extra for the account that is not imported at all.
    expect(options).toHaveLength(ACCOUNT_KEYS.length + 1)
    expect(options[0]).toBe('tidak diimpor')
  })

  test('carries the opening balance as sen digits', async ({ page }) => {
    await open(page, 'settings-account-form')

    // Rp1.552.574 typed by a person, 155257400 sent to the server.
    await expect(page.locator('input[name="openingBalance"]')).toHaveValue('155257400')
  })

  test('asks for e-wallet numbers only where they mean something', async ({ page }) => {
    await open(page, 'settings-account-form')
    const box = page.locator('textarea[name="ownIdentifiers"]')

    await expect(box).toHaveValue(/081234567890/)
    await expect(page.getByText('semua top-up terhitung pengeluaran')).toBeVisible()
  })
})

test.describe('kategori', () => {
  test('groups by cashflow, because that is the part that cannot change later', async ({
    page,
  }) => {
    await open(page, 'settings-categories')
    const headings = await page.getByRole('heading', { level: 3 }).allInnerTexts()

    expect(headings).toEqual([
      'Income',
      'Spending',
      'Bills',
      'Invest / Savings',
      'Dari Asset / Saving',
      'Diarsipkan',
    ])
  })

  test('shows a savings pot in both of the groups it belongs to', async ({ page }) => {
    await open(page, 'settings-categories')

    // The pot and the way out of it are two rows with one name, and the funds
    // panel pairs them by that name.
    expect(await page.getByRole('rowheader', { name: /Tabungan/ }).count()).toBe(2)
  })

  test('marks the names the importer looks for literally', async ({ page }) => {
    await open(page, 'settings-categories')
    await expect(page.getByRole('rowheader', { name: /Makan\/minum/ })).toContainText(
      'dicari impor',
    )
    await expect(page.getByRole('rowheader', { name: /^Kopi/ })).not.toContainText('dicari impor')

    // And lists all of them in one place rather than leaving it to be guessed.
    // Read from the DOM rather than from what is on screen: the list is folded
    // away until somebody asks for it.
    const chips = await page
      .locator('details li')
      .evaluateAll((nodes) => nodes.map((node) => node.textContent ?? ''))
    expect(chips.sort()).toEqual([...LOOKED_UP_NAMES].sort())
  })
})

test.describe('formulir kategori', () => {
  test('offers the whole icon registry, each one nameable', async ({ page }) => {
    await open(page, 'settings-category-form')
    const names = await page
      .locator('input[name="icon"]')
      .evaluateAll((nodes) => nodes.map((node) => (node as HTMLInputElement).value))

    // The registry is the only source of icons in the app, so the picker is
    // the registry rather than a subset somebody chose.
    expect(names.length).toBeGreaterThan(40)
    expect(new Set(names).size).toBe(names.length)
    expect(names).toContain('PiggyBank')
  })

  test('offers twelve preset hues and a field for any other', async ({ page }) => {
    await open(page, 'settings-category-form')

    expect(await page.locator('button[aria-pressed]').count()).toBe(12)
    await expect(page.locator('input[name="hue"]')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Ikuti warna bawaan' })).toBeVisible()
  })

  test('leaves the cashflow open while nothing depends on it', async ({ page }) => {
    await open(page, 'settings-category-form')
    const select = page.locator('select[name="cashflow"]')

    await expect(select).toBeEnabled()
    await expect(page.getByText('arahnya terkunci')).toHaveCount(0)
  })

  test('previews the mark the rest of the app will draw', async ({ page }) => {
    await open(page, 'settings-category-form')

    // The preview is the real component, so a category cannot look one way
    // here and another way in the flow diagram.
    const preview = page.locator('fieldset [data-mark="category"]')
    await expect(preview).toContainText('Kopi')
    await expect(preview.locator('svg')).toBeVisible()
  })
})
