import { describe, expect, it } from 'vitest'
import { readSidebar, SIDEBAR_COOKIE, sidebarCookie } from './sidebar-cookie'

describe('sidebarCookie', () => {
  it('remembers a fold for a year, site-wide', () => {
    expect(sidebarCookie(true, false)).toBe(`${SIDEBAR_COOKIE}=collapsed; Max-Age=31536000; Path=/; SameSite=Lax`)
  })

  it('forgets it by expiring the cookie on the same path', () => {
    expect(sidebarCookie(false, false)).toBe(`${SIDEBAR_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`)
  })

  it('is Secure only over https, where the browser would accept it', () => {
    expect(sidebarCookie(true, true)).toMatch(/; Secure$/)
    expect(sidebarCookie(false, false)).not.toContain('Secure')
  })

  it('does not reuse the old httpOnly name, which script cannot touch', () => {
    expect(SIDEBAR_COOKIE).not.toBe('sidebar')
  })
})

describe('readSidebar', () => {
  it('takes only the one value it writes', () => {
    expect(readSidebar('collapsed')).toBe('collapsed')
    expect(readSidebar(undefined)).toBeUndefined()
    expect(readSidebar('Collapsed')).toBeUndefined()
    expect(readSidebar('"><script>')).toBeUndefined()
  })
})
