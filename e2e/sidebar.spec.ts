import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { FIXTURE_DIR } from './render'

/**
 * The desktop nav, now a sidebar rather than a row of underlined links.
 *
 * Two states share one fixture pair: `shell-ringkasan` (expanded, the
 * cookie absent) and `shell-lipat` (`data-sidebar="collapsed"` stamped on
 * `<html>` the way the root layout stamps it from the cookie). Between
 * `sm` and `lg` the rail is forced regardless of either, which is its own
 * assertion below rather than a third fixture.
 */

async function open(page: import('@playwright/test').Page, fixture: string) {
  await page.setContent(readFileSync(`${FIXTURE_DIR}/${fixture}.html`, 'utf8'))
  await page.evaluate(() => document.fonts.ready)
}

test.describe('sidebar', () => {
  test('expanded: every destination, one current page, the wordmark and sign-out', async ({
    page,
  }) => {
    await open(page, 'shell-ringkasan')

    const nav = page.locator('nav[aria-label="Halaman utama"].bg-sunken')
    const box = await nav.boundingBox()
    expect(box?.width).toBeGreaterThan(200)
    expect(box?.width).toBeLessThan(240)

    await expect(nav.locator('a[href]')).toHaveCount(10)
    await expect(nav.locator('a[aria-current="page"]')).toHaveCount(1)
    await expect(nav).toContainText('FiFoFun')
    await expect(nav.getByRole('button', { name: 'Keluar' })).toBeVisible()

    const toggle = nav.getByRole('button', { name: 'Lipat navigasi' })
    await expect(toggle).toBeVisible()
  })

  test('folded: a rail, every link still named, the toggle offers to expand', async ({ page }) => {
    await open(page, 'shell-lipat')

    const nav = page.locator('nav[aria-label="Halaman utama"].bg-sunken')
    const box = await nav.boundingBox()
    expect(box?.width).toBeLessThan(70)

    const toggle = nav.getByRole('button', { name: 'Bentangkan navigasi' })
    await expect(toggle).toBeVisible()

    const links = await nav.locator('a[href]').all()
    expect(links.length).toBe(10)
    for (const link of links) {
      expect((await link.getAttribute('aria-label')) ?? (await link.innerText())).toBeTruthy()
      const linkBox = await link.boundingBox()
      expect(linkBox?.height).toBeGreaterThanOrEqual(44)
    }
  })

  test('between sm and lg the rail is forced, and the toggle has nothing to toggle', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 800, height: 900 })
    await open(page, 'shell-ringkasan')

    const nav = page.locator('nav[aria-label="Halaman utama"].bg-sunken')
    const box = await nav.boundingBox()
    expect(box?.width).toBeLessThan(70)
    await expect(nav.getByRole('button', { name: /navigasi/ })).toBeHidden()
  })

  test('below sm the sidebar yields entirely to the bottom bar', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await open(page, 'shell-ringkasan')

    await expect(page.locator('nav[aria-label="Halaman utama"].bg-sunken')).toBeHidden()
    await expect(page.locator('nav[aria-label="Halaman utama"].material')).toBeVisible()
  })

  test('main sits clear of the sidebar, and nothing pushes the page sideways', async ({
    page,
  }) => {
    await open(page, 'shell-ringkasan')

    const navBox = await page.locator('nav[aria-label="Halaman utama"].bg-sunken').boundingBox()
    const mainBox = await page.locator('main#main').boundingBox()
    expect(mainBox!.x).toBeGreaterThanOrEqual(navBox!.x + navBox!.width)

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })

  test('the loading shell draws the same sidebar and main geometry as the real one', async ({
    page,
  }) => {
    await open(page, 'shell-ringkasan')
    const real = {
      nav: await page.locator('nav[aria-label="Halaman utama"].bg-sunken').boundingBox(),
      main: await page.locator('main#main').boundingBox(),
    }

    await open(page, 'shell-loading')
    const loading = {
      nav: await page.locator('nav[aria-label="Halaman utama"].bg-sunken').boundingBox(),
      main: await page.locator('main#main').boundingBox(),
    }

    // The sidebar's own geometry is identical either way: same items, same
    // height. `main`'s column has to start at the same x and hold the same
    // width — that is the drift this guards against — but its y and height
    // are content-dependent (this fixture pair does not even pass the same
    // `lead`, and a skeleton is not the height of the table it stands in
    // for), so only the horizontal placement is asserted for it.
    for (const key of ['x', 'y', 'width', 'height'] as const) {
      expect(loading.nav?.[key]).toBeCloseTo(real.nav![key], 0)
    }
    for (const key of ['x', 'width'] as const) {
      expect(loading.main?.[key]).toBeCloseTo(real.main![key], 0)
    }
  })
})
