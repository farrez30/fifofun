import { beforeEach, describe, expect, it, vi } from 'vitest'
import { argsFor, createSupabaseStub } from '@/test/supabase-stub'

/** The summary's one free-text field: who it writes for, and what it refuses. */

const stub = createSupabaseStub()

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => stub.client }))
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
  stub.calls.length = 0
  stub.setUser({ id: 'u1' })
  vi.mocked(updateTag).mockClear()
})

describe('saveSummaryNote', () => {
  it('writes one row for the signed-in household, never one the form names', async () => {
    stub.queue('households', { data: { id: 'h1' } })
    stub.queue('summary_notes', { data: [{ household_id: 'h1' }] })

    const result = await saveSummaryNote(null, form({ body: '  Mulai Okt: nabung 1 jt/bln.\r\nDD dulu.  ', household_id: 'lain' }))

    expect(result.ok).toBe(true)
    const [call] = stub.callsOn('summary_notes')
    expect(call.payload).toEqual({ household_id: 'h1', body: 'Mulai Okt: nabung 1 jt/bln.\nDD dulu.' })
    expect(argsFor(call, 'upsert')[0][1]).toEqual({ onConflict: 'household_id' })
    expect(updateTag).toHaveBeenCalledWith('summary-note:h1')
  })

  it('refuses a note longer than the database allows, before asking it', async () => {
    const result = await saveSummaryNote(null, form({ body: 'x'.repeat(NOTE_LIMIT + 1) }))
    expect(result.ok).toBe(false)
    expect(stub.calls).toHaveLength(0)
  })

  it('asks a signed-out visitor to sign in again', async () => {
    stub.setUser(null)
    const result = await saveSummaryNote(null, form({ body: 'Rencana' }))
    expect(result.ok).toBe(false)
    expect(result.message).toContain('Sesi')
  })
})
