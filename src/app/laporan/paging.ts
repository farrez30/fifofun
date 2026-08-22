/**
 * Turning a filtered ledger into pages.
 *
 * The slicing happens in memory, over the same array the totals above the
 * table are computed from. That is a deliberate trade: the filters are applied
 * in JavaScript because several of them (the search, the pass-through rule)
 * cannot be expressed in one PostgREST query, and a page fetched separately
 * would be filtered by different code than the totals it sits under.
 *
 * The ceiling is real and worth writing down: this reads the whole ledger on
 * every request. At a few thousand rows that is one query and a few
 * milliseconds. Past roughly ten thousand, the swap is `getTransactions` with
 * a limit and an offset, and the filters have to move into the query with it.
 */

export const PAGE_SIZE = 50

/** A page number from the address bar, floored at the first page. */
export function parsePage(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value
  const page = Number(raw)
  return Number.isInteger(page) && page > 1 ? page : 1
}

export function pageCount(total: number): number {
  return Math.max(1, Math.ceil(total / PAGE_SIZE))
}

export function pageSlice<T>(rows: T[], page: number): T[] {
  const start = (page - 1) * PAGE_SIZE
  return rows.slice(start, start + PAGE_SIZE)
}

/**
 * The address of another page, keeping every filter that is already on.
 *
 * Page one is written by leaving the parameter out rather than by setting it
 * to 1, so the first page of a filtered report has one address instead of two.
 */
export function pageHref(params: Record<string, string | undefined>, page: number): string {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '' && key !== 'hal') query.set(key, value)
  }
  if (page > 1) query.set('hal', String(page))

  const text = query.toString()
  return text === '' ? '/laporan' : `/laporan?${text}`
}
