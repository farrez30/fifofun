import { describe, expect, it, vi } from 'vitest'
import { waitPhase, withDeadline } from './wait'

describe('waitPhase', () => {
  it('starts as checking', () => {
    expect(waitPhase(0, false)).toBe('checking')
    expect(waitPhase(7_999, false)).toBe('checking')
  })

  it('turns slow at eight seconds', () => {
    expect(waitPhase(8_000, false)).toBe('slow')
    expect(waitPhase(44_999, false)).toBe('slow')
  })

  it('turns stalled at forty-five seconds', () => {
    expect(waitPhase(45_000, false)).toBe('stalled')
    expect(waitPhase(200_000, false)).toBe('stalled')
  })

  it('reports offline over every other phase, however long it has waited', () => {
    expect(waitPhase(0, true)).toBe('offline')
    expect(waitPhase(200_000, true)).toBe('offline')
  })
})

describe('withDeadline', () => {
  it('resolves with the real result when it lands before the deadline', async () => {
    vi.useFakeTimers()
    const promise = withDeadline(Promise.resolve('done'), 1_000, () => 'timed out')
    await vi.advanceTimersByTimeAsync(0)
    await expect(promise).resolves.toBe('done')
    vi.useRealTimers()
  })

  it('falls back once the deadline passes, without the original promise ever resolving', async () => {
    vi.useFakeTimers()
    const never = new Promise<string>(() => {})
    const promise = withDeadline(never, 1_000, () => 'timed out')
    await vi.advanceTimersByTimeAsync(1_000)
    await expect(promise).resolves.toBe('timed out')
    vi.useRealTimers()
  })

  it('still rejects if the original promise rejects before the deadline', async () => {
    // Real timers: the rejection settles on the microtask queue well before
    // the deadline, so there is nothing here for fake timers to advance.
    const promise = withDeadline(Promise.reject(new Error('boom')), 1_000, () => 'timed out')
    await expect(promise).rejects.toThrow('boom')
  })
})
