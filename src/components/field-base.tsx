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

export const CONTROL =
  'h-11 w-full rounded-sm border border-line bg-surface px-3 text-sm text-ink transition-colors duration-150 placeholder:text-ink-faint hover:border-line-strong focus:border-accent'

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
      className={visuallyHidden ? 'sr-only' : 'block text-sm font-medium text-ink'}
    >
      {children}
      {hint ? <span className="ml-2 font-normal text-ink-faint">{hint}</span> : null}
    </label>
  )
}
