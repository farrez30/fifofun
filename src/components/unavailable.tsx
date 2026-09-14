import type { Icon } from '@phosphor-icons/react'
import type { ReactNode } from 'react'

/**
 * The screen that has nothing to show yet.
 *
 * Apple gives this one shape and one name, and the shape is worth copying
 * because it answers three questions in a fixed order: a glyph says what kind
 * of thing is missing, a title says it is missing rather than broken, a
 * sentence says how it stops being missing, and an action does that. Anything
 * that skips a step reads as a failure rather than as a beginning.
 *
 * There were about twenty of these written separately here, all of them saying
 * the right words in slightly different boxes. Only the panel-sized ones use
 * this; a line of explanation under a table header is a hint, not a state, and
 * wrapping one in a centred layout with a glyph would make the page shout
 * about a column that is merely empty this month.
 *
 * The copy stays exactly as it was. `docs/copywriting.md` governs it and this
 * component has no opinion about it beyond where the lines sit.
 */
export function Unavailable({
  glyph: Glyph,
  title,
  children,
  action,
  heading = false,
}: {
  glyph: Icon
  /** One line. Says what is absent, never how the reader feels about it. */
  title: string
  /** How it stops being absent. Two sentences at most, per the copy guide. */
  children: ReactNode
  /** The thing that fixes it, if fixing it is one step away. */
  action?: ReactNode
  /** Use a real heading where this replaces a whole section of the page. */
  heading?: boolean
}) {
  const Title = heading ? 'h2' : 'p'

  return (
    <div className="squircle rounded-md bg-surface p-10 text-center shadow-xs">
      {/*
        Hidden from assistive technology on purpose. It repeats the title in a
        picture, and a screen reader that announced both would say the same
        thing twice before reaching the sentence that actually helps.
      */}
      <Glyph aria-hidden="true" weight="light" className="mx-auto size-10 text-ink-faint" />
      <Title className="mt-3 text-title3 font-semibold tracking-title3 text-ink">{title}</Title>
      <div className="mx-auto mt-2 max-w-md text-subhead text-ink-muted">{children}</div>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  )
}
