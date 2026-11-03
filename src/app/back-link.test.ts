import { readFile, readdir } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MORE, NAV } from '@/components/nav'

/**
 * Every page that no tab or sidebar row lights has a visible way back.
 *
 * Found in production review: a transaction opened from Laporan had no way
 * out but the browser's own button, and on the installed app there is none.
 * A destination in the navigation is always one tap away; anything else
 * inside the shell has to pass `back` to `AppShell`, or the page is a dead end.
 * A new detail page fails here until it says where it returns to.
 */

const APP = join(process.cwd(), 'src', 'app')
const DESTINATIONS = new Set<string>([...NAV, ...MORE].map((item) => item.href))

async function pages(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory() ? pages(join(dir, entry.name)) : entry.name === 'page.tsx' ? [join(dir, entry.name)] : [],
    ),
  )
  return nested.flat()
}

function routeOf(file: string): string {
  const path = relative(APP, file).split(sep).slice(0, -1).join('/')
  return `/${path}`.replace(/\/$/, '') || '/'
}

describe('a way back from every page inside the shell', () => {
  it('passes `back` wherever the page is not a navigation destination', async () => {
    const deadEnds: string[] = []
    for (const file of await pages(APP)) {
      const source = await readFile(file, 'utf8')
      if (!source.includes('<AppShell') || DESTINATIONS.has(routeOf(file))) continue
      if (!/\bback=\{/.test(source)) deadEnds.push(routeOf(file))
    }
    expect(deadEnds).toEqual([])
  })

  it('found the one detail page there is, so the walk is not vacuous', async () => {
    const routes = (await pages(APP)).map(routeOf)
    expect(routes).toContain('/transaksi/[id]')
  })

  it('gives the legal pages, outside the shell, their own way back', async () => {
    const layout = await readFile(join(APP, 'legal', 'layout.tsx'), 'utf8')
    expect(layout).not.toContain('<header')
    for (const page of ['privasi', 'ketentuan']) {
      expect(await readFile(join(APP, 'legal', page, 'page.tsx'), 'utf8')).toContain('<LegalFrame dari=')
    }
  })
})
