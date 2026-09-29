import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const toast = vi.hoisted(() =>
  Object.assign(vi.fn(), {
    loading: vi.fn(() => 't1'),
    success: vi.fn(),
    error: vi.fn(),
    dismiss: vi.fn(),
  }),
)
vi.mock('sonner', () => ({ toast }))

const { withToast } = await import('./use-action-toast')

beforeEach(() => vi.clearAllMocks())

describe('withToast', () => {
  it('turns the loading notice into the success in place', async () => {
    const result = await withToast(Promise.resolve({ ok: true, message: 'Urutannya disimpan.' }), 'Menyimpan urutan…')

    expect(result.ok).toBe(true)
    expect(toast.loading).toHaveBeenCalledWith('Menyimpan urutan…')
    expect(toast.success).toHaveBeenCalledWith('Urutannya disimpan.', { id: 't1', description: undefined })
  })

  it('keeps a refusal on screen until it is closed', async () => {
    await withToast(Promise.resolve({ ok: false, message: 'Urutannya tidak disimpan.', detail: 'Muat ulang.' }))

    expect(toast.error).toHaveBeenCalledWith('Urutannya tidak disimpan.', {
      id: 't1',
      description: 'Muat ulang.',
      duration: Infinity,
    })
  })

  it('answers a request that never arrived with a failure instead of throwing', async () => {
    // A thrown error inside a form action reaches the page's error boundary;
    // a dropped connection is not worth losing the page over.
    const result = await withToast(Promise.reject(new TypeError('Failed to fetch')))

    expect(result).toEqual({
      ok: false,
      message: 'Gagal tersambung ke server.',
      detail: 'Periksa koneksi, lalu coba lagi.',
    })
    expect(toast.error).toHaveBeenCalledOnce()
  })
})

describe('sonner patch', () => {
  /*
    sonner writes a <style> tag at module load, which the production CSP
    refuses for want of a nonce. patches/sonner@2.0.8.patch removes that call
    and components/toaster.tsx imports the stylesheet instead. An upgrade that
    drops the patch would bring the injection back without a single failing
    build, so this reads the installed package itself.
  */
  it('does not inject a stylesheet at runtime', () => {
    // The package's exports hide dist/, so both builds are found beside its main entry.
    const dist = dirname(createRequire(import.meta.url).resolve('sonner'))
    for (const entry of ['index.mjs', 'index.js']) {
      const source = readFileSync(join(dist, entry), 'utf8')
      expect(source, entry).not.toMatch(/^__insertCSS\(/m)
    }
  })

  it('ships the stylesheet the toaster imports instead', () => {
    const require = createRequire(import.meta.url)
    const css = readFileSync(require.resolve('sonner/dist/styles.css'), 'utf8')
    expect(css).toContain('[data-sonner-toaster]')
  })
})
