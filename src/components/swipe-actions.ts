/**
 * The sums behind a row's action tray, kept apart from the event handling —
 * the same split `drag-axis.ts` and `use-swipe-tabs.ts` made, for the same
 * reason: what goes wrong in a gesture is almost always the numbers, and the
 * numbers reproduce without a browser once they are not tangled in listeners.
 *
 * The gesture itself is the iOS Mail / Gmail convention: swipe a ledger card
 * left to reveal its actions, tap one to use it. Reveal-and-tap only — there
 * is deliberately no distance at which the swipe itself commits an action.
 * These rows are money; an action fires from a deliberate tap on a visible
 * button or not at all, and `releaseVerdict` can only answer open or closed.
 *
 * Left-opens is assumed throughout (`trayOffset` never goes positive). The
 * app is Indonesian, left-to-right; if it ever grows an RTL locale the sign
 * convention lives here and nowhere else.
 */

/** Movement below this is a tap that wobbled, not a drag that began. */
export const SLOP = 8

/** The same sideways bias the tab swipe demands, so the two agree on intent. */
export const BIAS = 2

/** Dragging past the tray's width resists, the way pull-to-refresh does. */
export const RESISTANCE = 0.5

/**
 * Whether a drag is horizontal enough for the row to claim it, or vertical
 * enough to be a scroll. Null while the finger has not moved past the slop:
 * not yet meant, keep watching.
 */
export function claimsDrag(dx: number, dy: number): boolean | null {
  if (Math.abs(dx) <= SLOP && Math.abs(dy) <= SLOP) return null
  return Math.abs(dx) >= Math.abs(dy) * BIAS
}

/**
 * Where the card sits, in px of translateX, for a finger displaced `dx` from
 * where it went down. Always in [-trayWidth - overshoot, 0]: a card never
 * slides right of home, and past the tray the finger pays double.
 */
export function trayOffset(dx: number, trayWidth: number, openAtStart: boolean): number {
  const raw = (openAtStart ? -trayWidth : 0) + dx
  if (raw >= 0) return 0
  if (raw < -trayWidth) return -trayWidth + (raw + trayWidth) * RESISTANCE
  return raw
}

/** What letting go means. Halfway open stays open; short of that, closed. */
export function releaseVerdict(offset: number, trayWidth: number): 'open' | 'closed' {
  return offset <= -trayWidth / 2 ? 'open' : 'closed'
}
