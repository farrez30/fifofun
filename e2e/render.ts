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

let compiled: Promise<string> | null = null

/** Compiled once per process; Tailwind rescans the project each time. */
function stylesheet(): Promise<string> {
  compiled ??= readFile('src/app/globals.css', 'utf8').then(async (source) => {
    const result = await postcss([tailwind()]).process(source, { from: 'src/app/globals.css' })
    return result.css
  })
  return compiled
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
