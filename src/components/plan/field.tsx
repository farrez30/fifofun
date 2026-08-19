'use client'

import { useId, useState } from 'react'
import { formatIdr } from '@/lib/money'

/**
 * Form primitives for the planner.
 *
 * Written rather than pulled from a component library on purpose. The default
 * look of every popular kit is itself the thing that makes generated interfaces
 * recognisable, and these carry two behaviours a generic input does not: money
 * is held as `bigint` sen and never as a float, and every control states its
 * unit so a figure is never ambiguous about what it means.
 */

const CONTROL =
  'h-11 w-full rounded-sm border border-line bg-surface px-3 text-sm text-ink transition-colors duration-150 placeholder:text-ink-faint hover:border-line-strong focus:border-accent'

interface LabelProps {
  htmlFor: string
  children: React.ReactNode
  hint?: string
}

function FieldLabel({ htmlFor, children, hint }: LabelProps) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-medium text-ink">
      {children}
      {hint ? <span className="ml-2 font-normal text-ink-faint">{hint}</span> : null}
    </label>
  )
}

interface MoneyInputProps {
  label: string
  value: bigint
  onChange: (sen: bigint) => void
  hint?: string
  /** Shown under the field, typically where a figure came from. */
  note?: string
}

/**
 * Rupiah in, sen out.
 *
 * Typing is deliberately forgiving: separators are stripped rather than
 * rejected, because a user pasting `Rp1.552.574` from a statement should not
 * have to clean it up first. Only whole Rupiah are accepted, since nobody
 * budgets in sen, and the value is scaled to sen at the boundary so the rest of
 * the app never sees a decimal.
 */
export function MoneyInput({ label, value, onChange, hint, note }: MoneyInputProps) {
  const id = useId()
  const [text, setText] = useState(() => (value === 0n ? '' : formatRupiah(value)))

  function handle(raw: string) {
    const digits = raw.replace(/\D/g, '')
    setText(digits === '' ? '' : new Intl.NumberFormat('id-ID').format(Number(digits)))
    onChange(digits === '' ? 0n : BigInt(digits) * 100n)
  }

  return (
    <div className="space-y-1.5">
      <FieldLabel htmlFor={id} hint={hint}>
        {label}
      </FieldLabel>
      <div className="relative">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-3 flex items-center font-mono text-sm text-ink-faint"
        >
          Rp
        </span>
        <input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={text}
          onChange={(event) => handle(event.target.value)}
          className={`${CONTROL} pl-10 tnum font-mono`}
          placeholder="0"
        />
      </div>
      {note ? <p className="text-xs text-ink-muted">{note}</p> : null}
    </div>
  )
}

function formatRupiah(sen: bigint): string {
  return formatIdr(sen, { symbol: false })
}

interface NumberFieldProps {
  label: string
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  hint?: string
  unit?: string
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
}: NumberFieldProps) {
  const id = useId()
  const clamp = (next: number) => Math.min(max, Math.max(min, next))

  return (
    <div className="space-y-1.5">
      <FieldLabel htmlFor={id} hint={hint}>
        {label}
      </FieldLabel>
      <div className="flex items-stretch">
        <button
          type="button"
          onClick={() => onChange(clamp(value - 1))}
          disabled={value <= min}
          aria-label={`Kurangi ${label.toLowerCase()}`}
          className="h-11 w-11 shrink-0 rounded-l-sm border border-line text-ink transition-colors duration-150 hover:border-line-strong hover:bg-sunken disabled:opacity-40"
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
          className="h-11 w-full border-y border-line bg-surface px-3 text-center tnum font-mono text-sm text-ink focus:border-accent"
        />
        <button
          type="button"
          onClick={() => onChange(clamp(value + 1))}
          disabled={value >= max}
          aria-label={`Tambah ${label.toLowerCase()}`}
          className="h-11 w-11 shrink-0 rounded-r-sm border border-line text-ink transition-colors duration-150 hover:border-line-strong hover:bg-sunken disabled:opacity-40"
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
}

export function Toggle({ label, checked, onChange, description }: ToggleProps) {
  const id = useId()
  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-accent)]"
      />
      <div>
        <label htmlFor={id} className="text-sm text-ink">
          {label}
        </label>
        {description ? <p className="text-xs text-ink-muted">{description}</p> : null}
      </div>
    </div>
  )
}

interface SectionProps {
  id: string
  title: string
  lead?: string
  children: React.ReactNode
}

export function Section({ id, title, lead, children }: SectionProps) {
  return (
    <section aria-labelledby={id} className="scroll-mt-20">
      <h2 id={id} className="text-base font-semibold tracking-tight text-ink">
        {title}
      </h2>
      {lead ? <p className="mt-1 max-w-2xl text-sm text-ink-muted">{lead}</p> : null}
      <div className="mt-4 space-y-4">{children}</div>
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
