import { readFile, readdir } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { FIXTURE_DIR } from './render'

/**
 * The width between a phone and a desktop.
 *
 * The phone suite proves no table has to be dragged sideways at 375px, and the
 * charts suite runs at 1280px. Neither saw a laptop pane, a tablet, or the
 * main column beside Catat's side notes: past `sm` every table switched to its
 * desktop form whether or not the column could hold it, and the ledger was
 * read one column at a time again (1 Oct 2026). The switch now follows the
 * table's own container, and this holds it there.
 */

test.describe.configure({ timeout: 180_000 })

/** Drawings may pan; a table may not, wherever it sits. Same rule as mobile.spec.ts. */
const PANNABLE = ['[role="region"][aria-label*="bisa digeser"]', '[role="region"]:has(> svg)', 'nav[aria-label="Bagian rencana"] > ul']

/*
  Two widths, because a table can fail between them: at 720px every card has
  already turned into its list, while at 960px a table may switch on and still
  be wider than its column. The map page's table did exactly that.
*/
for (const width of [720, 960]) test(`no table has to be dragged sideways at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 })
  const files = (await readdir(FIXTURE_DIR)).filter((name) => name.endsWith('.html')).sort()
  const dragged: { fixture: string; over: number; where: string }[] = []

  for (const fixture of files) {
    await page.setContent(await readFile(`${FIXTURE_DIR}/${fixture}`, 'utf8'))
    await page.evaluate(() => document.fonts.ready)

    dragged.push(
      ...(await page.evaluate(
        ({ name, allowed }) =>
          [...document.querySelectorAll<HTMLElement>('*')]
            .filter((node) => {
              const overflow = getComputedStyle(node).overflowX
              if (overflow !== 'auto' && overflow !== 'scroll') return false
              if (node.scrollWidth - node.clientWidth <= 1) return false
              const excused = allowed.some((sel) => node.matches(sel) || node.closest(sel))
              return !excused || Boolean(node.querySelector('table'))
            })
            .map((node) => ({
              fixture: name,
              over: node.scrollWidth - node.clientWidth,
              where: node.getAttribute('aria-label') ?? node.className.slice(0, 70),
            })),
        { name: fixture, allowed: PANNABLE },
      )),
    )
  }

  expect(dragged, 'content that can only be read by dragging it sideways').toEqual([])
})
