import { readFile, readdir } from 'node:fs/promises'
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { FIXTURE_DIR } from './render'

/**
 * What a phone knows that a 1280px window does not.
 *
 * Every fixture in the corpus, at the width and with the pointer a phone
 * actually has. Four things are checked here and each of them is a bug that has
 * already been in this repo:
 *
 *   - a document wider than the screen, which turns reading into dragging
 *   - a control under 16px, which makes iOS Safari zoom on every focus
 *   - a control under 44px, which is a target a finger cannot reliably hit
 *   - contrast and naming, which were only ever measured at desktop width
 *
 * Deliberately generic, for the reason `geometry.ts` gives: an assertion
 * written per component protects the component it was written for, and this
 * protects every component added afterwards by anyone who never reads this
 * file.
 */

/* axe is roughly two thirds of a second per page, twice over for the two colour
   schemes, across the whole corpus. The work is legitimate; the default budget
   was simply never stated. */
test.describe.configure({ timeout: 180_000 })

async function fixtures(): Promise<string[]> {
  const files = await readdir(FIXTURE_DIR)
  return files.filter((name) => name.endsWith('.html')).sort()
}

async function open(page: Page, fixture: string) {
  await page.setContent(await readFile(`${FIXTURE_DIR}/${fixture}`, 'utf8'))
  // Geometry is read off laid-out boxes, and those move when the real face
  // replaces the fallback mid-run.
  await page.evaluate(() => document.fonts.ready)

  /*
    And settled boxes, not moving ones. The page fades up on arrival, and a
    contrast ratio sampled halfway through that reads whatever opacity the
    animation happened to be at, which is a failure the finished page does not
    have.

    Endless ones are skipped rather than awaited. The loading skeleton sweeps
    forever by design, so waiting for it to finish waits for the timeout.
  */
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  )
}


test('the device really reports a coarse pointer', async ({ page }) => {
  /*
    Half of this suite would pass vacuously otherwise. The touch target floor in
    `globals.css` lives behind `@media (pointer: coarse)`, so a runner that
    reports a mouse measures an application nobody uses.
  */
  await open(page, (await fixtures())[0])

  expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true)
  expect(await page.evaluate(() => window.innerWidth)).toBeLessThanOrEqual(430)
})

test('nothing widens the document', async ({ page }) => {
  const wide: { fixture: string; doc: number; body: number; widest: string[] }[] = []
  const width = await page.evaluate(() => window.innerWidth)

  for (const fixture of await fixtures()) {
    await open(page, fixture)

    const measured = await page.evaluate((limit) => {
      const widest = [...document.querySelectorAll<HTMLElement>('body *')]
        .filter((node) => Math.round(node.getBoundingClientRect().right) > limit + 1)
        // The element that actually sticks out, not every ancestor containing it.
        .filter((node) => !node.firstElementChild)
        .slice(0, 5)
        .map((node) => `${node.tagName.toLowerCase()}.${node.className}`.slice(0, 90))

      return { doc: document.documentElement.scrollWidth, body: document.body.scrollWidth, widest }
    }, width)

    if (measured.doc > width || measured.body > width) wide.push({ fixture, ...measured })
  }

  expect(wide, `fixtures wider than the ${width}px screen`).toEqual([])
})

test('no table has to be dragged sideways to be read', async ({ page }) => {
  /*
    The check the overflow test cannot make.

    A table 672px wide inside `overflow-x-auto` never widens the document: it
    scrolls inside its own box, and every assertion about the page passes while
    the ledger is still read one column at a time. This is the one that fails
    when a table is added without the card list beside it.

    A region that is meant to be panned says so in the markup with
    `data-pannable`. A drawing is panned; a ledger is not.
  */
  const dragged: { fixture: string; over: number; where: string }[] = []

  for (const fixture of await fixtures()) {
    await open(page, fixture)

    dragged.push(
      ...(await page.evaluate((name) => {
        const bad: { fixture: string; over: number; where: string }[] = []

        for (const node of document.querySelectorAll<HTMLElement>('*')) {
          if (node.closest('[data-pannable]')) continue

          const overflow = getComputedStyle(node).overflowX
          if (overflow !== 'auto' && overflow !== 'scroll') continue

          const over = node.scrollWidth - node.clientWidth
          if (over <= 1) continue

          bad.push({
            fixture: name,
            over,
            where: node.getAttribute('aria-label') ?? node.className.slice(0, 70),
          })
        }

        return bad
      }, fixture)),
    )
  }

  expect(dragged, 'content that can only be read by dragging it sideways').toEqual([])
})

test('no control is small enough to make iOS zoom', async ({ page }) => {

  /*
    Safari zooms the viewport when a focused control computes under 16px, and
    the page cannot decline it: the viewport meta cannot forbid it and
    `-webkit-text-size-adjust` does not govern it. 14px is the right size for
    this application everywhere else, and `text-sm` is what anyone would reach
    for, so this is the only thing keeping the floor.
  */
  const small: { fixture: string; where: string; size: string }[] = []

  for (const fixture of await fixtures()) {
    await open(page, fixture)

    small.push(
      ...(await page.evaluate((name) => {
        const bad: { fixture: string; where: string; size: string }[] = []

        type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
        for (const node of document.querySelectorAll<Control>('input, select, textarea')) {
          if (node.type === 'hidden') continue
          // A checkbox or radio renders no text, so its font size is moot.
          if (node.type === 'checkbox' || node.type === 'radio') continue
          if (node.getBoundingClientRect().width === 0) continue

          const size = Number.parseFloat(getComputedStyle(node).fontSize)
          if (size >= 16) continue

          bad.push({
            fixture: name,
            where: `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ''}.${node.className}`.slice(0, 90),
            size: `${size}px`,
          })
        }

        return bad
      }, fixture)),
    )
  }

  expect(small, 'controls under 16px, which iOS Safari zooms into on focus').toEqual([])
})

/*
  Links that are genuinely inside a sentence, which WCAG exempts and which would
  break the line box if they were padded to 44px. Everything else that can be
  tapped has to clear it. Kept as a list rather than a rule so that adding to it
  is a deliberate act with a name attached.
*/
const INLINE_LINK = ['.underline-offset-2']

test('every target a finger has to hit is at least 44px', async ({ page }) => {
  const small: { fixture: string; where: string; box: string }[] = []

  for (const fixture of await fixtures()) {
    await open(page, fixture)

    small.push(
      ...(await page.evaluate(
        ({ name, exempt }) => {
          const bad: { fixture: string; where: string; box: string }[] = []
          const selector = 'a[href], button, select, summary, [role="button"], [role="radio"]'

          for (const node of document.querySelectorAll<HTMLElement>(selector)) {
            if (exempt.some((sel) => node.matches(sel))) continue

            const box = node.getBoundingClientRect()
            // Not rendered on this breakpoint, so not a target on it either.
            if (box.width === 0 || box.height === 0) continue
            if (box.height >= 44 && box.width >= 24) continue

            bad.push({
              fixture: name,
              where: `${node.tagName.toLowerCase()}.${node.className}`.slice(0, 90),
              box: `${Math.round(box.width)}x${Math.round(box.height)}`,
            })
          }

          return bad
        },
        { name: fixture, exempt: INLINE_LINK },
      )),
    )
  }

  expect(small, 'tap targets under 44px tall').toEqual([])
})

for (const scheme of ['light', 'dark'] as const) {
  test(`every fixture passes axe at phone width in ${scheme} mode`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme })

    const failures: { fixture: string; id: string; where: string[]; why: string }[] = []

    for (const fixture of await fixtures()) {
      await open(page, fixture)

      const { violations } = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()

      for (const violation of violations) {
        failures.push({
          fixture,
          id: violation.id,
          where: violation.nodes.map((node) => node.target.join(' ')),
          why: violation.nodes[0]?.failureSummary ?? violation.help,
        })
      }
    }

    expect(failures).toEqual([])
  })
}
