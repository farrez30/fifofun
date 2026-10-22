import { beforeEach, describe, expect, it, vi } from 'vitest'
import { generateCode, hashCode } from '@/lib/invites'
import { createScopeStub } from '@/test/scope-stub'

/**
 * The other half of the gate: what an account holding a code is told.
 *
 * None of the deciding happens in this file, and that is the thing worth
 * asserting. It hashes what was typed, asks the database, and turns one word
 * into one sentence. A refusal that says only "gagal" is the reason somebody
 * asks for a third code they did not need.
 */

const stub = createScopeStub()
let signedIn = true

vi.mock('@/db/client', () => ({ db: {} }))
vi.mock('@/lib/auth/session', () => ({
  getUser: async () => (signedIn ? { id: 'u1', email: null } : null),
  userScope: async () => (signedIn ? stub.scope : null),
}))
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`)
  },
}))

const { joinHousehold } = await import('./actions')

const CODE = generateCode()
const form = (code: string) => {
  const data = new FormData()
  data.append('code', code)
  return data
}

beforeEach(() => {
  stub.reset()
  signedIn = true
})

describe('joinHousehold', () => {
  it('sends the hash rather than the code', async () => {
    stub.queue({ status: 'ok' })
    await expect(joinHousehold(null, form(CODE))).rejects.toThrow('REDIRECT:/')
    expect(stub.calls).toHaveLength(1)
    expect(stub.calls[0].sql).toContain('public.redeem_invite(p_code_hash =>')
    expect(stub.calls[0].params).toEqual([hashCode(CODE)])
    expect(stub.calls[0].params).not.toContain(CODE)
  })

  it('never asks the database about a code of the wrong shape', async () => {
    const result = await joinHousehold(null, form('NOPE'))
    expect(stub.calls).toHaveLength(0)
    expect(result.ok).toBe(false)
  })

  it.each([
    ['unknown', /tidak dikenali/i],
    ['redeemed', /sudah dipakai/i],
    ['expired', /kedaluwarsa/i],
    ['already_member', /sudah tergabung/i],
    ['unauthenticated', /masuk lagi/i],
  ])('turns %s into something actionable', async (status, expected) => {
    stub.queue({ status })
    const result = await joinHousehold(null, form(CODE))
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(expected)
  })

  it('does not pretend a status it has never seen is a success', async () => {
    stub.queue({ status: 'something_new' })
    const result = await joinHousehold(null, form(CODE))
    expect(result.ok).toBe(false)
  })

  it('asks a signed-out visitor to sign in again, without asking the database', async () => {
    signedIn = false
    const result = await joinHousehold(null, form(CODE))
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/masuk lagi/i)
    expect(stub.calls).toHaveLength(0)
  })

  it('says the code could not be processed when the database fails', async () => {
    stub.queueError('connection reset')
    const result = await joinHousehold(null, form(CODE))
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/gagal diproses/i)
    expect(result.message).not.toContain('connection')
  })
})
