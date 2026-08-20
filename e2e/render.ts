import { readFile } from 'node:fs/promises'
import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'

/**
 * Puts one component on a page of its own, with the project's real stylesheet.
 *
 * The charts live behind a login and a database, and a browser test that has to
 * get through both tests the login far more often than it tests the chart. A
 * component on its own needs no server, no session and no seeded data, and
 * still produces genuine layout in a genuine browser.
 *
 * Genuine layout is the whole point. The bug this harness exists to catch was a
 * flex row that sized its columns to their content, so every bar inside them
 * resolved its percentage height against nothing and drew zero pixels tall. It
 * type checked, it linted, and jsdom would have reported the same clean pass,
 * because jsdom does not lay anything out.
 */

export const FIXTURE_DIR = 'e2e/.fixtures'

/**
 * The same faces `next/font` loads in `layout.tsx`, from a package instead.
 *
 * `globals.css` names the family; it never carries the font. The `@font-face`
 * rules are produced by the Next build, which this harness deliberately does
 * not run, so a fixture compiled through PostCSS alone asked for a font that was
 * not there and silently got whatever the operating system offered instead:
 * Segoe UI on Windows, DejaVu on the Linux runner. Every assertion about
 * whether a figure fits was then measuring a font the application never ships,
 * and the answer changed with the machine. It passed on a laptop for months and
 * failed on CI.
 *
 * Embedded as data URIs rather than linked, because the specs load fixtures with
 * `setContent`, whose document has no base URL for a relative path to resolve
 * against.
 */
const FACES = [
  ['IBM Plex Sans', 400, 'ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff2'],
  ['IBM Plex Sans', 500, 'ibm-plex-sans/files/ibm-plex-sans-latin-500-normal.woff2'],
  ['IBM Plex Sans', 600, 'ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff2'],
  ['IBM Plex Mono', 400, 'ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2'],
  ['IBM Plex Mono', 500, 'ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2'],
] as const

let compiled: Promise<string> | null = null

/** Compiled once per process; Tailwind rescans the project each time. */
function stylesheet(): Promise<string> {
  compiled ??= Promise.all([
    readFile('src/app/globals.css', 'utf8').then(async (source) => {
      const result = await postcss([tailwind()]).process(source, { from: 'src/app/globals.css' })
      return result.css
    }),
    fontFaces(),
  ]).then(([css, faces]) => `${faces}\n${css}`)
  return compiled
}

async function fontFaces(): Promise<string> {
  const rules = await Promise.all(
    FACES.map(async ([family, weight, file]) => {
      const woff2 = await readFile(`node_modules/@fontsource/${file}`)
      return `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};` +
        // `block` rather than `swap`: a measurement taken against the fallback
        // while the real face is still arriving is the bug this exists to stop.
        `font-display:block;src:url(data:font/woff2;base64,${woff2.toString('base64')}) format('woff2')}`
    }),
  )
  return rules.join('\n')
}

export async function documentFor(element: ReactElement): Promise<string> {
  return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<title>Fixture</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>${await stylesheet()}</style>
</head>
<body class="bg-paper text-ink">
<main class="p-6">${renderToStaticMarkup(element)}</main>
</body>
</html>`
}
