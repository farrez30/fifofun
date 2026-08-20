import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { generateCode, hashCode } from '@/lib/invites'

/**
 * One question, asked several ways: can an account be created without an
 * invitation?
 *
 * Registration is the only door into this deployment that a stranger can knock
 * on, so the gate in front of it gets the same treatment as the Telegram
 * webhook: tested for what it refuses, not for what it allows.
 */

const signUp = vi.fn(async () => ({ error: null }))
const signInWithPassword = vi.fn(async () => ({ error: null }))
const rpc = vi.fn(async () => ({ data: false, error: null }))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { signUp, signInWithPassword }, rpc }),
}))

// redirect throws in Next, which is how it stops the action. Signing in ends
// that way, so the mock has to as well or the test reads as a failure.
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`)
  },
}))

const { authenticate } = await import('./actions')

const form = (fields: Record<string, string>) => {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.append(key, value)
  return data
}

const CODE = generateCode()

const signup = (over: Record<string, string> = {}) =>
  form({
    intent: 'signup',
    email: 'orang@contoh.test',
    password: 'kata-sandi-panjang',
    code: CODE,
    ...over,
  })

beforeEach(() => {
  vi.clearAllMocks()
  rpc.mockResolvedValue({ data: true, error: null })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('the invitation gate on sign-up', () => {
  it('creates no account at all when the code is unknown', async () => {
    rpc.mockResolvedValue({ data: false, error: null })

    const result = await authenticate({}, signup())

    expect(signUp).not.toHaveBeenCalled()
    expect(result.error).toMatch(/tidak berlaku/i)
  })

  it('creates no account when no code was given', async () => {
    const result = await authenticate({}, signup({ code: '' }))

    expect(signUp).not.toHaveBeenCalled()
    expect(result.error).toMatch(/kode undangan/i)
  })

  it('creates no account when the code is the wrong shape', async () => {
    // Rejected before the round trip, so a malformed code cannot be used to
    // probe the database at all.
    const result = await authenticate({}, signup({ code: 'ABC' }))

    expect(rpc).not.toHaveBeenCalled()
    expect(signUp).not.toHaveBeenCalled()
    expect(result.error).toBeDefined()
  })

  it('sends the hash rather than the code', async () => {
    // The code never reaches the database, so it cannot appear in a statement
    // log there.
    await authenticate({}, signup())

    expect(rpc).toHaveBeenCalledWith('invite_is_open', { p_code_hash: hashCode(CODE) })
    expect(hashCode(CODE)).not.toContain(CODE)
  })

  it('accepts the same code however it was written down', async () => {
    await authenticate({}, signup({ code: `  ${CODE.slice(0, 5)}-${CODE.slice(5)}  `.toLowerCase() }))

    expect(rpc).toHaveBeenCalledWith('invite_is_open', { p_code_hash: hashCode(CODE) })
    expect(signUp).toHaveBeenCalled()
  })

  it('creates the account when the invitation is open', async () => {
    const result = await authenticate({}, signup())

    expect(signUp).toHaveBeenCalledWith({
      email: 'orang@contoh.test',
      password: 'kata-sandi-panjang',
    })
    // The code is spent at /gabung, where there is certainly a session. Doing it
    // here would consume it for an account that may never be confirmed.
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(result.notice).toBeDefined()
  })

  it('leaves signing in alone, which needs no invitation', async () => {
    await expect(
      authenticate({}, form({ intent: 'signin', email: 'orang@contoh.test', password: 'kata-sandi-panjang' })),
    ).rejects.toThrow('REDIRECT:/')

    expect(rpc).not.toHaveBeenCalled()
    expect(signInWithPassword).toHaveBeenCalled()
  })
})
