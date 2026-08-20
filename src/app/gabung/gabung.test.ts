import { beforeEach, describe, expect, it, vi } from 'vitest'
import { generateCode, hashCode } from '@/lib/invites'

/**
 * The other half of the gate: what an account holding a code is told.
 *
 * None of the deciding happens in this file, and that is the thing worth
 * asserting. It hashes what was typed, asks the database, and turns one word
 * into one sentence. A refusal that says only "gagal" is the reason somebody
 * asks for a third code they did not need.
 */

const rpc = vi.fn(async () => ({ data: 'ok', error: null }) as { data: unknown; error: unknown })

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc }) }))
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
  vi.clearAllMocks()
  rpc.mockResolvedValue({ data: 'ok', error: null })
})

describe('joinHousehold', () => {
  it('sends the hash rather than the code', async () => {
    await expect(joinHousehold(null, form(CODE))).rejects.toThrow('REDIRECT:/')
    expect(rpc).toHaveBeenCalledWith('redeem_invite', { p_code_hash: hashCode(CODE) })
  })

  it('never asks the database about a code of the wrong shape', async () => {
    const result = await joinHousehold(null, form('NOPE'))
    expect(rpc).not.toHaveBeenCalled()
    expect(result.ok).toBe(false)
  })

  it.each([
    ['unknown', /tidak dikenali/i],
    ['redeemed', /sudah dipakai/i],
    ['expired', /kedaluwarsa/i],
    ['already_member', /sudah tergabung/i],
    ['unauthenticated', /masuk lagi/i],
  ])('turns %s into something actionable', async (status, expected) => {
    rpc.mockResolvedValue({ data: status, error: null })
    const result = await joinHousehold(null, form(CODE))
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(expected)
  })

  it('does not pretend a status it has never seen is a success', async () => {
    rpc.mockResolvedValue({ data: 'something_new', error: null })
    const result = await joinHousehold(null, form(CODE))
    expect(result.ok).toBe(false)
  })
})
