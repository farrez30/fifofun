import { expect, type Page } from '@playwright/test'

/**
 * The check that would have caught the collapsed bars.
 *
 * Every mark sized as a percentage is found in the live document and measured.
 * A mark that asks for a share of its container and gets nothing is the failure
 * mode, and it is invisible to every other kind of test in this repo: the value
 * is correct, the class names are correct, the markup is correct, and the
 * picture is blank.
 *
 * Deliberately generic. A per-chart assertion protects the chart it was written
 * for; this protects every chart written afterwards by anyone who never reads
 * this file.
 */
export async function expectMarksToRender(page: Page) {
  const collapsed = await page.evaluate(() => {
    const bad: { axis: string; declared: string; measured: number; html: string }[] = []

    for (const node of document.querySelectorAll<HTMLElement>('[style]')) {
      const box = node.getBoundingClientRect()

      for (const axis of ['height', 'width'] as const) {
        const declared = node.style[axis]
        // Anywhere in the value, not only the whole of it: a bar written as
        // max(2px, 40%) is still a bar sized by its container, and reading only
        // whole-percentage values let a chart out of this check entirely.
        const share = /(\d+(?:\.\d+)?)%/.exec(declared)
        if (!share) continue
        // A mark legitimately asking for none of the space is not a failure.
        if (Number.parseFloat(share[1]) <= 0) continue

        const measured = axis === 'height' ? box.height : box.width
        if (measured >= 1) continue

        bad.push({ axis, declared, measured, html: node.outerHTML.slice(0, 120) })
      }
    }

    return bad
  })

  expect(collapsed, 'marks sized as a percentage that rendered smaller than a pixel').toEqual([])
}

/** How tall each element matching the selector rendered, in document order. */
export function heightsOf(page: Page, selector: string): Promise<number[]> {
  return page.$$eval(selector, (nodes) =>
    nodes.map((node) => Math.round(node.getBoundingClientRect().height)),
  )
}
