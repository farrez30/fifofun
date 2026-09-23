import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UPLOAD_ENDPOINT, UPLOAD_FAILURES, uploadStatement } from './upload'

/**
 * Every way the upload can fail has to come back as a report the form can
 * show, once. The bug this replaces was a Server Action that
 * `experimental.useOffline` replayed forever against a file that had changed
 * on disk, so "fetch was called exactly once" is as much the point here as
 * which sentence comes back.
 */

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function statement(): File {
  return new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], 'statement.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

describe('uploadStatement', () => {
  it('asks for a file when there is none, without a request', async () => {
    expect(await uploadStatement(null)).toBe(UPLOAD_FAILURES.noFile)
    expect(await uploadStatement(new File([], 'empty.xlsx'))).toBe(UPLOAD_FAILURES.noFile)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends a copy read into memory, not the file handle the input gave it', async () => {
    fetchMock.mockResolvedValue(Response.json({ ok: true, message: 'masuk' }))
    const original = statement()

    await uploadStatement(original)

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(UPLOAD_ENDPOINT)
    expect(init?.method).toBe('POST')
    const sent = (init?.body as FormData).get('statement') as File
    expect(sent).not.toBe(original)
    expect(sent.name).toBe('statement.xlsx')
    expect(sent.type).toBe(original.type)
    expect(new Uint8Array(await sent.arrayBuffer())).toEqual(new Uint8Array([0x50, 0x4b, 0x03, 0x04]))
  })

  it('sends the password only when there is one', async () => {
    fetchMock.mockResolvedValue(Response.json({ ok: true, message: 'masuk' }))

    await uploadStatement(statement(), { password: 'rahasia' })
    await uploadStatement(statement(), { password: '' })
    await uploadStatement(statement())

    const sent = fetchMock.mock.calls.map(([, init]) => (init?.body as FormData).get('password'))
    expect(sent).toEqual(['rahasia', null, null])
  })

  it('says the file could not be read when the disk refuses it, without a request', async () => {
    const locked = statement()
    locked.arrayBuffer = () => Promise.reject(new DOMException('changed', 'NotReadableError'))

    expect(await uploadStatement(locked)).toBe(UPLOAD_FAILURES.unreadable)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('passes the route report through, failures included', async () => {
    const report = { ok: false, message: 'Permintaan ini ditolak.' }
    fetchMock.mockResolvedValue(Response.json(report, { status: 403 }))

    expect(await uploadStatement(statement())).toEqual(report)
  })

  it('reports a dropped connection once, and does not retry it', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))

    expect(await uploadStatement(statement())).toBe(UPLOAD_FAILURES.network)
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('reports the deadline when the request times out', async () => {
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason))
        }),
    )

    expect(await uploadStatement(statement(), { timeoutMs: 10 })).toBe(UPLOAD_FAILURES.timeout)
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('names the platform refusing a large body as HTML', async () => {
    fetchMock.mockResolvedValue(new Response('<html>Request Entity Too Large</html>', { status: 413 }))

    expect(await uploadStatement(statement())).toBe(UPLOAD_FAILURES.tooLarge)
  })

  it('names the platform cutting the function off', async () => {
    fetchMock.mockResolvedValue(new Response('<html>Gateway Timeout</html>', { status: 504 }))

    expect(await uploadStatement(statement())).toBe(UPLOAD_FAILURES.serverTimeout)
  })

  it('does not trust JSON that is not a report', async () => {
    fetchMock.mockResolvedValue(Response.json({ error: 'nope' }, { status: 500 }))

    expect(await uploadStatement(statement())).toBe(UPLOAD_FAILURES.unexpected)
  })
})
