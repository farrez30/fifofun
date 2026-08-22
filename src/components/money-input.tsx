'use client'

import { useId, useState } from 'react'
import { CONTROL, FieldLabel } from '@/components/field-base'
import { normaliseTyped, toInputText } from '@/lib/money/input'

/**
 * Rupiah in, sen out.
 *
 * Written rather than pulled from a component library on purpose. The default
 * look of every popular kit is itself the thing that makes generated
 * interfaces recognisable, and this carries two behaviours a generic input
 * does not: money is held as `bigint` sen and never as a float, and typing is
 * forgiving, because somebody pasting `Rp1.552.574` from a statement should
 * not have to clean it up first.
 *
 * Two things it learned when it moved out of the planner. It re-reads its own
 * value prop, so a saved figure arriving after mount, or a reset, actually
 * shows; the old one seeded its text once and then quietly disagreed with the
 * state it was meant to display. And with `name` it emits a hidden field
 * carrying the amount as plain sen digits, which is the one shape every server
 * action parses.
 */

interface MoneyInputProps {
  label: string
  value: bigint
  onChange: (sen: bigint) => void
  hint?: string
  /** Shown under the field, typically where a figure came from. */
  note?: string
  /** Submits the value as sen digits in a hidden field of this name. */
  name?: string
  /** Accept a comma and up to two decimals. Off by default: nobody budgets in sen. */
  decimals?: boolean
  size?: 'md' | 'sm'
  /** Keep the label for screen readers only, for a field inside a dense row. */
  hideLabel?: boolean
  className?: string
}

export function MoneyInput({
  label,
  value,
  onChange,
  hint,
  note,
  name,
  decimals = false,
  size = 'md',
  hideLabel = false,
  className = '',
}: MoneyInputProps) {
  const id = useId()
  const [text, setText] = useState(() => toInputText(value, decimals))
  // The value this field last agreed with. Comparing against it rather than
  // against the parsed text is what lets a parent set the amount from outside
  // without fighting whatever is half typed.
  const [known, setKnown] = useState(value)

  if (value !== known) {
    setKnown(value)
    setText(toInputText(value, decimals))
  }

  function handle(raw: string) {
    const typed = normaliseTyped(raw, { decimals })
    setText(typed.text)
    setKnown(typed.sen)
    onChange(typed.sen)
  }

  const compact = size === 'sm'

  return (
    <div className={`space-y-1.5 ${className}`}>
      <FieldLabel htmlFor={id} hint={hint} visuallyHidden={hideLabel}>
        {label}
      </FieldLabel>
      <div className="relative">
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute inset-y-0 flex items-center font-mono text-sm text-ink-faint ${
            compact ? 'left-2' : 'left-3'
          }`}
        >
          Rp
        </span>
        <input
          id={id}
          type="text"
          inputMode={decimals ? 'decimal' : 'numeric'}
          autoComplete="off"
          value={text}
          onChange={(event) => handle(event.target.value)}
          className={`${CONTROL} tnum font-mono ${compact ? 'h-10 w-36 pl-8' : 'pl-10'}`}
          placeholder="0"
        />
        {/* The visible field carries no name: what the server reads is sen,
            and what a person types is Rupiah with separators in it. */}
        {name ? <input type="hidden" name={name} value={value.toString()} /> : null}
      </div>
      {note ? <p className="text-xs text-ink-muted">{note}</p> : null}
    </div>
  )
}
