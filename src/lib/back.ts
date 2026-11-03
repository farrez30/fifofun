import { MORE, NAV } from '@/components/nav'

/**
 * Where a page one level in goes back to, read from `?dari=`.
 *
 * A transaction is opened from the report, from Catat, from Tinjau, from the
 * dashboard, and the way back has to land on the list it was opened from, with
 * that list's filters and page still applied. `router.back()` would do that
 * only when there is a history entry to pop: a transaction opened from a link
 * in a new tab, or after a reload of a form that just saved, has none, and the
 * button would leave the app. So the link carries its origin in the address
 * and the way back is an ordinary href, with the logical parent as fallback.
 *
 * The value comes from a URL, so it is only ever accepted as a path on this
 * site that is one of the app's own pages. Anything else, including
 * `//elsewhere.example` and `/\elsewhere.example` (which browsers read as
 * another host), falls back. Without that check this is an open redirect.
 */

export interface Back {
  href: string
  label: string
}

/** Long enough for a report with every filter set, short of an abuse vector. */
const MAX = 1000
const TRANSACTION = /^\/transaksi\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const LABELS = new Map<string, string>([
  ...[...NAV, ...MORE].map((item) => [item.href, item.label] as const),
  ['/login', 'Masuk'],
  ['/gabung', 'Gabung'],
])

function labelOf(pathname: string): string | undefined {
  if (TRANSACTION.test(pathname)) return 'Transaksi utuh'
  return LABELS.get(pathname)
}

/** The way back for `?dari=`, or the fallback when it is missing or not ours. */
export function backFrom(value: string | string[] | undefined, fallback: Back): Back {
  const raw = Array.isArray(value) ? value[0] : value
  if (!raw || raw.length > MAX || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) {
    return fallback
  }

  let url: URL
  try {
    url = new URL(raw, 'https://fifofun.invalid')
  } catch {
    return fallback
  }
  if (url.origin !== 'https://fifofun.invalid') return fallback

  const label = labelOf(url.pathname)
  return label ? { href: `${url.pathname}${url.search}${url.hash}`, label } : fallback
}

/** A transaction's address, remembering the page it was opened from. */
export function transactionHref(id: string, from?: string): string {
  return from ? `/transaksi/${id}?dari=${encodeURIComponent(from)}` : `/transaksi/${id}`
}
