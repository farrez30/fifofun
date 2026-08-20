import { readFile, readdir } from 'node:fs/promises'
import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { FIXTURE_DIR } from './render'

/**
 * axe over every rendered fixture, in both colour schemes.
 *
 * This replaces a check that had been run by hand: copying axe-core into the
 * public directory, restarting the server, injecting a script with the page
 * nonce and reading the results back out of a DOM node, because the content
 * security policy and the isolated script world made every simpler route fail.
 * It worked, and it only ever ran when somebody remembered to do it.
 *
 * Both schemes matter because the palettes are separate. Dark mode here is a
 * designed set of tokens rather than an inversion, so a contrast ratio that
 * passes in one says nothing about the other.
 */

const SCHEMES = ['light', 'dark'] as const

/*
  One test walks the whole fixture corpus, and axe costs roughly two thirds of a
  second per page. Thirty-two of them was already spending most of Playwright's
  30s default before the fonts were embedded, which is how a 34% increase turned
  into a timeout rather than a slower pass. The work is legitimate; the budget
  was simply never stated.
*/
test.describe.configure({ timeout: 120_000 })

async function fixtures(): Promise<string[]> {
  const files = await readdir(FIXTURE_DIR)
  return files.filter((name) => name.endsWith('.html'))
}

test.describe('accessibility', () => {
  for (const scheme of SCHEMES) {
    test(`every chart passes axe in ${scheme} mode`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme })

      /*
        `where` and `why` cost nothing to collect and are the difference between
        a report somebody can act on and one that only says a rule was broken.
        A count on its own sent the last contrast failure to be chased through
        downloaded CI artefacts to find out which element it meant.
      */
      const failures: { fixture: string; id: string; where: string[]; why: string }[] = []

      for (const file of await fixtures()) {
        await page.setContent(await readFile(`${FIXTURE_DIR}/${file}`, 'utf8'))
        // Contrast is read off rendered pixels and geometry off laid-out boxes,
        // and both move when the real face replaces the fallback mid-run.
        await page.evaluate(() => document.fonts.ready)

        const { violations } = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .analyze()

        for (const violation of violations) {
          failures.push({
            fixture: file,
            id: violation.id,
            where: violation.nodes.map((node) => node.target.join(' ')),
            why: violation.nodes[0]?.failureSummary ?? violation.help,
          })
        }
      }

      expect(failures).toEqual([])
    })
  }
})
