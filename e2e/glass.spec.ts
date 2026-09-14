import { readFile, readdir } from 'node:fs/promises'
import AxeBuilder from '@axe-core/playwright'
import { type Page, expect, test } from '@playwright/test'
import { FIXTURE_DIR } from './render'

/**
 * The rules a material brings, and the guarantee a material quietly removes.
 *
 * Glass is the only thing in this interface that cannot be checked by reading a
 * class name, because what it does depends entirely on what happens to be
 * behind it. Worse, it is the only thing that makes the existing sweeps quieter
 * rather than louder. axe works out a background by walking ancestors and
 * compositing the colours they declare; it has no idea what a backdrop filter
 * is sampling, and where it cannot resolve one it files the check under
 * `incomplete` rather than `violations`. Both sweeps read violations and
 * nothing else. So the day a bar went translucent, that bar would stop being
 * contrast checked and CI would go on saying everything was fine.
 *
 * Every test here was written and proved green while every surface in the
 * application was still opaque. A test that has never passed is not a guard.
 */

async function fixtures(): Promise<string[]> {
  const files = await readdir(FIXTURE_DIR)
  return files.filter((name) => name.endsWith('.html'))
}

/**
 * Load a fixture and wait for it to stop moving.
 *
 * The same two waits the other sweeps use, and for the same reasons: contrast
 * is read off rendered pixels, which move when the real face replaces the
 * fallback, and again while the shell fades its content up. The skeleton sweeps
 * forever on purpose, so it is skipped rather than waited for.
 */
async function open(page: Page, file: string): Promise<void> {
  await page.setContent(await readFile(`${FIXTURE_DIR}/${file}`, 'utf8'))
  await page.evaluate(() => document.fonts.ready)
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  )
}

test.describe.configure({ timeout: 180_000 })

test.describe('material', () => {
  /**
   * Glass floats. It never sits behind content, and never inside a chart.
   *
   * Apple's own rule rather than a preference: a translucent surface over
   * primary content destroys the contrast between sharp content and blurred
   * chrome, and over a flat surface it collapses into an expensive way of
   * drawing `rgba()`. A chart is the extreme case, where the blur is eating the
   * one thing the picture exists to say.
   *
   * The lint rule in `eslint.config.mjs` says the same thing about class names
   * and is worth keeping because it answers in a second. This one reads
   * computed style, so it also sees the material that arrived by inheritance,
   * through an arbitrary value, or out of a file somebody added to the
   * allowlist without thinking about what that file draws.
   */
  test('glass never sits behind content', async ({ page }) => {
    const offenders: { fixture: string; element: string; reason: string }[] = []

    for (const file of await fixtures()) {
      await open(page, file)

      const found = await page.evaluate(() => {
        const bad: { element: string; reason: string }[] = []

        for (const node of document.querySelectorAll<HTMLElement>('*')) {
          const style = getComputedStyle(node)
          const filter = style.backdropFilter || style.getPropertyValue('-webkit-backdrop-filter')
          if (!filter || filter === 'none') continue

          const name = `${node.tagName.toLowerCase()}.${node.className}`.slice(0, 90)
          const floats =
            style.position === 'fixed' ||
            style.position === 'sticky' ||
            node.closest('dialog') !== null

          if (!floats) {
            bad.push({ element: name, reason: `${style.position}, so it is content, not chrome` })
          }

          if (node.closest('figure, svg, table, [role="img"]') !== null) {
            bad.push({ element: name, reason: 'inside a chart or a table' })
          }
        }

        return bad
      })

      offenders.push(...found.map((one) => ({ fixture: file, ...one })))
    }

    expect(offenders).toEqual([])
  })

  /**
   * Every material has an opaque answer ready for whoever asks for one.
   *
   * Apple's own fallback makes glass frostier rather than removing it, so the
   * layout never moves and only the sampling stops. The second assertion is the
   * one worth having: dropping the alpha off a translucent tint and calling the
   * result opaque produces a colour nobody chose, and that is the version of
   * this which looks correct in a diff.
   */
  test('reduced transparency turns every material opaque', async ({ page, context }) => {
    const client = await context.newCDPSession(page)
    await client.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }],
    })

    const offenders: { fixture: string; element: string; reason: string }[] = []

    for (const file of await fixtures()) {
      await open(page, file)

      const found = await page.evaluate(() => {
        const bad: { element: string; reason: string }[] = []

        for (const node of document.querySelectorAll<HTMLElement>('*')) {
          const classes = typeof node.className === 'string' ? node.className : ''
          if (!/(^|\s)material(-|\s|$)/.test(classes)) continue

          const style = getComputedStyle(node)
          const name = `${node.tagName.toLowerCase()}.${classes}`.slice(0, 90)
          const filter = style.backdropFilter || style.getPropertyValue('-webkit-backdrop-filter')
          if (filter && filter !== 'none') {
            bad.push({ element: name, reason: `still sampling: ${filter}` })
          }

          const alpha = /rgba?\([^)]*?,\s*([\d.]+)\s*\)/.exec(style.backgroundColor)
          if (alpha && Number(alpha[1]) < 1) {
            bad.push({ element: name, reason: `still translucent: ${style.backgroundColor}` })
          }
        }

        return bad
      })

      offenders.push(...found.map((one) => ({ fixture: file, ...one })))
    }

    expect(offenders).toEqual([])
  })

  /**
   * Nothing is left parked halfway through an animation.
   *
   * The blunt reduced-motion block this replaced froze every animation in the
   * document at its first keyframe, which is harmless for a fade that starts at
   * zero opacity and wrong for anything that travels. A specular shimmer
   * written as an infinite keyframe would sit stopped mid-sweep for exactly the
   * readers who asked for calm, which is why the highlight in `globals.css` is
   * a static gradient rather than an animation.
   *
   * An animation still inside its delay is waiting rather than stuck, and the
   * skeleton gate depends on precisely that distinction.
   */
  test('less motion leaves nothing stopped in the middle', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })

    const stuck: { fixture: string; animation: string }[] = []

    for (const file of await fixtures()) {
      // `open` waits out every finite animation, which under this preference is
      // what the spatial ones have been replaced by. What must not survive that
      // wait is an endless one.
      await open(page, file)

      const found = await page.evaluate(() =>
        document
          .getAnimations()
          .filter((animation) => animation.playState === 'running')
          .map((animation) => (animation as CSSAnimation).animationName ?? 'unnamed'),
      )

      stuck.push(...found.map((animation) => ({ fixture: file, animation })))
    }

    expect(stuck).toEqual([])
  })

  /**
   * Contrast under increased contrast, and no silence over a material.
   *
   * The `incomplete` half is the reason this test exists. axe files a contrast
   * check there when it cannot work out what is behind an element, and over a
   * backdrop filter that is the ordinary case rather than an edge one, so
   * treating it as a pass is exactly how a glass bar stops being measured.
   *
   * It is deliberately narrowed to text that actually sits on a material.
   * Unresolved checks are not rare and most have nothing to do with glass: a
   * label over an absolutely positioned bar in a waterfall has been unresolved
   * since that chart was written, because axe cannot composite a sibling it
   * does not know is behind the text. Failing on those would be a rule about
   * charts wearing the name of a rule about materials, and it would be silenced
   * within a week. What this asserts is the narrow, enforceable thing: a
   * material never leaves the question unanswered.
   */
  for (const scheme of ['light', 'dark'] as const) {
    test(`contrast survives increased contrast in ${scheme} mode`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme, contrast: 'more' })

      const failures: { fixture: string; id: string; state: string; where: string[] }[] = []

      for (const file of await fixtures()) {
        await open(page, file)

        const results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .analyze()

        for (const violation of results.violations) {
          failures.push({
            fixture: file,
            id: violation.id,
            state: 'violation',
            where: violation.nodes.map((node) => node.target.join(' ')),
          })
        }

        const unresolved = results.incomplete
          .filter((result) => result.id.startsWith('color-contrast'))
          .flatMap((result) => result.nodes.map((node) => node.target.join(' ')))
        if (unresolved.length === 0) continue

        const onGlass = await page.evaluate((selectors) => {
          const glass = (node: Element | null) => {
            for (let at = node; at !== null; at = at.parentElement) {
              const style = getComputedStyle(at)
              const filter = style.backdropFilter || style.getPropertyValue('-webkit-backdrop-filter')
              if (filter && filter !== 'none') return true
            }
            return false
          }

          return selectors.filter((selector) => {
            try {
              return glass(document.querySelector(selector))
            } catch {
              return false
            }
          })
        }, unresolved)

        for (const where of onGlass) {
          failures.push({
            fixture: file,
            id: 'color-contrast',
            state: 'unresolved on a material, which is a failure rather than a pass',
            where: [where],
          })
        }
      }

      expect(failures).toEqual([])
    })
  }
})
