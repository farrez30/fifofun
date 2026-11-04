import { readFile, readdir } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PasswordInput } from './password-input'

/**
 * Every password field can be peeked at.
 *
 * Passwords here are pasted out of a password manager, and a field that only
 * shows dots gives no way to tell whether the paste landed whole. A bare
 * `type="password"` anywhere outside the shared component is a field that
 * lost its eye button.
 */

const SRC = join(process.cwd(), 'src')
const SHARED = 'components/password-input.tsx'

async function sources(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory()
        ? sources(join(dir, entry.name))
        : entry.name.endsWith('.tsx')
          ? [join(dir, entry.name)]
          : [],
    ),
  )
  return nested.flat()
}

describe('password fields', () => {
  it('all go through PasswordInput', async () => {
    const bare: string[] = []
    for (const file of await sources(SRC)) {
      const path = relative(SRC, file).split(sep).join('/')
      if (path === SHARED) continue
      if (/type=["'{`]*password/.test(await readFile(file, 'utf8'))) bare.push(path)
    }
    expect(bare).toEqual([])
  })

  it('found the two fields there are, so the walk is not vacuous', async () => {
    for (const path of ['app/login/login-form.tsx', 'app/impor/import-form.tsx']) {
      expect(await readFile(join(SRC, path), 'utf8')).toContain('<PasswordInput')
    }
  })

  it('starts hidden, with its own button that says what it does', () => {
    const html = renderToStaticMarkup(
      createElement(PasswordInput, {
        id: 'password',
        name: 'password',
        autoComplete: 'current-password',
        minLength: 8,
        required: true,
        className: 'h-11',
      }),
    )
    expect(html).toContain('type="password"')
    expect(html).toContain('name="password"')
    expect(html).toContain('autoComplete="current-password"')
    expect(html).toContain('minLength="8"')
    expect(html).toContain('required=""')
    // The caller's class survives and the padding the eye sits over is added.
    expect(html).toContain('class="h-11 pr-11"')
    expect(html).toMatch(/<button type="button" aria-label="Tampilkan sandi" aria-pressed="false"/)
  })

  it('keeps the dictionary out of a password once it is shown', () => {
    const html = renderToStaticMarkup(createElement(PasswordInput, { id: 'statement-password' }))
    expect(html).toContain('autoCapitalize="none"')
    expect(html).toContain('autoCorrect="off"')
    expect(html).toContain('spellCheck="false"')
  })
})
