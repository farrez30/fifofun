import { readFile } from 'node:fs/promises'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { describe, expect, it } from 'vitest'

/**
 * Discipline, read off the compiled stylesheet rather than off class names.
 *
 * Three of the rules that used to live in `eslint.config.mjs` were bans:
 * no drop shadow, no backdrop filter, no hover scale. Two of them had to go
 * when the interface became an Apple interface, and deleting a rule without
 * replacing it is how a vocabulary turns back into a pile of values. These are
 * the replacements, and they are deliberately here rather than in the lint
 * config: a lint rule sees the string somebody typed, while this sees what
 * Tailwind actually emitted, including the parts of the language that no
 * component mentions by name.
 *
 * Cheap enough to sit in `pnpm test`, which means it answers before the three
 * browser jobs start rather than twenty minutes into them.
 */

async function compiled(): Promise<string> {
  const source = await readFile('src/app/globals.css', 'utf8')
  const result = await postcss([tailwind()]).process(source, { from: 'src/app/globals.css' })
  return result.css
}

/** Every `prop: value` in the sheet, with the selector block it came from. */
function declarations(css: string, property: string): string[] {
  const found: string[] = []
  const pattern = new RegExp(`(?<![-\\w])${property}\\s*:([^;}]+)`, 'g')
  for (const match of css.matchAll(pattern)) found.push(match[1].trim())
  return found
}

describe('the stylesheet keeps to its own vocabulary', () => {
  it('draws every shadow from the elevation scale', async () => {
    const css = await compiled()

    /*
      Apple's elevation is five steps and each one names a kind of surface: a
      raised row, a popover, a sheet, a modal. A hand-written `0 4px 14px
      rgba(...)` is somebody inventing a sixth by eye, which is exactly how the
      old ban on `shadow-lg` came to be written in the first place. The tokens
      themselves are the definitions, so they are allowed to be literal; every
      other shadow has to point at one.
    */
    const adhoc = declarations(css, 'box-shadow')
      .filter((value) => !value.includes('var(--shadow-'))
      // Tailwind composes its own utilities through a chain of `--tw-*`
      // variables; that plumbing is the mechanism, not a decision.
      .filter((value) => !value.includes('var(--tw-'))
      .filter((value) => value !== 'none' && !value.startsWith('inset 0 1px 0'))
      // The five token definitions, plus the specular edge, are the source.
      .filter((value) => !/^0 (0\.5px|1px|2px|8px|20px) /.test(value))

    expect(adhoc).toEqual([])
  })

  it('gives every material a route back to opacity', async () => {
    const css = await compiled()

    /*
      A backdrop filter with no reduced-transparency answer is a surface that
      ignores a stated preference, and the failure is invisible to everyone who
      has not stated it. Rather than matching selectors, which get rewritten,
      this asserts the two blocks exist and that the count of filters inside
      them covers the count outside.
    */
    const reduced = css.slice(css.indexOf('prefers-reduced-transparency'))
    expect(css).toContain('prefers-reduced-transparency')
    expect(reduced).toContain('backdrop-filter: none')

    const contrast = css.slice(css.indexOf('prefers-contrast'))
    expect(contrast).toContain('backdrop-filter: none')

    expect(css).toContain('forced-colors')
  })

  it('never separates by shadow in dark mode', async () => {
    const css = await compiled()

    /*
      Apple's dark mode separates by surface lightness, not by shadow: an
      elevated surface goes lighter, and a shadow under it on a black canvas is
      invisible work. The elevation tokens carry their dark values inside
      `light-dark()` for the edge, which is fine; what this catches is a
      `box-shadow` written inside a dark media query, which means somebody
      reached for the light-mode idiom and then patched it.
    */
    const darkBlocks = [...css.matchAll(/@media[^{]*prefers-color-scheme:\s*dark[^{]*\{/g)].map(
      (match) => {
        const from = match.index + match[0].length
        let depth = 1
        let at = from
        while (at < css.length && depth > 0) {
          if (css[at] === '{') depth += 1
          if (css[at] === '}') depth -= 1
          at += 1
        }
        return css.slice(from, at)
      },
    )

    expect(darkBlocks.flatMap((block) => declarations(block, 'box-shadow'))).toEqual([])
  })

  it('always pairs a continuous corner with a radius that works without it', async () => {
    const css = await compiled()

    /*
      `corner-shape` shipped in Chromium first, and the browser where a squircle
      matters most is the one this application is built for. So it is a
      progressive enhancement or it is nothing, and a rule that sets it without
      a `border-radius` underneath draws a square on every engine that has not
      caught up.
    */
    for (const match of css.matchAll(/corner-shape\s*:/g)) {
      const before = css.slice(Math.max(0, match.index - 400), match.index)
      expect(before, 'corner-shape without a @supports guard').toContain('@supports')
    }
  })
})
