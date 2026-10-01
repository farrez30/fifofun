'use client'

import { useEffect, useState } from 'react'

/**
 * The thin line along the top while the next page is on its way.
 *
 * The sidebar's dot (nav-hint.tsx) answers a tap on the navigation itself.
 * Everything else that leaves the page, a transaction's link, a pager, a
 * filter form, used to answer with nothing until the new page streamed in.
 *
 * Next.js reports no navigation events, so this listens where navigations
 * start: a click on a link to another address in this app, or a GET form
 * submitted. It ends on its own in every case. The shell is re-created on
 * every page, which unmounts this and with it the line. A change of query
 * string on the same page keeps the shell, so while the line is on, the
 * address is compared every 100ms. A form that leaves the page entirely takes
 * the line with it. And nothing waits forever.
 */

const GIVE_UP_MS = 20_000

/*
  `defaultPrevented` says nothing here: `<Link>` cancels every click it
  handles, then navigates by itself.
*/
function leaves(event: MouseEvent): boolean {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false
  const link = (event.target as Element).closest('a[href]') as HTMLAnchorElement | null
  if (!link || link.target || link.hasAttribute('download')) return false
  const to = new URL(link.href, location.href)
  if (to.origin !== location.origin) return false
  // A jump within this page is not a navigation.
  return to.pathname !== location.pathname || to.search !== location.search
}

export function NavProgress() {
  const [active, setActive] = useState(false)

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (leaves(event)) setActive(true)
    }
    const onSubmit = (event: SubmitEvent) => {
      // The attribute, not `form.method`: a form running a React action has
      // none, and the property reports `get` for it all the same.
      const form = event.target as HTMLFormElement
      if (form.getAttribute('method')?.toLowerCase() === 'get') setActive(true)
    }
    // Coming back through the bfcache brings the page back with the line on.
    const onShow = () => setActive(false)

    document.addEventListener('click', onClick)
    document.addEventListener('submit', onSubmit)
    window.addEventListener('pageshow', onShow)
    return () => {
      document.removeEventListener('click', onClick)
      document.removeEventListener('submit', onSubmit)
      window.removeEventListener('pageshow', onShow)
    }
  }, [])

  useEffect(() => {
    if (!active) return
    const from = location.href
    const started = Date.now()
    const timer = setInterval(() => {
      if (location.href !== from || Date.now() - started > GIVE_UP_MS) setActive(false)
    }, 100)
    return () => clearInterval(timer)
  }, [active])

  return active ? <div aria-hidden="true" className="nav-progress" /> : null
}
