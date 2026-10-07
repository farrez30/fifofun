/**
 * Turning a long list into pages.
 *
 * Every list that can outgrow a screen goes through here: the report's
 * transactions, the map's places, the merchants still waiting for a point.
 * The slicing happens in memory, over the same array whatever sits above the
 * list was computed from, so a page can never disagree with the totals it sits
 * under. On the report the filters also run in the query
 * (`getMatchingTransactions`), so only the matched rows travel there.
 *
 * Twenty rows, not fifty: a page is meant to fit in two or three phone screens,
 * and fifty transaction rows was eight.
 */

export const PAGE_SIZE = 20

/** A page number from the address bar, floored at the first page. */
export function parsePage(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value
  const page = Number(raw)
  return Number.isInteger(page) && page > 1 ? page : 1
}

export function pageCount(total: number, size = PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / size))
}

export function pageSlice<T>(rows: readonly T[], page: number, size = PAGE_SIZE): T[] {
  const start = (page - 1) * size
  return rows.slice(start, start + size)
}

/**
 * The address of another page, keeping every parameter that is already on.
 *
 * Page one is written by leaving the parameter out rather than by setting it
 * to 1, so the first page of a filtered list has one address instead of two.
 */
export function pageHref(path: string, params: Record<string, string | undefined>, page: number): string {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '' && key !== 'hal') query.set(key, value)
  }
  if (page > 1) query.set('hal', String(page))

  const text = query.toString()
  return text === '' ? path : `${path}?${text}`
}

/**
 * The page numbers worth a button, with `null` where a run is left out.
 *
 * Always the first and the last, so both ends are one tap away, and the pages
 * either side of the current one, so the next step is too. A gap of exactly
 * one page is drawn as that page: an ellipsis standing in for a single number
 * hides nothing and costs the same width.
 */
export function pageWindow(page: number, pages: number): (number | null)[] {
  const wanted = new Set([1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages))
  const sorted = [...wanted].sort((a, b) => a - b)
  const out: (number | null)[] = []
  for (const n of sorted) {
    const last = out[out.length - 1]
    if (typeof last === 'number' && n - last === 2) out.push(last + 1)
    else if (typeof last === 'number' && n - last > 2) out.push(null)
    out.push(n)
  }
  return out
}
