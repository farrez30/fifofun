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
      className="fixed inset-x-0 bottom-0 z-50 border-t border-warn/40 bg-warn-wash px-4 py-3 text-center text-sm text-ink"
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
