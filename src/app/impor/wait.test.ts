import { describe, expect, it } from 'vitest'
import { waitPhase } from './wait'

describe('waitPhase', () => {
  it('starts as checking', () => {
    expect(waitPhase(0)).toBe('checking')
    expect(waitPhase(7_999)).toBe('checking')
  })

  it('turns slow at eight seconds', () => {
    expect(waitPhase(8_000)).toBe('slow')
    expect(waitPhase(44_999)).toBe('slow')
  })

  it('turns stalled at forty-five seconds', () => {
    expect(waitPhase(45_000)).toBe('stalled')
    expect(waitPhase(200_000)).toBe('stalled')
  })
})
