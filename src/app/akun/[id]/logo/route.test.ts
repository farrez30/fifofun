import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createScopeStub } from '@/test/scope-stub'

const stub = createScopeStub()
let signedIn = true

vi.mock('@/db/client', () => ({ db: {} }))
vi.mock('@/lib/auth/session', () => ({
  getUser: async () => (signedIn ? { id: 'u1', email: 'a@b.c' } : null),
  userScope: async () => (signedIn ? stub.scope : null),
}))

const { GET } = await import('./route')

const ID = '00000000-0000-4000-8000-0000000000a1'
const call = (id: string) => GET(new Request(`http://localhost/akun/${id}/logo`), { params: Promise.resolve({ id }) })

beforeEach(() => {
  stub.reset()
  signedIn = true
})

describe('GET /akun/[id]/logo', () => {
  it('serves the stored icon as a picture that cannot be sniffed into anything else', async () => {
    stub.queue({ logo: Buffer.from('RIFFxxxxWEBP').toString('base64') })
    const response = await call(ID)
    expect(stub.calls[0].sql).toContain('FROM public.accounts WHERE id =')
    expect(stub.calls[0].params).toEqual([ID])
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('image/webp')
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(response.headers.get('Content-Security-Policy')).toContain("default-src 'none'")
    expect(response.headers.get('Cache-Control')).toContain('private')
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe('RIFFxxxxWEBP')
  })

  it('answers an account without an icon, or one the policy hides, the same way', async () => {
    stub.queue(null)
    expect((await call(ID)).status).toBe(404)
  })

  it('answers a failed read like a missing icon', async () => {
    stub.queueError('connection reset')
    expect((await call(ID)).status).toBe(404)
  })

  it('never reaches the database for an id that is not a uuid', async () => {
    expect((await call("1' or '1'='1")).status).toBe(404)
    expect(stub.calls).toHaveLength(0)
  })

  it('asks for a session first', async () => {
    signedIn = false
    expect((await call(ID)).status).toBe(401)
    expect(stub.calls).toHaveLength(0)
  })
})
