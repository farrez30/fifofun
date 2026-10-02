/**
 * Whether the desktop sidebar is folded to a rail, remembered per device.
 *
 * Written by the browser, read by the root layout. Folding used to be a Server
 * Action, and a Server Action that touches a cookie makes Next.js render the
 * whole current page again: on /peta that is every transaction and place,
 * fetched so a nav can change width. Now the click flips the attribute on
 * `<html>` itself and the cookie only has to be right for the next request.
 *
 * Not httpOnly, because the browser writes it. It holds one of two values,
 * is checked again wherever it is read, and grants nothing; the worst a forged
 * one buys is a narrower nav. Its name is not the old `sidebar` because that
 * one was httpOnly, and script can neither overwrite nor delete it.
 */

export const SIDEBAR_COOKIE = 'sidebar-rail'

const YEAR = 60 * 60 * 24 * 365

/** The `document.cookie` assignment that remembers the fold, or forgets it. */
export function sidebarCookie(collapsed: boolean, secure: boolean): string {
  const value = collapsed ? `${SIDEBAR_COOKIE}=collapsed; Max-Age=${YEAR}` : `${SIDEBAR_COOKIE}=; Max-Age=0`
  return `${value}; Path=/; SameSite=Lax${secure ? '; Secure' : ''}`
}

/** The stored value, or nothing for anything that is not exactly the one we write. */
export function readSidebar(value: string | undefined): 'collapsed' | undefined {
  return value === 'collapsed' ? value : undefined
}
