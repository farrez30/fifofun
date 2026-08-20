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

async function fixtures(): Promise<string[]> {
  const files = await readdir(FIXTURE_DIR)
  return files.filter((name) => name.endsWith('.html'))
}

test.describe('accessibility', () => {
  for (const scheme of SCHEMES) {
    test(`every chart passes axe in ${scheme} mode`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme })

      const failures: { fixture: string; id: string; nodes: number }[] = []

      for (const file of await fixtures()) {
        await page.setContent(await readFile(`${FIXTURE_DIR}/${file}`, 'utf8'))

        const { violations } = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .analyze()

        for (const violation of violations) {
          failures.push({ fixture: file, id: violation.id, nodes: violation.nodes.length })
        }
      }

      expect(failures).toEqual([])
    })
  }
})
