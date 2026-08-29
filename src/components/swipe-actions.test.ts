import { describe, expect, it } from 'vitest'
import { BIAS, claimsDrag, releaseVerdict, RESISTANCE, SLOP, trayOffset } from './swipe-actions'

describe('claimsDrag', () => {
  it('stays undecided inside the slop on both axes', () => {
    expect(claimsDrag(0, 0)).toBeNull()
    expect(claimsDrag(-SLOP, SLOP)).toBeNull()
  })

  it('claims a drag that is clearly sideways', () => {
    expect(claimsDrag(-20, 0)).toBe(true)
    expect(claimsDrag(20, 4)).toBe(true)
  })

  it('declines a drag that is mostly a scroll', () => {
    expect(claimsDrag(-20, 11)).toBe(false)
    expect(claimsDrag(0, 30)).toBe(false)
  })

  it('claims exactly at the bias boundary, matching the tab swipe', () => {
    expect(claimsDrag(-22, 11)).toBe(true)
    expect(Math.abs(-22)).toBe(Math.abs(11) * BIAS)
  })
})

describe('trayOffset', () => {
  it('follows the finger inside the tray range', () => {
    expect(trayOffset(-40, 100, false)).toBe(-40)
    expect(trayOffset(-100, 100, false)).toBe(-100)
  })

  it('never slides the card right of home', () => {
    expect(trayOffset(30, 100, false)).toBe(0)
    expect(trayOffset(150, 100, true)).toBe(0)
  })

  it('resists past the tray instead of following', () => {
    expect(trayOffset(-200, 100, false)).toBe(-100 + -100 * RESISTANCE)
  })

  it('starts from the open position when the tray was already out', () => {
    expect(trayOffset(0, 100, true)).toBe(-100)
    expect(trayOffset(60, 100, true)).toBe(-40)
  })
})

describe('releaseVerdict', () => {
  it('closes short of halfway and opens from halfway', () => {
    expect(releaseVerdict(-49, 100)).toBe('closed')
    expect(releaseVerdict(-50, 100)).toBe('open')
    expect(releaseVerdict(-150, 100)).toBe('open')
  })

  it('a tap that never moved closes', () => {
    expect(releaseVerdict(0, 100)).toBe('closed')
  })
})
