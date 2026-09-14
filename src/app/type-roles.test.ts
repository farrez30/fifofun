import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * A guard against the scale this app moved away from coming back by accident.
 *
 * `globals.css` carries Apple's Dynamic Type roles (`text-subhead`,
 * `text-footnote`, `text-title3`, and the rest) as an addition to Tailwind's
 * own scale, deliberately: re-pointing `--text-sm` itself would have moved
 * geometry `e2e/mobile.spec.ts` measures in every component at once, in one
 * commit no one could review. The whole app has since been carried over to
 * the roles screen by screen, so `text-xs`/`text-sm`/`text-base`/`text-lg`
 * and up reappearing anywhere is either a regression or a component nobody
 * remembered to convert — either way, worth a name rather than a silent
 * merge back into the crowd.
 *
 * A test rather than an eslint rule for the same reason `globals.test.ts`
 * is: the string a lint rule can see is the one somebody typed, and this
 * only has to look at `src/**\/*.tsx`, which is far cheaper to walk directly
 * than to teach a linter to.
 *
 * Two allowed survivors, both named decisions rather than leftovers:
 * `field-base.tsx`'s `CONTROL_TEXT` (17px on a phone, 14px on a desktop,
 * both above the floors that matter), the one place `sm:text-sm` is still
 * written — `CONTROL`, `CONTROL_INLINE` and every sibling that has to match
 * a control's size share it rather than repeating the literal — and
 * `waterfall.tsx`'s step-list labels, which measurably clip a real figure
 * at 320px one pixel taller — see the comment beside them. Nothing else
 * gets a pass; a new exception belongs in this list, with the same kind of
 * reason.
 */

const ALLOWED: Record<string, string[]> = {
  'src/components/field-base.tsx': ['sm:text-sm'],
  'src/components/chart/waterfall.tsx': ['text-sm', 'text-xs'],
}

const BANNED = /\b(?:sm:|lg:)?text-(?:xs|sm|base|lg|xl|[2-9]xl)\b/g

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

describe('the app keeps to its Dynamic Type roles', () => {
  it('never reintroduces the Tailwind text scale outside the named exception', async () => {
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
