/**
 * Which view of a split page is open, read from `?bagian=`.
 *
 * A page that used to stack several jobs in one scroll (the map, its places,
 * the merchants still waiting) now shows one at a time, and which one is part
 * of the address: the back button returns to the previous view and a view can
 * be sent to somebody. The value comes from a URL, so anything that is not one
 * of the page's own keys falls back to its first view rather than rendering
 * nothing.
 */
export function sectionOf<T extends string>(value: string | string[] | undefined, keys: readonly T[]): T {
  const raw = (Array.isArray(value) ? value[0] : value)?.trim().toLowerCase()
  return keys.find((key) => key === raw) ?? keys[0]
}

/**
 * The address of one view, keeping the parameters that describe what is being
 * looked at (filters) and dropping the ones that belong to a single view (its
 * page number, its search). The first view is written without `bagian`, so a
 * page has one address for its default view, not two.
 */
export function sectionHref(
  path: string,
  keep: Record<string, string | undefined>,
  section: string,
  first: string,
): string {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(keep)) if (value) query.set(key, value)
  if (section !== first) query.set('bagian', section)
  const text = query.toString()
  return text ? `${path}?${text}` : path
}
