import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The two checks a Server Action used to get from Next for free, and that a
 * route has to make itself: same origin, and a size cap before the body is
 * read. The import behind them is covered in import-statement.test.ts.
 */

const importStatement = vi.fn()
vi.mock('../import-statement', () => ({
  MAX_UPLOAD_BYTES: 3 * 1024 * 1024,
  importStatement: (...args: unknown[]) => importStatement(...args),
}))

const { POST } = await import('./route')

function upload({
  origin = 'https://fifofun.test',
  host = 'fifofun.test',
  forwardedHost,
  length,
  file = new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], 'statement.xlsx'),
}: {
  origin?: string | null
  host?: string
  forwardedHost?: string
  length?: number | null
  file?: File
} = {}): Request {
  const body = new FormData()
  body.append('statement', file)
  const headers = new Headers({ host })
  if (origin !== null) headers.set('origin', origin)
  if (forwardedHost) headers.set('x-forwarded-host', forwardedHost)
  // A Request built here has no Content-Length until it is sent; the browser
  // always sends one for a FormData body, so the tests do too.
  if (length !== null) headers.set('content-length', String(length ?? 1024))
  return new Request('https://fifofun.test/impor/unggah', { method: 'POST', body, headers })
}

beforeEach(() => {
  vi.clearAllMocks()
  importStatement.mockResolvedValue({ ok: true, message: '3 transaksi masuk.' })
})

describe('POST /impor/unggah', () => {
  it('refuses a post from another site, before touching the import', async () => {
    const response = await POST(upload({ origin: 'https://evil.test' }))

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ ok: false, message: 'Permintaan ini ditolak.' })
    expect(importStatement).not.toHaveBeenCalled()
  })

  it('refuses a post with no Origin at all', async () => {
    const response = await POST(upload({ origin: null }))

    expect(response.status).toBe(403)
    expect(importStatement).not.toHaveBeenCalled()
  })

  it('refuses a malformed Origin rather than throwing', async () => {
    const response = await POST(upload({ origin: 'not a url' }))

    expect(response.status).toBe(403)
  })

  it('trusts the forwarded host over Host, the way Next checks an action', async () => {
    const response = await POST(
      upload({ origin: 'https://fifofun.app', host: 'internal.vercel', forwardedHost: 'fifofun.app' }),
    )

    expect(response.status).toBe(200)
    expect(importStatement).toHaveBeenCalledOnce()
  })

  it('refuses an oversized body from its Content-Length, before reading it', async () => {
    const response = await POST(upload({ length: 5 * 1024 * 1024 }))

    expect(response.status).toBe(413)
    expect(await response.json()).toMatchObject({ ok: false, message: 'Berkasnya terlalu besar.' })
    expect(importStatement).not.toHaveBeenCalled()
  })

  it('refuses a body with no Content-Length', async () => {
    const response = await POST(upload({ length: null }))

    expect(response.status).toBe(411)
    expect(importStatement).not.toHaveBeenCalled()
  })

  it('answers a body that is not form data with a report, not a throw', async () => {
    const request = new Request('https://fifofun.test/impor/unggah', {
      method: 'POST',
      body: 'plain text',
      headers: { host: 'fifofun.test', origin: 'https://fifofun.test', 'content-length': '10' },
    })

    const response = await POST(request)

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      ok: false,
      message: 'Pilih satu berkas e-Statement lebih dulu.',
    })
  })

  it('passes the form to the import and returns its report uncached', async () => {
    const response = await POST(upload())

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ ok: true, message: '3 transaksi masuk.' })
    const [formData] = importStatement.mock.calls[0] as [FormData]
    expect((formData.get('statement') as File).name).toBe('statement.xlsx')
  })
})
