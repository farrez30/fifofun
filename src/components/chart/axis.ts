/**
 * Shared bits of axis drawing.
 *
 * Small enough to have lived inside one chart until a second one needed it, at
 * which point copying it would have meant the two axes could drift apart
 * without anyone noticing.
 */

/**
 * Keeps a label anchored at `pct` inside the plot rather than centred on its
 * edge. The two ends are the ones that carry the range, so clipping them is
 * the one thing an axis cannot afford.
 */
export function nudge(pct: number): string {
  if (pct <= 0) return 'none'
  if (pct >= 100) return 'translateX(-100%)'
  return 'translateX(-50%)'
}
