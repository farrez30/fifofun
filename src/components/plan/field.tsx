'use client'

import { useId } from 'react'
import { CONTROL, FieldLabel } from '@/components/field-base'

/**
 * Form primitives for the planner.
 *
 * Written rather than pulled from a component library on purpose. The default
 * look of every popular kit is itself the thing that makes generated interfaces
 * recognisable, and these carry a behaviour a generic input does not: every
 * control states its unit, so a figure is never ambiguous about what it means.
 *
 * The money input used to live here too. It now serves six pages, so it sits
 * in `@/components/money-input` and is re-exported here for the panels that
 * have always imported it from this file.
 */

export { MoneyInput } from '@/components/money-input'

interface NumberFieldProps {
  label: string
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  hint?: string
  unit?: string
  /** `sm` for a field riding in the dock, where every row costs scroll depth. */
  size?: 'md' | 'sm'
  /** Keep the label for screen readers only, for a field inside a dense row. */
  hideLabel?: boolean
}

/** A stepper, because typing a number between one and four is absurd on a phone. */
export function NumberField({
  label,
  value,
  onChange,
  min = 0,
  max = 10,
  hint,
  unit,
  size = 'md',
  hideLabel = false,
}: NumberFieldProps) {
  const id = useId()
  const clamp = (next: number) => Math.min(max, Math.max(min, next))
  // The buttons stay tap-sized even when compact: a stepper is the one control
  // on this page that gets tapped rather than typed into.
  const box = size === 'sm' ? 'h-10 w-10' : 'h-11 w-11'
  const field = size === 'sm' ? 'h-10 w-14' : 'h-11 w-full'

  return (
    <div className="space-y-1.5">
      <FieldLabel htmlFor={id} hint={hint} visuallyHidden={hideLabel}>
        {label}
      </FieldLabel>
      <div className="flex items-stretch">
        <button
          type="button"
          onClick={() => onChange(clamp(value - 1))}
          disabled={value <= min}
          aria-label={`Kurangi ${label.toLowerCase()}`}
          className={`${box} shrink-0 rounded-l-sm border border-line text-ink transition-colors duration-150 hover:border-line-strong hover:bg-sunken disabled:opacity-40`}
        >
          <span aria-hidden="true">−</span>
        </button>
        <input
          id={id}
          type="number"
          inputMode="numeric"
          value={value}
          min={min}
          max={max}
          onChange={(event) => onChange(clamp(Number(event.target.value)))}
          className={`${field} border-y border-line bg-surface px-2 text-center tnum font-mono text-sm text-ink focus:border-accent`}
        />
        <button
          type="button"
          onClick={() => onChange(clamp(value + 1))}
          disabled={value >= max}
          aria-label={`Tambah ${label.toLowerCase()}`}
          className={`${box} shrink-0 rounded-r-sm border border-line text-ink transition-colors duration-150 hover:border-line-strong hover:bg-sunken disabled:opacity-40`}
        >
          <span aria-hidden="true">+</span>
        </button>
      </div>
      {unit ? <p className="text-xs text-ink-muted">{unit}</p> : null}
    </div>
  )
}

interface Option<T extends string> {
  value: T
  label: string
  description?: string
}

interface SelectFieldProps<T extends string> {
  label: string
  value: T
  options: Option<T>[]
  onChange: (value: T) => void
  hint?: string
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  hint,
}: SelectFieldProps<T>) {
  const id = useId()
  const selected = options.find((option) => option.value === value)

  return (
    <div className="space-y-1.5">
      <FieldLabel htmlFor={id} hint={hint}>
        {label}
      </FieldLabel>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className={CONTROL}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {selected?.description ? (
        <p className="text-xs text-ink-muted">{selected.description}</p>
      ) : null}
    </div>
  )
}

interface ToggleProps {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  description?: string
  /** `chip` puts the box and its label on one line, for the dock. */
  variant?: 'stacked' | 'chip'
}

/**
 * A yes or no.
 *
 * The checkbox stays a real checkbox in both variants rather than becoming a
 * styled span with a click handler. A chip that only looks pressed is
 * invisible to a screen reader and to a keyboard, and the browser's own
 * control already answers both.
 */
export function Toggle({
  label,
  checked,
  onChange,
  description,
  variant = 'stacked',
}: ToggleProps) {
  const id = useId()
  const chip = variant === 'chip'

  /*
    The label is the target, and it is at least as tall as a finger.

    A sixteen pixel box beside eighteen pixels of text is a nine by eighteen
    hit area, which fails the minimum target size and is miserable on a phone.
    The account chips in this app already got this right at forty-four; this is
    the same shape.
  */
  return (
    <label
      htmlFor={id}
      className={
        chip
          ? `inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-sm border px-2.5 transition-colors duration-150 ${
              checked ? 'border-accent bg-accent-wash' : 'border-line bg-paper'
            }`
          : 'flex min-h-11 cursor-pointer items-start gap-3 py-1.5'
      }
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className={`h-4 w-4 shrink-0 accent-[var(--color-accent)] ${chip ? '' : 'mt-0.5'}`}
      />
      <span>
        <span className={`block text-ink ${chip ? 'text-xs' : 'text-sm'}`}>{label}</span>
        {description && !chip ? (
          <span className="block text-xs text-ink-muted">{description}</span>
        ) : null}
      </span>
    </label>
  )
}

interface SectionProps {
  id: string
  title: string
  lead?: string
  /** Printed in the header band, so a long page has places rather than scroll depth. */
  index?: number
  /**
   * `card` is a section of the page. `bar` is the same section riding in the
   * dock at the top, where a heading band would cost the height the dock is
   * trying to save.
   */
  variant?: 'card' | 'bar'
  children: React.ReactNode
}

/**
 * One question of the plan.
 *
 * Six headings on one background read as one very long article, which is what
 * they were: nothing said where an answer stopped and the next question began.
 * A card draws that boundary with a band rather than with more whitespace,
 * because whitespace between two identical blocks is not a boundary, it is a
 * gap.
 *
 * Both variants render the same element tree. The dock swaps a section from
 * one to the other while a person is typing in it, and rebuilding the subtree
 * would take the focus and the caret with it.
 */
export function Section({ id, title, lead, index, variant = 'card', children }: SectionProps) {
  const bar = variant === 'bar'

  return (
    <section
      aria-labelledby={id}
      // Cleared by the dock, which is the tallest thing that can cover an
      // anchor when one is jumped to.
      className={`scroll-mt-32 ${bar ? '' : 'border border-line bg-paper'}`}
    >
      <div
        className={
          bar
            ? 'sr-only'
            : 'flex items-baseline gap-3 border-b border-line bg-sunken px-4 py-3 sm:px-5'
        }
      >
        {index === undefined ? null : (
          <span aria-hidden="true" className="tnum font-mono text-xs text-ink-faint">
            {String(index).padStart(2, '0')}
          </span>
        )}
        <div className="min-w-0">
          <h2 id={id} className="text-base font-semibold tracking-tight text-ink">
            {title}
          </h2>
          {lead ? <p className="mt-1 max-w-2xl text-sm text-ink-muted">{lead}</p> : null}
        </div>
      </div>
      <div className={bar ? 'space-y-2 px-3 py-2' : 'space-y-4 p-4 sm:p-5'}>{children}</div>
    </section>
  )
}

interface SourceNoteProps {
  source: string
  url?: string
  confidence: 'regulator' | 'industry' | 'derived'
  retrievedAt?: string
}

const CONFIDENCE_LABEL = {
  regulator: 'Sumber resmi',
  industry: 'Praktik industri',
  derived: 'Diturunkan di aplikasi ini',
} as const

/**
 * The citation that appears under every domain figure.
 *
 * A planner that cannot say where a number came from is a calculator with
 * opinions, so this is a primitive rather than something remembered case by
 * case. The confidence label matters as much as the source: a reader deserves
 * to know when a figure is a regulator's and when it is a rule of thumb.
 */
export function SourceNote({ source, url, confidence, retrievedAt }: SourceNoteProps) {
  return (
    <p className="text-xs text-ink-faint">
      <span className="text-ink-muted">{CONFIDENCE_LABEL[confidence]}</span>
      {' · '}
      {url ? (
        <a href={url} target="_blank" rel="noreferrer noopener" className="underline underline-offset-2 hover:text-ink">
          {source}
        </a>
      ) : (
        source
      )}
      {retrievedAt ? ` · diperiksa ${retrievedAt}` : null}
    </p>
  )
}
