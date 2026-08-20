/*
  FiFoFun service worker.

  What it deliberately does NOT do is more important than what it does: it never
  caches a page, an RSC payload, or any API response. Every one of those carries
  balances and transaction descriptions, and a service worker cache is ordinary
  storage that survives sign-out and is readable by anyone who gets the device.
  A stale balance is also worse than no balance, because it looks current.

  What it does cache is the immutable build output under /_next/static, whose
  filenames contain a content hash, plus the icons and one offline page. That is
  enough for the app to install, launch instantly, and say something honest when
  the network is gone.
*/

const VERSION = 'v1'
const SHELL = `fifofun-shell-${VERSION}`
const ASSETS = `fifofun-assets-${VERSION}`

const OFFLINE_URL = '/offline'

const PRECACHE = [OFFLINE_URL, '/icon.svg', '/icon-192.png', '/icon-512.png']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(PRECACHE))
      // Take over as soon as the new worker is ready rather than waiting for
      // every tab to close, which in an installed app can be never.
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('fifofun-') && !key.endsWith(VERSION))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Build output is content-hashed, so a cached copy can never be stale and is
  // always safe to serve without touching the network.
  if (url.pathname.startsWith('/_next/static/') || PRECACHE.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone()
              caches.open(ASSETS).then((cache) => cache.put(request, copy))
            }
            return response
          }),
      ),
    )
    return
  }

  // Navigations always go to the network. On failure the offline page is shown
  // rather than a cached dashboard, because showing yesterday's balances as if
  // they were today's is the one thing this app must never do.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)))
  }
})

self.addEventListener('push', (event) => {
  if (!event.data) return

  const payload = event.data.json()
  event.waitUntil(
    self.registration.showNotification(payload.title ?? 'FiFoFun', {
      body: payload.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: payload.tag ?? 'fifofun',
      data: { url: payload.url ?? '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = event.notification.data?.url ?? '/'

  // Focus an existing window rather than opening a second copy of the app.
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (new URL(client.url).pathname === target && 'focus' in client) return client.focus()
      }
      return self.clients.openWindow(target)
    }),
  )
})
