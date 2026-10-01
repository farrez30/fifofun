'use client'

import type { ButtonHTMLAttributes } from 'react'
import { useFormStatus } from 'react-dom'

/**
 * A submit button that knows when its own form is waiting.
 *
 * For lists where every row is its own form but the rows share one action
 * state: a `pending` passed down from that state would spin every row's
 * button at once. `useFormStatus` reads the form this button sits in, so only
 * the row that was pressed says it is busy. With a `name` and `value`, as in
 * a form with two submit buttons, only the one that was pressed spins.
 */
export function SubmitButton({ disabled, name, value, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { pending, data } = useFormStatus()
  const mine = pending && (name === undefined || data?.get(name) === String(value))

  return (
    <button
      {...props}
      type="submit"
      name={name}
      value={value}
      disabled={pending || disabled}
      aria-busy={mine}
    />
  )
}
