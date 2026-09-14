import { type ReactNode } from 'react'

/**
 * The two pieces every form control in this app shares.
 *
 * They were inside the planner's own field module, which is where the first
 * three inputs happened to be written. Once the money input moved out so that
 * five other pages could use it, keeping them there would have meant either a
 * circular import or a second copy of the class string, and a second copy is
 * how two inputs end up a pixel apart.
 */

/*
  17px on a phone, 14px from the small breakpoint up.

  The floor is not a preference. iOS Safari zooms the whole viewport when a
  focused control measures under 16px, and there is no way to decline it from
  the page: the viewport meta cannot forbid it and `-webkit-text-size-adjust`
  does not govern it. Every data entry screen in this app was doing that on
  every tap.

  It used to say `text-base`, which is 16 and clears the floor by nothing at
  all. `text-body` is Apple's own body role at 17, so the control now names its
  size rather than picking the smallest number that happens to work, and there
  is a pixel of room before the zoom comes back.

  The floor is still easy to lose, because 14px is the right size everywhere
  else and `text-sm` is what anyone would reach for. `e2e/mobile.spec.ts` reads
  the computed size of every control in every fixture and fails under 16px.

  A fill rather than a border. That is what a text field is on iOS, and it is
  also what stops a form of eight fields reading as eight boxes: the fill says
  "type here" without drawing a rectangle around every one of them. The border
  is kept at `transparent` so the focused state can colour it without moving
  anything by a pixel.
*/
export const CONTROL =
  'h-11 w-full rounded-sm border border-transparent bg-fill-tertiary px-3 text-body text-ink transition-colors duration-150 placeholder:text-ink-faint focus:border-accent focus:bg-surface sm:text-sm'

/*
  Four buttons, because there were four all along and only two of them had a
  name.

  The accent recipe was already in nine places when the settings, budget and
  transaction screens were written, and those screens copied an outline button
  eight more times instead, in four slightly different recipes: `border-line`
  or `border-line-strong`, `h-10` or `h-11`, with or without a hover fill. That
  is how five pages ended up where Save and Copy and Delete all looked alike.

  Apple's hierarchy is what the four are named after, and the order is a claim
  about how many of them may appear together: exactly one filled, at most one
  tinted near it, and as many gray and plain as the screen needs. Tinting
  everything is how the signal a tint carries gets spent.

  Capsules, which is the shape iOS 26 made the default. It costs nothing, it is
  the single most recognisable thing about the language, and a pill next to a
  rounded rectangle field is the pairing the platform actually ships.
*/
/* `inline-flex` rather than nothing, because several of these sit on a `Link`.
   An anchor is inline, so a height on it leaves the label on the baseline
   instead of in the middle, and every outline this replaced had written
   `inline-flex items-center` out again to fix exactly that. */
const BUTTON_BASE =
  'inline-flex h-11 items-center justify-center rounded-full px-5 text-sm font-medium transition-[background-color,color,transform] duration-150 ease-press active:scale-[0.97] disabled:opacity-40 disabled:active:scale-100'

/** The one thing on the screen somebody came to press. */
export const BUTTON_PRIMARY = `${BUTTON_BASE} bg-accent text-paper hover:bg-accent-strong`

/** An action that belongs to the filled one: Batal beside Simpan, the second
    half of a pair. Apple's tinted button, which is the accent at wash weight
    carrying the accent as its label. */
export const BUTTON_TINTED = `${BUTTON_BASE} bg-accent-wash text-accent hover:bg-accent-wash/70`

/** Everything else with a box around it. The fill is what replaced eight
    different outlines. */
export const BUTTON_QUIET = `${BUTTON_BASE} bg-fill-secondary px-4 text-ink hover:bg-fill`

/** A verb with nothing drawn around it: a row action, a link that does
    something. No box, so it never competes with the three above. */
export const BUTTON_PLAIN = `${BUTTON_BASE} px-2 text-accent hover:bg-fill-quaternary`

/*
  The segmented control, which had three near-identical hand-rolled copies
  before this: a flat row of buttons in a hairline box, the active one filled
  solid with the accent. That reads as a row of tabs, not as Apple's
  segmented control, whose selection is a neutral pill riding a gray track
  rather than a colour change — the same reason `BUTTON_TINTED` exists
  instead of tinting every button that can be pressed.

  The track carries the padding and the outer radius; each segment is its own
  button so keyboard focus and `role="radio"` land on the thing a reader
  actually presses, and `h-11` on the segment itself (not just the track) is
  what keeps it a real target at the phone floor `e2e/mobile.spec.ts` checks
  — a track tall enough to contain a shorter button does not make that
  button tappable.
*/
export const SEGMENTED = 'inline-flex gap-0.5 rounded-lg bg-fill-tertiary p-0.5'
export const SEGMENT =
  'inline-flex h-11 items-center justify-center rounded-[7px] px-3 text-footnote font-medium text-ink-muted transition-colors duration-150 sm:h-9'
export const SEGMENT_ON = 'bg-surface text-ink shadow-xs'

interface LabelProps {
  htmlFor: string
  children: ReactNode
  hint?: string
  /** Hidden from sight, never from a screen reader. */
  visuallyHidden?: boolean
}

export function FieldLabel({ htmlFor, children, hint, visuallyHidden = false }: LabelProps) {
  return (
    <label
      htmlFor={htmlFor}
      className={visuallyHidden ? 'sr-only' : 'block text-subhead font-medium text-ink'}
    >
      {children}
      {hint ? <span className="ml-2 font-normal text-ink-faint">{hint}</span> : null}
    </label>
  )
}
