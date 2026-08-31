'use client'

import { useEffect, useState } from 'react'
import { useOffline } from 'next/offline'

/**
 * Progressive web app plumbing: register the worker, and say something when the
 * network drops.
 *
 * The banner exists because the framework now holds a failed navigation or
 * Server Action pending and retries it when the connection returns, which is the
 * right behaviour and looks identical to a slow server. Without a word on screen
 * a user watching a spinner cannot tell the difference between waiting and
 * broken, and will reload, which loses the pending action.
 */
export function ProgressiveWebApp() {
  const offline = useOffline()
  const [registered, setRegistered] = useState(false)

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    /*
      Production only, and in development the opposite: unregister and empty
      the caches. The worker serves /_next/static cache-first on the promise
      that those names are content-hashed — true of a build, false of `next
      dev`, where Turbopack names a chunk by its module path and rewrites the
      CONTENT in place. A dev client that ever cached the stylesheet then kept
      it forever: new markup, old CSS, and the dashboard rendered as a narrow
      column because the deck's containment utilities were not in the file it
      was being served. The cleanup heals any client that was poisoned before
      this guard existed; it needs one reload to let go, which dev can afford.
    */
    if (process.env.NODE_ENV !== 'production') {
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => Promise.all(registrations.map((r) => r.unregister())))
        .catch(() => {})
      if ('caches' in window) {
        caches
          .keys()
          .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
          .catch(() => {})
      }
      return
    }

    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then(() => setRegistered(true))
      // A worker that fails to register costs offline support and nothing else,
      // so it is not worth interrupting anyone over.
      .catch(() => setRegistered(false))
  }, [])

  if (!offline) return null

  return (
    <div
      role="status"
      aria-live="polite"
      /*
        Top on a phone, bottom from the small breakpoint up.

        Not a style choice. The tab bar is fixed to the bottom edge, and so was
        this, so the two covered each other. Offsetting it above the bar was the
        other option and it is wrong on the three screens that have no bar:
        login, join and the legal pages would show a banner floating 64px off
        the bottom for no reason. The top is also where a phone puts
        connectivity, and it is clear of the notch here.
      */
      className="fixed inset-x-0 top-0 z-50 border-b border-warn/40 bg-warn-wash px-4 pb-3 pt-[calc(0.75rem+var(--spacing-safe-t))] text-center text-sm text-ink sm:bottom-0 sm:top-auto sm:border-b-0 sm:border-t sm:py-3"
    >
      <span aria-hidden="true" className="mr-2 text-warn">
        ▲
      </span>
      Tidak ada koneksi. Yang sedang kamu kerjakan ditahan dan dikirim ulang
      begitu jaringan kembali
      {registered ? ', jadi jangan muat ulang halaman ini.' : '.'}
    </div>
  )
}
