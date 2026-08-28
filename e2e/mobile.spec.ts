import { readFile, readdir } from 'node:fs/promises'
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { dirtyFormAncestor, pannableAncestor } from '../src/components/use-swipe-tabs'
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

test('no control hides the value it is holding', async ({ page }) => {
  /*
    The bug the 16px rule caused while fixing another one.

    Raising every control to 16px below `sm` stops iOS zooming on focus, and it
    also makes every string inside those controls wider. A budget field that was
    144px for a reason on a desktop then held `Rp 1.300.` of `Rp 1.300.000` and
    said nothing about the rest: an input does not scroll a bar, so a figure
    that does not fit simply ends.

    That is the worst way for this application in particular to fail. Figures
    are `tnum font-mono` here so they can be checked by eye, and a truncated one
    still reads as a whole number somebody chose.

    Nothing else in this suite could see it. Overflow tests ask about the
    document, tap-target tests ask about the box; both are satisfied by a field
    that quietly holds more than it shows.
  */
  const hidden: { fixture: string; where: string; shows: string; needs: string }[] = []

  for (const fixture of await fixtures()) {
    await open(page, fixture)

    hidden.push(
      ...(await page.evaluate((name) => {
        const bad: { fixture: string; where: string; shows: string; needs: string }[] = []

        type Control = HTMLInputElement | HTMLTextAreaElement
        for (const node of document.querySelectorAll<Control>('input, textarea')) {
          if (node instanceof HTMLInputElement) {
            if (node.type === 'hidden' || node.type === 'checkbox' || node.type === 'radio') continue
          }
          if (node.getBoundingClientRect().width === 0) continue
          // A textarea wraps, so more content than box is a scrollbar, not a loss.
          if (node instanceof HTMLTextAreaElement) continue
          if (node.scrollWidth <= node.clientWidth + 1) continue

          bad.push({
            fixture: name,
            where: `${node.id ? `#${node.id}` : node.name || node.tagName.toLowerCase()}: ${node.value}`,
            shows: `${node.clientWidth}px`,
            needs: `${node.scrollWidth}px`,
          })
        }

        return bad
      }, fixture)),
    )
  }

  expect(hidden, 'controls showing less than they hold').toEqual([])
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

test('focus never lands behind the furniture pinned to the screen', async ({ page }) => {
  /*
    WCAG 2.2 2.4.11. A fixed bar does not occupy space as far as scrolling is
    concerned, so the browser considers a row sitting behind it to be in view
    and does not move. Two rows of the ledger were completely covered by the tab
    bar this way, and a keyboard user would have had no idea where they were.

    `scroll-padding-bottom` in globals.css is the fix, and this is what holds it.
    Written against anything fixed rather than against the tab bar, because the
    offline banner is fixed too and the next one will be as well.

    Only the fixtures that have such furniture are walked. Focusing every
    control on all sixty fixtures to prove that a page with nothing pinned to it
    cannot cover anything would cost two minutes to learn nothing.
  */
  const covered: { fixture: string; where: string; over: number }[] = []

  for (const fixture of await fixtures()) {
    await open(page, fixture)

    covered.push(
      ...(await page.evaluate(async (name) => {
        const settle = () =>
          new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))

        const pinned = [...document.querySelectorAll<HTMLElement>('body *')].filter(
          (node) => getComputedStyle(node).position === 'fixed',
        )
        if (pinned.length === 0) return []

        const bad: { fixture: string; where: string; over: number }[] = []
        const selector = 'a[href], button, input, select, textarea, summary, [tabindex="0"]'

        for (const node of document.querySelectorAll<HTMLElement>(selector)) {
          if (pinned.some((fixed) => fixed.contains(node))) continue
          if (node.getBoundingClientRect().height === 0) continue

          window.scrollTo(0, 0)
          await settle()
          node.focus()
          await settle()

          const box = node.getBoundingClientRect()
          for (const fixed of pinned) {
            const over = fixed.getBoundingClientRect()
            if (over.width === 0 || over.height === 0) continue

            const overlap =
              Math.min(box.bottom, over.bottom) - Math.max(box.top, over.top) > 0 &&
              Math.min(box.right, over.right) - Math.max(box.left, over.left) > 0
            if (!overlap) continue

            bad.push({
              fixture: name,
              where: (node.textContent ?? node.tagName).trim().slice(0, 40),
              over: Math.round(Math.min(box.bottom, over.bottom) - Math.max(box.top, over.top)),
            })
          }
        }

        return bad
      }, fixture)),
    )
  }

  expect(covered, 'focused controls covered by something fixed to the screen').toEqual([])
})

test('the swipe stands aside exactly where the page can be panned', async ({ page }) => {
  /*
    The half of the swipe that a unit runner cannot answer.

    `use-swipe-tabs.test.ts` covers the sums. This covers the one rule that
    needs a browser: a swipe beginning inside something that scrolls sideways
    belongs to that thing, not to the navigation. Getting it wrong does not make
    the gesture feel rough, it makes every chart in the application impossible
    to pan, and both `overflow-x` and `scrollWidth` are answers only a laid-out
    page has.

    The function's own source is lifted into the page rather than reimplemented
    here, because a copy of the rule would pass while the rule was broken.
  */
  const wrong: { fixture: string; where: string; expected: string }[] = []

  for (const fixture of await fixtures()) {
    await open(page, fixture)
    await page.addScriptTag({ content: `window.__pannable = ${pannableAncestor.toString()}` })

    wrong.push(
      ...(await page.evaluate((name) => {
        const decides = (window as unknown as { __pannable: (n: Element) => boolean }).__pannable
        const bad: { fixture: string; where: string; expected: string }[] = []
        const label = (node: Element) =>
          `${node.tagName.toLowerCase()}.${node.className}`.slice(0, 60)

        for (const region of document.querySelectorAll('[data-pannable]')) {
          // At this width the region may not overflow at all, and a region with
          // nothing to pan is not one the gesture has to stand aside for.
          if (region.scrollWidth <= region.clientWidth + 1) continue

          // Where a finger would actually land: on the drawing, not the box.
          let deepest: Element = region
          while (deepest.firstElementChild) deepest = deepest.firstElementChild

          if (!decides(deepest)) {
            bad.push({ fixture: name, where: label(deepest), expected: 'left to the region' })
          }
        }

        // And the opposite error, which is the gesture quietly disappearing:
        // the ledger scrolls nowhere, so a swipe across it is a swipe.
        for (const row of document.querySelectorAll('a[href^="/transaksi/"]')) {
          if (decides(row)) {
            bad.push({ fixture: name, where: label(row), expected: 'left to the navigation' })
          }
        }

        return bad
      }, fixture)),
    )
  }

  expect(wrong, 'swipes handed to the wrong owner').toEqual([])
})

test('the swipe stands aside once a form has work in it', async ({ page }) => {
  /*
    The refusal that is about the user rather than about the page.

    A swipe navigates, and navigating unmounts whatever was half typed. The
    entry screen is taller than the phone, so a thumb crosses it constantly.

    Both halves of the rule are checked here, and the second is the one that
    would quietly rot: a form is common in this application, and a guard that
    declined on any form at all would take the gesture off the report screen,
    whose filters are a form that is almost always untouched. So an untouched
    form must still swipe.

    Needs a browser for the same reason the pannable check does. `defaultValue`
    is the parser's record of what the markup said, and only a parser has one.
  */
  await open(page, 'catat-entry.html')
  await page.addScriptTag({ content: `window.__dirty = ${dirtyFormAncestor.toString()}` })

  const verdicts = await page.evaluate(() => {
    const decides = (window as unknown as { __dirty: (n: Element) => boolean }).__dirty
    const field = document.querySelector<HTMLInputElement>('input[type="text"], input:not([type])')
    const form = field?.closest('form')
    const outside = document.querySelector('h1') ?? document.body

    if (!field || !form) return { found: false }

    const pristine = decides(field)
    field.value = `${field.value} catatan yang belum tersimpan`
    const afterTyping = decides(field)
    field.value = field.defaultValue

    return {
      found: true,
      pristine,
      afterTyping,
      restored: decides(field),
      outsideAnyForm: decides(outside),
    }
  })

  expect(verdicts.found, 'the entry fixture no longer has a text field in a form').toBe(true)
  expect(verdicts.pristine, 'an untouched form must still swipe').toBe(false)
  expect(verdicts.afterTyping, 'a form with typing in it must not').toBe(true)
  expect(verdicts.restored, 'putting the value back makes it swipeable again').toBe(false)
  expect(verdicts.outsideAnyForm, 'nothing outside a form is affected').toBe(false)
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
