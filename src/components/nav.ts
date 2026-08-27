/**
 * Where this application can be navigated to, named once.
 *
 * Split out of `app-shell.tsx` when the phone got a second navigation. The
 * shell is a server component holding a server action, so a client component
 * that imported the list from it would pull the action across the boundary for
 * the sake of eight strings. The list itself needs neither, so it lives here
 * and both sides read the same one.
 *
 * The alternative was a second copy of the routes in the tab bar, which is how
 * a renamed page keeps working in one navigation and 404s in the other.
 */

export const NAV = [
  { href: '/', label: 'Ringkasan' },
  { href: '/laporan', label: 'Laporan' },
  { href: '/dana', label: 'Dana' },
  { href: '/anggaran', label: 'Anggaran' },
  { href: '/tinjau', label: 'Tinjau' },
  { href: '/catat', label: 'Catat' },
  { href: '/rencana', label: 'Rencana' },
  { href: '/impor', label: 'Impor' },
] as const

/**
 * Which nav item is the current page.
 *
 * A route that sits outside the navigation passes its own href and nothing
 * highlights, which is the truthful answer.
 */
export type NavHref =
  | (typeof NAV)[number]['href']
  | '/undangan'
  | '/pengaturan'
  | '/transaksi'
