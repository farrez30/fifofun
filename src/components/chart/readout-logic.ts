/**
 * The pure half of `ChartReadout`: what to show and where to put it, split
 * out so it can be tested without a browser. `readout.tsx` is the DOM wiring
 * around this — event delegation, the portal, the `(hover: hover)` gate —
 * none of which a static fixture can exercise (see the note in
 * e2e/charts.spec.ts), so correctness for this part lives here instead.
 */

export interface ReadoutContent {
  label: string
  value: string
}

/** Reads the two facts a marked-up element carries, or nothing if it isn't one. */
export function contentFrom(dataset: DOMStringMap): ReadoutContent | null {
  const { readoutLabel, readoutValue } = dataset
  if (!readoutLabel || !readoutValue) return null
  return { label: readoutLabel, value: readoutValue }
}

/**
 * Where the bubble sits: centred above the mark, clamped inside the
 * viewport.
 *
 * Centring on `x` is what a ribbon crossing the middle of a wide,
 * horizontally-scrolled diagram needs; clamped, because the ribbon nearest
 * the scrolling edge would otherwise centre a bubble half off screen. The
 * margin is the bubble's own rough half-width rather than zero, so the
 * clamp stops the bubble's edge at the viewport edge instead of its centre.
 */
export function positionFor(
  mark: { left: number; top: number; width: number },
  viewportWidth: number,
  margin = 80,
): { x: number; y: number } {
  const clampWidth = Math.max(0, viewportWidth - margin)
  return {
    x: Math.min(Math.max(mark.left + mark.width / 2, margin), clampWidth),
    y: Math.max(mark.top, 48),
  }
}
