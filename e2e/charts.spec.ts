import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { expectMarksToRender, heightsOf } from './geometry'
import { FIXTURE_DIR } from './render'

/**
 * Charts, measured rather than looked at.
 *
 * The pages come from `fixtures.tsx`, which the test command renders first. See
 * the note there for why the rendering does not happen inside a spec.
 */

async function open(page: import('@playwright/test').Page, fixture: string) {
  await page.setContent(await readFile(`${FIXTURE_DIR}/${fixture}.html`, 'utf8'))
}

test.describe('pemasukan dan pengeluaran', () => {
  test('draws a bar for every month, tallest where the money is', async ({ page }) => {
    await open(page, 'cashflow')

    const income = await heightsOf(page, '[title^="Masuk "]')
    const spending = await heightsOf(page, '[title^="Keluar "]')

    expect(income).toHaveLength(4)
    expect(spending).toHaveLength(4)
    await expectMarksToRender(page)

    // November earned the most, so it owns the tallest income bar.
    expect(income.indexOf(Math.max(...income))).toBe(2)
    // October spent the most, and spent more than any month earned.
    expect(spending.indexOf(Math.max(...spending))).toBe(1)
    expect(Math.max(...spending)).toBeGreaterThan(Math.max(...income))

    // The quietest month still has to be visible, or the chart lies by omission.
    expect(Math.min(...spending)).toBeGreaterThan(0)
  })

  test('scales bars in proportion to the amounts', async ({ page }) => {
    await open(page, 'cashflow')
    const income = await heightsOf(page, '[title^="Masuk "]')

    // Rp6,1jt against Rp11,4jt is 0,535. Allow a pixel of rounding either way.
    const ratio = income[0] / income[2]
    expect(ratio).toBeGreaterThan(0.5)
    expect(ratio).toBeLessThan(0.57)
  })
})

test.describe('linimasa biaya anak', () => {
  test('gives every year of the projection a visible column', async ({ page }) => {
    await open(page, 'crunch')
    await expectMarksToRender(page)
    expect(await page.locator('[title*="Anak pertama"]').count()).toBeGreaterThan(0)
  })
})

test.describe('anggaran per kategori', () => {
  test('renders a bar and a marker for every line', async ({ page }) => {
    await open(page, 'budget-derived')
    await expectMarksToRender(page)
    await expect(page.locator('ul > li')).toHaveCount(3)
  })

  test('never calls a derived figure an anggaran', async ({ page }) => {
    await open(page, 'budget-derived')

    // Scoped to the rows. The paragraph above them invites the household to set
    // a real budget, and that one is allowed to use the word.
    for (const row of await page.locator('ul > li').allInnerTexts()) {
      expect(row).not.toContain('anggaran')
    }
    const rows = await page.locator('ul > li').allInnerTexts()
    expect(rows.some((row) => row.includes('biasanya Rp36.500'))).toBe(true)
  })

  test('marks the overruns that move the month and leaves the rest quiet', async ({ page }) => {
    await open(page, 'budget-derived')

    // Two real breaches carry the glyph. Rp9.200 of bank charges does not.
    expect(await page.locator('ul > li span[aria-hidden="true"]').count()).toBe(2)
    await expect(page.getByText('1 kategori lewat sedikit')).toBeVisible()
  })
})

test.describe('sankey', () => {
  test('gives every flow a ribbon with area', async ({ page }) => {
    await open(page, 'sankey')
    await expectMarksToRender(page)

    // Rp45.700 against Rp8jt is a hairline, and a hairline that rounds away
    // takes a whole category off the diagram without saying so.
    const areas = await page.$$eval('svg path, svg rect', (nodes) =>
      nodes.map((node) => {
        const box = node.getBoundingClientRect()
        return box.width * box.height
      }),
    )
    expect(areas.length).toBeGreaterThan(0)
    expect(areas.filter((area) => area === 0)).toEqual([])
  })
})

test.describe('tagihan rutin', () => {
  test('separates paid from due, and never by colour alone', async ({ page }) => {
    await open(page, 'bills')
    await expectMarksToRender(page)

    const rows = await page.locator('tbody tr').allInnerTexts()
    expect(rows.length).toBeGreaterThan(0)

    // Every row carries the state in words as well as in a glyph and a hue.
    for (const row of rows) {
      expect(row).toMatch(/Sudah dibayar|Belum dibayar|Lama tidak muncul/)
    }
  })

  test('quotes what an unpaid bill is going to cost', async ({ page }) => {
    await open(page, 'bills')
    const spotify = page.locator('tbody tr', { hasText: 'Langganan Spotify' })
    await expect(spotify).toContainText('Belum dibayar')
    // The usual amount is the point: an unpaid bill that cannot say what it
    // costs leaves the reader to go and look it up.
    await expect(spotify).toContainText('Rp104.900')
  })
})

test.describe('piutang', () => {
  test('reads the state from the ledger, not from the name', async ({ page }) => {
    await open(page, 'receivables')
    const text = await page.locator('body').innerText()

    // Alma paid the same day. The panel has to say so even though nothing in
    // the debt's own name changed.
    expect(text).toContain('Lunas')
    expect(text).toContain('Baru sebagian')
  })
})

test('never reports nothing-recorded as everything-paid', async ({ page }) => {
  await open(page, 'bills-untouched')
  const text = await page.locator('body').innerText()

  expect(text).not.toContain('sudah dibayar, Rp0')
  expect(text).toContain('Belum ada tagihan yang tercatat keluar bulan ini')
  // And it says what to do about it, rather than leaving a dead end.
  await expect(page.getByRole('link', { name: /antrean tinjau/i })).toBeVisible()
})
