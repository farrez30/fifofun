'use client'

import { useRouter } from 'next/navigation'
import { CONTROL } from '@/components/field-base'

/**
 * Straight to a place in a long list: a page by number, or a month.
 *
 * A native select, because on a phone it opens the system wheel and a hundred
 * pages are one flick away. Options that carry an address navigate there; a
 * client list passes `onSelect` and pages itself instead.
 */
export function JumpSelect({
  label,
  options,
  value,
  onSelect,
  className = '',
}: {
  /** Read out for the control; the visible text is the chosen option itself. */
  label: string
  options: { value: string; label: string; href?: string }[]
  value: string
  onSelect?: (value: string) => void
  className?: string
}) {
  const router = useRouter()

  return (
    <select
      aria-label={label}
      value={value}
      onChange={(event) => {
        const next = event.target.value
        if (onSelect) {
          onSelect(next)
          return
        }
        const href = options.find((option) => option.value === next)?.href
        if (href) router.push(href)
      }}
      className={`${CONTROL} tnum w-auto! font-mono ${className}`}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}
