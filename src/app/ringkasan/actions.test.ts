import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createScopeStub } from '@/test/scope-stub'

/** The summary's one free-text field: who it writes for, and what it refuses. */

const stub = createScopeStub()
let signedIn = true

vi.mock('@/db/client', () => ({ db: {} }))
vi.mock('@/lib/auth/session', () => ({ getUser: async () => null, userScope: async () => null }))
vi.mock('@/lib/actions', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/actions')>()),
  context: async () => (signedIn ? { db: stub.scope, householdId: 'h1', userId: 'u1' } : null),
}))
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
  revalidateTag: vi.fn(),
  cacheTag: vi.fn(),
  cacheLife: vi.fn(),
}))

const { saveSummaryNote } = await import('./actions')
const { NOTE_LIMIT } = await import('./note')
const { updateTag } = await import('next/cache')

function form(fields: Record<string, string>) {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.append(key, value)
  return data
}

beforeEach(() => {
  stub.reset()
  signedIn = true
  vi.mocked(updateTag).mockClear()
})

describe('saveSummaryNote', () => {
  it('writes one row for the signed-in household, never one the form names', async () => {
    stub.queue([{ household_id: 'h1' }])

    const result = await saveSummaryNote(null, form({ body: '  Mulai Okt: nabung 1 jt/bln.\r\nDD dulu.  ', household_id: 'lain' }))

    expect(result.ok).toBe(true)
    const [call] = stub.calls
    expect(call.sql).toContain('INSERT INTO public.summary_notes')
    expect(call.sql).toContain('ON CONFLICT (household_id)')
    expect(call.params).toEqual(['h1', 'Mulai Okt: nabung 1 jt/bln.\nDD dulu.'])
    expect(call.params).not.toContain('lain')
    expect(updateTag).toHaveBeenCalledWith('summary-note:h1')
  })

  it('refuses a note longer than the database allows, before asking it', async () => {
    const result = await saveSummaryNote(null, form({ body: 'x'.repeat(NOTE_LIMIT + 1) }))
    expect(result.ok).toBe(false)
    expect(stub.calls).toHaveLength(0)
  })

  it('asks a signed-out visitor to sign in again', async () => {
    signedIn = false
    const result = await saveSummaryNote(null, form({ body: 'Rencana' }))
    expect(result.ok).toBe(false)
    expect(result.message).toContain('Sesi')
  })
})
