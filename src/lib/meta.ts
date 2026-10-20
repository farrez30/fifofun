/**
 * `MetaRow` for places that only take a string: a PDF line, a Telegram reply,
 * an `aria-live` region, a `.join()` result. The spaces inside each part become
 * no-break spaces, so a line can only wrap at a " · " between parts.
 *
 * Falsy parts are dropped, the same as `MetaRow`.
 */
export function metaText(parts: (string | null | undefined | false)[]): string {
  return parts
    .filter((part): part is string => Boolean(part))
    .map((part) => part.replace(/ /g, '\u00a0'))
    .join(' · ')
}
