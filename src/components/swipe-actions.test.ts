import { describe, expect, it } from 'vitest'
import { BIAS, claimsDrag, releaseVerdict, SLOP, trayOffset } from './swipe-actions'

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
    // Apple's overscroll curve rather than a flat halving. 100px past a 100px
    // tray used to show 50px of nothing; it now shows 35 and is still slowing.
    expect(trayOffset(-200, 100, false)).toBeCloseTo(-135.48, 2)
  })

  it('cannot be dragged off the end of the tray', () => {
    /*
      The point of the curve, and what the old linear resistance could not do.
      A halving had no limit: a determined finger dragged the card arbitrarily
      far past the tray and sat looking at a gap. This asymptotes at the tray's
      own width, so however hard it is pulled the card stops one tray-width
      past open.
    */
    expect(trayOffset(-100_000, 100, false)).toBeGreaterThan(-200)
    expect(trayOffset(-100_000, 100, false)).toBeLessThan(-199)
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

  it('opens on a flick that never reached halfway', () => {
    /*
      Where the gesture was going, not where the finger stopped. Twenty pixels
      out and still moving left at one and a half pixels per millisecond
      projects to roughly a hundred and seventy, which is well past the tray.
      Without this a quick flick left the card sitting a fifth open, which is
      the state the gesture exists to avoid.
    */
    expect(releaseVerdict(-20, 100, -1.5)).toBe('open')
    expect(releaseVerdict(-20, 100, 0)).toBe('closed')
  })

  it('closes a long drag that had already stopped', () => {
    // Past halfway on distance alone, but going nowhere: a slow drag that came
    // to rest is somebody changing their mind, and it should not commit.
    expect(releaseVerdict(-60, 100, 0.4)).toBe('closed')
  })

  it('a tap that never moved closes', () => {
    expect(releaseVerdict(0, 100)).toBe('closed')
  })
})
