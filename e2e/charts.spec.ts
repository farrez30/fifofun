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

    const income = await heightsOf(page, '[data-series="masuk"]')
    const spending = await heightsOf(page, '[data-series="keluar"]')

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
    const income = await heightsOf(page, '[data-series="masuk"]')

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

test.describe('uang yang belum diberi pos', () => {
  test('separates what was never assigned from what survived the month', async ({ page }) => {
    await open(page, 'budget-manual')
    const text = await page.locator('figure').innerText()

    // Rp6 juta earned against Rp4,8 juta budgeted.
    expect(text).toContain('Rp1.200.000')
    expect(text).toContain('belum diberi pos')
    // Sisa uang is a different figure and the panel has to say so, or the two
    // get read as the same number in two places.
    expect(text).toContain('bukan sisa uang')
  })

  test('says outright when the plan cannot close', async ({ page }) => {
    await open(page, 'budget-overcommitted')
    const text = await page.locator('figure').innerText()

    // Rp7,5 juta budgeted against Rp6 juta of income. Every row looks fine on
    // its own, which is exactly why the total needs saying.
    expect(text).toContain('Rp1.500.000 lebih besar dari pemasukan')
    expect(text).not.toContain('belum diberi pos')
  })

  test('stays silent where nothing was ever allocated', async ({ page }) => {
    await open(page, 'budget-derived')
    // The derived figures are a median of past months, not an allocation, so
    // there is no such thing as money left over from it.
    expect(await page.locator('figure').innerText()).not.toContain('belum diberi pos')
  })
})

test.describe('perbandingan dengan bulan sebelumnya', () => {
  test('says which way each headline moved, and by how much', async ({ page }) => {
    await open(page, 'stats')
    const cards = await page.locator('div.border').allInnerTexts()

    // Case insensitive: the labels are uppercased in CSS, and innerText reports
    // what the screen shows rather than what the markup says.
    // Rp6.587.500 to Rp8.171.629 is a rise of Rp1,6 juta, twenty four percent.
    expect(cards.some((card) => /Pemasukan[\s\S]*▲[\s\S]*Rp1,6jt[\s\S]*\(24%\)/i.test(card))).toBe(
      true,
    )
    // Rp4.324.411 down to Rp3.830.737.
    expect(cards.some((card) => /Pengeluaran[\s\S]*▼[\s\S]*Rp493,7rb/i.test(card))).toBe(true)
  })

  test('has a third thing to say when nothing changed', async ({ page }) => {
    await open(page, 'stats')
    await expect(page.getByText('Sama persis dari bulan sebelumnya')).toBeVisible()
  })

  test('says nothing at all on the first month recorded', async ({ page }) => {
    await open(page, 'stats')
    const card = page.locator('div.border', { hasText: 'Sisa uang' }).last()
    await expect(card).not.toContainText('bulan sebelumnya')
    await expect(card).not.toContainText('▲')
  })

  test('leaves the judgement to the household, and uses no colour for it', async ({ page }) => {
    await open(page, 'stats')

    /*
      More spending is not automatically worse and more income is not
      automatically better. A month with a large Kesehatan bill and a month with
      a large Belanja bill move this line identically.
    */
    const colours = await page.$$eval('p', (nodes) =>
      nodes
        .filter((node) => /bulan sebelumnya|dari 2026-01/.test(node.textContent ?? ''))
        .map((node) => getComputedStyle(node).color),
    )
    expect(colours.length).toBeGreaterThan(0)
    expect(new Set(colours).size).toBeLessThanOrEqual(2)
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

test.describe('penanda tahun lahir', () => {
  test('is a real slider, announced and reachable', async ({ page }) => {
    await open(page, 'crunch-interactive')

    const pins = page.getByRole('slider')
    await expect(pins).toHaveCount(2)

    for (const pin of await pins.all()) {
      // A marker that cannot say where it is is useless without eyes.
      await expect(pin).toHaveAttribute('aria-label', /Tahun lahir/)
      await expect(pin).toHaveAttribute('aria-valuenow', /^\d{4}$/)
      await expect(pin).toHaveAttribute('aria-valuetext', /^\d{4}$/)
    }
  })

  test('puts each marker on the column it names', async ({ page }) => {
    await open(page, 'crunch-interactive')
    await expectMarksToRender(page)

    const offsets = await page.getByRole('slider').evaluateAll((pins) =>
      pins.map((pin) => {
        const box = pin.getBoundingClientRect()
        const centre = box.left + box.width / 2
        const label = pin.getAttribute('aria-valuenow')
        const column = [...document.querySelectorAll('[title]')].find((node) =>
          node.getAttribute('title')?.includes(`, ${label}:`),
        )
        if (!column) return null
        const target = column.getBoundingClientRect()
        return Math.abs(centre - (target.left + target.width / 2))
      }),
    )

    // Within a column's width of the bar it points at. Dividing by count - 1
    // instead of centring put these half a column out at both ends.
    for (const offset of offsets) {
      if (offset === null) continue
      expect(offset).toBeLessThan(12)
    }
  })

  test('keeps a finger-sized target', async ({ page }) => {
    await open(page, 'crunch-interactive')
    const boxes = await page
      .getByRole('slider')
      .evaluateAll((pins) => pins.map((pin) => pin.getBoundingClientRect().width))
    for (const width of boxes) expect(width).toBeGreaterThanOrEqual(44)
  })
})

test.describe('air terjun saldo', () => {
  /** Every bar, left to right edge, in the order the chart lists them. */
  function bars(page: import('@playwright/test').Page) {
    return page.$$eval('[data-step]', (nodes) =>
      nodes.map((node) => {
        const box = node.getBoundingClientRect()
        return { id: node.getAttribute('data-step') ?? '', left: box.left, right: box.right }
      }),
    )
  }

  test('draws one bar per term that moved, and none for the rest', async ({ page }) => {
    await open(page, 'waterfall')
    await expectMarksToRender(page)

    // Investasi, sinking fund, tujuan and cicilan were all nothing in February.
    // A row per zero would be four labels explaining that nothing happened.
    expect((await bars(page)).map((bar) => bar.id)).toEqual([
      'opening',
      'income',
      'bills',
      'spending',
      'piutang',
      'closing',
    ])
  })

  test('starts each step where the last one finished', async ({ page }) => {
    await open(page, 'waterfall')

    /*
      The whole claim of a waterfall is that the bars chain, and the connector
      line drawn in each row is where the previous running total landed. A bar
      that does not meet its own connector means the running total jumped with
      no term to explain it, and nothing in the picture would say so.

      That the connector sits at the previous total is arithmetic, and is
      asserted in the unit tests. What can only be measured here is whether the
      bar was laid out against it.
    */
    const gaps = await page.$$eval('[data-continues-from]', (lines) =>
      lines.map((line) => {
        const row = line.parentElement
        const bar = row?.querySelector('[data-step]')
        if (!bar) return null
        const at = line.getBoundingClientRect().left
        const box = bar.getBoundingClientRect()
        return {
          from: line.getAttribute('data-continues-from'),
          gap: Math.min(Math.abs(box.left - at), Math.abs(box.right - at)),
        }
      }),
    )

    expect(gaps).toHaveLength(5)
    for (const entry of gaps) {
      expect(entry, 'a connector with no bar beside it').not.toBeNull()
      expect(entry?.gap, `the bar after ${entry?.from} does not meet it`).toBeLessThan(2)
    }
  })

  test('sizes each step in proportion to what it moved', async ({ page }) => {
    await open(page, 'waterfall')
    const drawn = await bars(page)
    const width = (id: string) => {
      const bar = drawn.find((b) => b.id === id)
      if (!bar) throw new Error(`no bar for ${id}`)
      return bar.right - bar.left
    }

    // Rp3.830.737 of spending against Rp2.690.151 of bills is 1,424.
    expect(width('spending') / width('bills')).toBeGreaterThan(1.38)
    expect(width('spending') / width('bills')).toBeLessThan(1.47)

    // Rp102.000 beside an axis reaching Rp12 juta is under one percent of the
    // plot, and rounding it away would delete a term from the reconciliation.
    expect(width('piutang')).toBeGreaterThan(0)
  })

  test('hangs the overdrawn month below zero, off the same line', async ({ page }) => {
    await open(page, 'waterfall-overdrawn')
    const drawn = await bars(page)
    const opening = drawn.find((bar) => bar.id === 'opening')
    const closing = drawn.find((bar) => bar.id === 'closing')

    // Both anchors are measured from zero, so the positive one begins where the
    // negative one ends. If they do not meet, the axis has lost its zero.
    expect(Math.abs((closing?.right ?? 0) - (opening?.left ?? 0))).toBeLessThan(2)
    expect(closing?.left ?? 0).toBeLessThan(opening?.left ?? 0)
  })

  test('fits a phone without hiding the amounts off the side', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 812 })
    await open(page, 'waterfall')

    /*
      The document not scrolling sideways is not the same as the chart being
      readable. Laid out in three columns this needed six hundred pixels, and
      what a phone showed on arrival was a stack of labels whose bars and
      figures were both parked past the right edge of a scroller.
    */
    const clipped = await page.$$eval('figure *', (nodes) =>
      nodes
        // The screen-reader table is meant to overflow its one pixel box. That
        // is how it stays out of the way, and nobody looks at it.
        .filter((node) => !node.closest('.sr-only'))
        .filter((node) => node.scrollWidth - node.clientWidth > 1)
        .map((node) => node.className || node.tagName),
    )
    expect(clipped).toEqual([])

    for (const row of await page.locator('ol > li').allInnerTexts()) {
      expect(row).toMatch(/Rp/)
    }

    // Five labels of "Rp30jt" do not fit across a plot this narrow, and the top
    // two used to print as "Rp30jtRp40jt". Checked either side of the breakpoint
    // that decides how many of them are drawn.
    for (const width of [320, 640]) {
      await page.setViewportSize({ width, height: 812 })

      const boxes = await page.$$eval('figure > div span', (nodes) =>
        nodes
          .filter((node) => node.getBoundingClientRect().width > 0)
          .map((node) => {
            const box = node.getBoundingClientRect()
            return { text: node.textContent ?? '', left: box.left, right: box.right }
          })
          .sort((a, b) => a.left - b.left),
      )

      expect(boxes.length, `no axis labels at ${width}px`).toBeGreaterThan(1)
      for (let i = 1; i < boxes.length; i++) {
        expect(
          boxes[i].left,
          `${boxes[i - 1].text} runs into ${boxes[i].text} at ${width}px`,
        ).toBeGreaterThanOrEqual(boxes[i - 1].right)
      }
    }
  })

  test('says which way each step went without relying on colour', async ({ page }) => {
    await open(page, 'waterfall')

    for (const row of await page.locator('ol > li').allInnerTexts()) {
      // Anchors are levels rather than movements and carry no arrow.
      if (/Saldo awal|Sisa uang/.test(row)) continue
      // An arrow and a sign for the eye, the word itself for a screen reader.
      expect(row).toMatch(/[▲▼]/)
      expect(row).toMatch(/[+−]/)
      expect(row).toMatch(/masuk|keluar/)
    }
  })
})

test.describe('tren saldo', () => {
  test('puts a point on every month, in the order they happened', async ({ page }) => {
    await open(page, 'balance-trend')
    await expectMarksToRender(page)

    const dots = await page.$$eval('[data-point]', (nodes) =>
      nodes.map((node) => ({
        month: node.getAttribute('data-point') ?? '',
        x: node.getBoundingClientRect().left,
        y: node.getBoundingClientRect().top,
      })),
    )

    expect(dots.map((dot) => dot.month)).toEqual([
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
      '2026-03',
    ])
    for (let i = 1; i < dots.length; i++) {
      expect(dots[i].x).toBeGreaterThan(dots[i - 1].x)
    }
  })

  test('puts the highest balance highest', async ({ page }) => {
    await open(page, 'balance-trend')
    const at = async (month: string) =>
      (await page.locator(`[data-point="${month}"]`).boundingBox())?.y ?? 0

    // February closed at Rp5,15jt and March at Rp2,45jt. Screen coordinates run
    // downwards, so the larger balance has to sit at the smaller y.
    expect(await at('2026-02')).toBeLessThan(await at('2026-03'))
    expect(await at('2026-02')).toBeLessThan(await at('2026-01'))
  })

  test('draws a line rather than an area, because the axis is cropped', async ({ page }) => {
    await open(page, 'balance-trend')

    /*
      A cropped floor is the only way to see a household's balance move, and it
      is exactly what makes a filled shape lie: the fill claims a ratio between
      the months that is not true. The chart says so in words as well.
    */
    const polyline = page.locator('svg polyline')
    await expect(polyline).toHaveCount(1)
    await expect(polyline).toHaveAttribute('fill', 'none')
    await expect(page.locator('figure')).toContainText('bukan nol')
    expect(await page.locator('svg polygon, svg path').count()).toBe(0)
  })

  test('keeps two years of markers off each other on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await open(page, 'balance-trend-long')

    const dots = await page.$$eval('[data-point]', (nodes) =>
      nodes
        .map((node) => {
          const box = node.getBoundingClientRect()
          return { month: node.getAttribute('data-point') ?? '', left: box.left, right: box.right }
        })
        .sort((a, b) => a.left - b.left),
    )

    expect(dots).toHaveLength(23)
    // Every month keeps its dot, because the dot is what carries the figure on
    // hover. What has to give at this density is their size.
    for (let i = 1; i < dots.length; i++) {
      const previous = dots[i - 1]
      // The lowest month and the last one are drawn large on purpose, and are
      // allowed to sit closer to their neighbour than the small ones do.
      if (previous.right - previous.left > 6 || dots[i].right - dots[i].left > 6) continue
      expect(dots[i].left, `${previous.month} and ${dots[i].month} overlap`).toBeGreaterThan(
        previous.right,
      )
    }
  })

  test('never claims to be net worth while it only counts money', async ({ page }) => {
    await open(page, 'balance-trend')
    const text = await page.locator('figure').innerText()
    expect(text).toContain('bukan kekayaan bersih')
  })
})

test.describe('kategori sepanjang bulan', () => {
  test('gives every month of every category a mark with height', async ({ page }) => {
    await open(page, 'category-sparks')
    await expectMarksToRender(page)

    const sparks = await page.locator('[data-spark]').count()
    expect(sparks).toBe(4)

    // Rp80.500 beside a Rp4,8 juta peak is under two percent of the card. A
    // quiet month that rounds away leaves the surge with nothing to be a
    // surge against.
    const heights = await heightsOf(page, '[data-spark="Jajan"] [data-month]')
    expect(heights).toHaveLength(3)
    for (const height of heights) expect(height).toBeGreaterThan(0)
    expect(heights[2]).toBeGreaterThan(heights[0] * 10)
  })

  test('marks the category that ran away and leaves the steady ones alone', async ({ page }) => {
    await open(page, 'category-sparks')

    const jajan = page.locator('li', { hasText: 'Jajan' }).first()
    await expect(jajan).toContainText('jauh di atas biasanya')
    await expect(jajan).toContainText('Rp4.801.400')

    // Bank charges moved by Rp9.200. Both this panel and the budget panel have
    // to agree that is not worth an alarm.
    await expect(page.locator('li', { hasText: 'Biaya Bank' }).first()).toContainText(
      'seperti biasa',
    )
  })

  test('scales each card to itself, and says so rather than inviting comparison', async ({
    page,
  }) => {
    await open(page, 'category-sparks')

    const jajan = await heightsOf(page, '[data-spark="Jajan"] [data-month]')
    const bank = await heightsOf(page, '[data-spark="Biaya Bank"] [data-month]')

    /*
      Rp45.700 and Rp4.801.400 both fill their own card, because the shape is
      the content here and a shared axis would flatten every category except
      the largest into a line. The figures beside each chart carry the size.
    */
    expect(Math.max(...bank)).toBe(Math.max(...jajan))
  })

  test('names the categories that moved, before anyone has to scan the cards', async ({
    page,
  }) => {
    await open(page, 'category-sparks')
    const summary = await page.locator('figure > p').first().innerText()
    expect(summary).toContain('Jajan')
    expect(summary).not.toContain('Biaya Bank')
  })
})

test.describe('pos dana', () => {
  test('subtracts what came back out of the pot', async ({ page }) => {
    await open(page, 'funds')
    const savings = page.locator('li', { hasText: 'Tabungan' }).first()

    // Rp500.000 in and Rp200.000 out. Counting only the deposits would show a
    // pot with money in it that nothing can be spent from.
    await expect(savings).toContainText('Rp300.000')
    await expect(savings).toContainText('Sudah diambil lagi Rp200.000')
  })

  test('compares the two monthly figures rather than only the progress', async ({ page }) => {
    await open(page, 'funds')
    const wedding = page.locator('li', { hasText: 'Dana Menikah' }).first()

    /*
      How far along a goal is decides almost nothing. Twelve percent with a year
      to run and ninety percent due next month are opposite situations, and only
      the pair of monthly figures separates them.
    */
    await expect(wedding).toContainText('Biasanya Rp2jt per bulan')
    await expect(wedding).toContainText('perlu Rp3,7jt per bulan sampai Mar 2027')
  })

  test('puts the deadline that will be missed at the top', async ({ page }) => {
    await open(page, 'funds')
    const names = await page.locator('li > div > span').first().innerText()
    expect(names).toContain('Dana Menikah')
    await expect(page.getByText('1 pos tidak akan sampai tepat waktu')).toBeVisible()
  })

  test('says nothing it cannot know about a pot with no target', async ({ page }) => {
    await open(page, 'funds')
    const savings = page.locator('li', { hasText: 'Tabungan' }).first()

    await expect(savings).toContainText('Belum ada target')
    // No bar either: a progress bar with no target is a bar against nothing.
    expect(await savings.locator('[data-fund]').count()).toBe(0)
  })

  test('gives every pot with a target a bar with width', async ({ page }) => {
    await open(page, 'funds')
    await expectMarksToRender(page)

    // Rp6 juta against Rp50 juta is twelve percent, and Rp14 juta against
    // Rp200 juta is seven. The smaller one still has to be visible.
    const widths = await page.$$eval('[data-fund]', (nodes) =>
      nodes.map((node) => node.getBoundingClientRect().width),
    )
    expect(widths).toHaveLength(2)
    for (const width of widths) expect(width).toBeGreaterThan(1)
  })

  test('does not leave a household of empty pots at a dead end', async ({ page }) => {
    await open(page, 'funds-untouched')
    const text = await page.locator('body').innerText()

    // Every pot set up and none of them ever fed. Answering that with rows of
    // Rp0 and nothing else is the same failure the bills panel had.
    expect(text).toContain('Belum ada setoran yang tercatat masuk ke satu pos pun')
    expect(text).toContain('mencatat setoran ke rekening tabungan sebagai transfer')
    await expect(page.getByRole('link', { name: /antrean tinjau/i })).toBeVisible()
  })

  test('offers the one figure a person decides, and no others', async ({ page }) => {
    await open(page, 'funds')

    const fields = await page.locator('form input:not([type="hidden"])').count()
    // Two per pot, three pots: the target and the month it is wanted by.
    expect(fields).toBe(6)

    // Folded away until asked for. Setting a target happens once and then not
    // again for a year, and three open forms would bury the three progress
    // bars that are the point of the page.
    await expect(page.getByRole('button', { name: 'Simpan' }).first()).toBeHidden()
    await page.getByText('Ubah target').first().click()
    await expect(page.getByRole('button', { name: 'Simpan' }).first()).toBeVisible()
  })
})

test.describe('jalan ke tujuan', () => {
  /** Every drawn mark that has to agree about where the target line is. */
  function onTarget(page: import('@playwright/test').Page) {
    return page.evaluate(`(() => {
      const mid = (el) => { const b = el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 } }
      const plot = document.querySelector('svg').getBoundingClientRect()
      const tail = (i) => {
        const points = [...document.querySelectorAll('polyline')][i].getAttribute('points').split(' ')
        const [x, y] = points[points.length - 1].split(',').map(Number)
        return { x: plot.left + (x / 100) * plot.width, y: plot.top + (y / 100) * plot.height }
      }
      const span = document.querySelector('[data-earned]')
      const spanBox = span ? span.getBoundingClientRect() : null
      return {
        investedMark: mid(document.querySelector('[data-mark="arrival-invested"]')),
        idleMark: mid(document.querySelector('[data-mark="arrival-idle"]')),
        investedTail: tail(1),
        idleTail: tail(0),
        span: spanBox ? { left: spanBox.left, right: spanBox.right, months: Number(span.getAttribute('data-earned')) } : null,
        pin: mid(document.querySelector('[role="slider"]')),
        pinYear: document.querySelector('[role="slider"]').getAttribute('aria-valuenow'),
      }
    })()`) as Promise<{
      investedMark: { x: number; y: number }
      idleMark: { x: number; y: number }
      investedTail: { x: number; y: number }
      idleTail: { x: number; y: number }
      span: { left: number; right: number; months: number } | null
      pin: { x: number; y: number }
      pinYear: string
    }>
  }

  test('lands both curves on the target, and both markers with them', async ({ page }) => {
    await open(page, 'glidepath')
    await expectMarksToRender(page)
    const marks = await onTarget(page)

    // The whole reading depends on this. If either curve stopped short of the
    // target, the distance measured off along it would be between two points
    // that mean different things.
    for (const [name, point] of [
      ['invested curve', marks.investedTail],
      ['idle curve', marks.idleTail],
      ['idle marker', marks.idleMark],
    ] as const) {
      expect(Math.abs(point.y - marks.investedMark.y), `${name} left the target line`).toBeLessThan(2)
    }
    expect(Math.abs(marks.investedTail.x - marks.investedMark.x)).toBeLessThan(2)
    expect(Math.abs(marks.idleTail.x - marks.idleMark.x)).toBeLessThan(2)
  })

  test('puts the marker on the year its own arrival lands in', async ({ page }) => {
    await open(page, 'glidepath')
    await expectMarksToRender(page)
    const marks = await onTarget(page)

    // The marker sets the deadline and the chart draws the consequence, so a
    // marker sitting anywhere other than on the arrival would be a control that
    // does not point at what it controls. Both are placed through `slotFraction`
    // for exactly this reason.
    expect(Math.abs(marks.pin.x - marks.investedMark.x)).toBeLessThan(2)
    expect(marks.pinYear).toBe('2036')
  })

  test('measures the years earned between the two arrivals', async ({ page }) => {
    await open(page, 'glidepath')
    await expectMarksToRender(page)
    const marks = await onTarget(page)

    expect(marks.span).not.toBeNull()
    expect(marks.span!.months).toBeGreaterThan(0)
    // Within a marker's width of each end, since the span is inset by its own
    // border so the dots read as caps rather than as part of the bar.
    expect(Math.abs(marks.span!.left - marks.investedMark.x)).toBeLessThan(6)
    expect(Math.abs(marks.span!.right - marks.idleMark.x)).toBeLessThan(6)
  })

  test('draws nothing above the target', async ({ page }) => {
    await open(page, 'glidepath')

    const above = await page.evaluate(`(() => {
      const target = document.querySelector('[data-mark="arrival-invested"]').getBoundingClientRect()
      const line = target.top + target.height / 2
      const plot = document.querySelector('svg').getBoundingClientRect()
      const ys = [...document.querySelectorAll('polyline, polygon')].flatMap((node) =>
        node.getAttribute('points').split(' ').map((pair) => plot.top + (Number(pair.split(',')[1]) / 100) * plot.height),
      )
      return Math.min(...ys) - line
    })()`)

    // A curve allowed to keep compounding past its target tripled the height of
    // the plot and squashed the approach, which is the only part anybody reads.
    expect(Number(above)).toBeGreaterThan(-2)
  })

  test('separates the two curves without relying on colour', async ({ page }) => {
    await open(page, 'glidepath')
    const dashes = await page
      .locator('polyline')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('stroke-dasharray')))

    // Red and green are the pair that roughly one man in twelve cannot separate,
    // and these two are not that pair, but a legend resting on hue alone is a
    // legend that works for most people rather than for everybody.
    expect(dashes.filter(Boolean)).toHaveLength(1)
    expect(dashes.filter((dash) => dash === null)).toHaveLength(1)
  })

  test('says so when money left alone never arrives at all', async ({ page }) => {
    await open(page, 'glidepath-patient')
    await expectMarksToRender(page)

    await expect(page.locator('[data-mark="arrival-idle"]')).toHaveCount(0)
    await expect(page.locator('[data-mark="arrival-invested"]')).toHaveCount(1)
    await expect(page.getByText(/tidak sampai ke sana dalam 40 tahun/i)).toBeVisible()
  })

  test('drops the plot entirely for a goal already paid for', async ({ page }) => {
    await open(page, 'glidepath-covered')

    // An empty plot with both markers stacked in one corner reads as a chart
    // that is broken, not as a goal that is finished.
    await expect(page.locator('svg')).toHaveCount(0)
    await expect(page.getByText(/Tidak ada yang perlu disetor/i)).toBeVisible()
    await expect(page.getByText(/Kelebihannya Rp5\.000\.000/)).toBeVisible()
  })

  test('keeps a finger-sized marker', async ({ page }) => {
    await open(page, 'glidepath')
    const width = await page
      .getByRole('slider')
      .evaluate((pin) => pin.getBoundingClientRect().width)
    expect(width).toBeGreaterThanOrEqual(44)
  })

  test('is a real slider, announced and reachable', async ({ page }) => {
    await open(page, 'glidepath')
    const pin = page.getByRole('slider')
    await expect(pin).toHaveCount(1)
    await expect(pin).toHaveAttribute('aria-label', /Tahun target/)
    await expect(pin).toHaveAttribute('aria-valuenow', /^\d{4}$/)
    await expect(pin).toHaveAttribute('aria-valuemin', '2026')
  })
})

test.describe('lebar halaman', () => {
  test('nothing pushes the page sideways on a narrow screen', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })

    for (const fixture of [
      'cashflow',
      'bills',
      'crunch-interactive',
      'sankey',
      'waterfall',
      'balance-trend',
      'category-sparks',
      'funds',
      'glidepath',
      'glidepath-soon',
    ]) {
      await open(page, fixture)

      const { doc, body } = await page.evaluate(() => ({
        doc: document.documentElement.scrollWidth,
        body: document.body.scrollWidth,
      }))

      /*
        `sr-only` is position:absolute, and overflow only clips a descendant
        whose containing block is inside the scroller. A scroll region left
        static therefore lets its screen-reader text escape and stretch the
        document, and the whole page scrolls sideways for text nobody can see.
      */
      expect(doc, `${fixture} widened the document`).toBeLessThanOrEqual(375)
      expect(body, `${fixture} widened the body`).toBeLessThanOrEqual(375)
    }
  })
})
