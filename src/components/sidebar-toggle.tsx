'use client'

import { SidebarSimple } from '@phosphor-icons/react/dist/ssr/SidebarSimple'
import { sidebarCookie } from '@/components/sidebar-cookie'

/**
 * Folds the sidebar to a rail and back, with no request.
 *
 * The width follows `data-sidebar` on `<html>` (the `collapsed` variant in
 * globals.css), so changing the attribute is the whole fold; the cookie is
 * only for the next page the server renders. The root layout stamps the same
 * attribute from that cookie, which keeps a later render of it agreeing with
 * what the click left behind.
 */
export function SidebarToggle() {
  const toggle = () => {
    const root = document.documentElement
    const collapsed = root.dataset.sidebar !== 'collapsed'
    if (collapsed) root.dataset.sidebar = 'collapsed'
    else delete root.dataset.sidebar
    document.cookie = sidebarCookie(collapsed, location.protocol === 'https:')
  }

  return (
    <button
      type="button"
      onClick={toggle}
      title="Lipat atau bentangkan navigasi"
      className="flex size-11 shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors duration-150 hover:bg-fill-quaternary active:bg-fill-tertiary"
    >
      <SidebarSimple aria-hidden="true" className="size-5" />
      <span className="sr-only collapsed:hidden">Lipat navigasi</span>
      <span className="sr-only hidden collapsed:inline">Bentangkan navigasi</span>
    </button>
  )
}
