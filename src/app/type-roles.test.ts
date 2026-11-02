import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Keeps the app on the four-step type scale of ADR 0007.
 *
 * `text-xl` for the page title, `text-sm` for section titles and body,
 * `text-xs` for metadata, plus `text-2xl` for the one verdict figure a screen
 * leads with. Anything else that sets a size is either a regression or a
 * screen nobody remembered to convert: the bigger Tailwind steps, and the
 * Dynamic Type roles (`text-subhead`, `text-footnote`, `text-title3` and the
 * rest) this app used before, which no longer exist in `globals.css` and would
 * silently render at the inherited size if they came back. A bracketed size
 * (`text-[0.5625rem]`) is the same regression wearing a costume, so it is
 * banned by the same rule; a bracketed *colour* (`text-[#f00]`) is a different
 * utility that shares the prefix, which is why the pattern only matches a
 * bracket that looks like a length.
 *
 * A test rather than an eslint rule for the same reason `globals.test.ts`
 * is: the string a lint rule can see is the one somebody typed, and this
 * only has to look at `src/**\/*.tsx`, which is far cheaper to walk directly
 * than to teach a linter to.
 *
 * One allowed survivor, a named decision rather than a leftover:
 * `field-base.tsx`'s `CONTROL_TEXT`, 16px on a phone because iOS Safari zooms
 * into any focused control under that. Every control and everything that has
 * to match one shares it rather than repeating the literal. A new exception
 * belongs in this list, with the same kind of reason.
 */

const ALLOWED: Record<string, string[]> = {
  'src/components/field-base.tsx': ['text-base'],
}

const BANNED =
  /\b(?:sm:|lg:)?text-(?:base|lg|[3-9]xl|caption[12]|footnote|subhead|callout|body|headline|title[123]|large-title)\b|\btext-\[[\d.]+(?:px|rem|em)\]/g

/** Block comments, then line comments — never a `://` a link happens to carry. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(?<!:)\/\/.*$/gm, '')
}

async function tsxFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true })
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.tsx'))
    .map((entry) => join(entry.parentPath ?? entry.path, entry.name).replace(/\\/g, '/'))
}

describe('the app keeps to the four-step type scale', () => {
  it('never reintroduces another size outside the named exception', async () => {
    const files = await tsxFiles('src')
    const offenders: string[] = []

    for (const file of files) {
      const source = stripComments(await readFile(file, 'utf8'))
      const allowed = [...(ALLOWED[file] ?? [])]
      const lines = source.split('\n')

      for (const [index, line] of lines.entries()) {
        for (const match of line.matchAll(BANNED)) {
          const at = allowed.indexOf(match[0])
          if (at !== -1) {
            allowed.splice(at, 1)
            continue
          }
          offenders.push(`${file}:${index + 1} — ${match[0]}`)
        }
      }
    }

    expect(offenders).toEqual([])
  })
})
