import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { FIXTURE_DIR } from './render'

/**
 * The report an import leaves behind, in both directions.
 *
 * `importStatement` used to let an unexpected throw escape to the global
 * error boundary, and `experimental.useOffline` (next.config.ts) replays a
 * failed Server Action forever with no message of its own. Both failure
 * modes look identical from the button: `pending` stays true. What this
 * checks is the report those failures now produce instead of silence, and
 * that the panel showing it is still usable on a phone.
 */

async function open(page: import('@playwright/test').Page, fixture: string) {
  await page.setContent(readFileSync(`${FIXTURE_DIR}/${fixture}.html`, 'utf8'))
  await page.evaluate(() => document.fonts.ready)
}

test.describe('laporan impor', () => {
  test('names the stage a failure stopped at, and whether anything saved', async ({ page }) => {
    await open(page, 'impor-laporan-gagal')

    const panel = page.getByRole('status')
    await expect(panel).toContainText('Impor berhenti saat menyimpan.')
    await expect(panel).toContainText('Mengunggah berkas yang sama lagi aman')
  })

  test('still shows the full success report', async ({ page }) => {
    await open(page, 'impor-laporan-sukses')

    const panel = page.getByRole('status')
    await expect(panel).toContainText('42 transaksi masuk')
    await expect(page.getByText('Perlu ditinjau')).toBeVisible()
  })

  // The 44px floor and the zero-overflow rule are already swept across every
  // fixture, this pair included, by `pnpm test:e2e:mobile`.
})
