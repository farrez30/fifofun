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

const signUp = vi.fn(async (): Promise<{ ok: true } | { ok: false; taken: boolean }> => ({ ok: true }))
const signIn = vi.fn(async (): Promise<'ok' | 'wrong' | 'throttled'> => 'ok')
const signOut = vi.fn(async () => {})
vi.mock('@/lib/auth/gerbang', () => ({ signUp, signIn, signOut }))

// invite_is_open is asked through the owner scope; record the statement and
// answer with whatever the test says the invitation is.
let inviteOpen = true
const asked: { sql: string; params: unknown[] }[] = []
vi.mock('@/db/query', async () => {
  const { PgDialect } = await import('drizzle-orm/pg-core')
  const { sql } = await import('drizzle-orm')
  const dialect = new PgDialect()
  return {
    sql,
    asService: {
      maybeOne: async (q: import('drizzle-orm').SQL) => {
        asked.push(dialect.sqlToQuery(q))
        return { open: inviteOpen }
      },
    },
  }
})

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
  asked.length = 0
  inviteOpen = true
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('the invitation gate on sign-up', () => {
  it('creates no account at all when the code is unknown', async () => {
    inviteOpen = false

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

    expect(asked).toHaveLength(0)
    expect(signUp).not.toHaveBeenCalled()
    expect(result.error).toBeDefined()
  })

  it('sends the hash rather than the code', async () => {
    // The code never reaches the database, so it cannot appear in a statement
    // log there.
    await authenticate({}, signup()).catch(() => {})

    expect(asked[0]?.sql).toContain('invite_is_open')
    expect(asked[0]?.params).toEqual([hashCode(CODE)])
    expect(JSON.stringify(asked)).not.toContain(CODE)
  })

  it('accepts the same code however it was written down', async () => {
    await authenticate({}, signup({ code: `  ${CODE.slice(0, 5)}-${CODE.slice(5)}  `.toLowerCase() })).catch(() => {})

    expect(asked[0]?.params).toEqual([hashCode(CODE)])
    expect(signUp).toHaveBeenCalled()
  })

  it('creates the account when the invitation is open, then signs in and sends it to /gabung', async () => {
    await expect(authenticate({}, signup())).rejects.toThrow('REDIRECT:/gabung')

    expect(signUp).toHaveBeenCalledWith('orang@contoh.test', 'kata-sandi-panjang')
    expect(signIn).toHaveBeenCalledWith('orang@contoh.test', 'kata-sandi-panjang')
    // The code is spent at /gabung, the one place that redeems; asking whether
    // it is open is the only thing that happens to it here.
    expect(asked).toHaveLength(1)
  })

  it('still tells the new member what to do when signing in right after fails', async () => {
    signIn.mockResolvedValueOnce('throttled')

    const result = await authenticate({}, signup())

    expect(signUp).toHaveBeenCalled()
    expect(result.notice).toMatch(/kode undangan/i)
  })

  it('reports a sign-up failure without saying whether the address exists', async () => {
    signUp.mockResolvedValueOnce({ ok: false, taken: true })

    const result = await authenticate({}, signup())

    expect(result.error).toMatch(/tidak bisa dibuat/i)
  })

  it('leaves signing in alone, which needs no invitation', async () => {
    await expect(
      authenticate({}, form({ intent: 'signin', email: 'orang@contoh.test', password: 'kata-sandi-panjang' })),
    ).rejects.toThrow('REDIRECT:/')

    expect(asked).toHaveLength(0)
    expect(signIn).toHaveBeenCalled()
  })

  it('says to wait when sign-in is rate limited, and stays vague otherwise', async () => {
    signIn.mockResolvedValueOnce('throttled')
    const slow = await authenticate({}, form({ intent: 'signin', email: 'orang@contoh.test', password: 'kata-sandi-panjang' }))
    expect(slow.error).toMatch(/tunggu/i)

    signIn.mockResolvedValueOnce('wrong')
    const wrong = await authenticate({}, form({ intent: 'signin', email: 'orang@contoh.test', password: 'kata-sandi-panjang' }))
    expect(wrong.error).toBe('Email atau kata sandi tidak cocok.')
  })
})
