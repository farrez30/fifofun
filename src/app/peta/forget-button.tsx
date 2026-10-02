'use client'

import { useActionState, useEffect, useState } from 'react'
import { BUTTON_PLAIN } from '@/components/field-base'
import { useActionToast } from '@/components/use-action-toast'
import type { ActionResult } from '@/lib/actions'
import { deleteMerchantLocation } from './actions'

interface Props {
  id: string
  label: string
  verb?: string
  /** What is being forgotten, for the screen reader's version of the button. */
  what?: string
}

/** How long the armed state waits for the second press before standing down. */
const ARMED_MS = 4000

/**
 * Forgets a place, or a "tanpa tempat" mark; the merchant goes back to waiting.
 *
 * Two presses, because one would throw away a search and a careful drag: the
 * first turns the button into "Ya, hapus" in the over colour, the second
 * deletes. It stands down by itself, or when focus leaves, so a stray tap
 * costs nothing.
 */
export function ForgetButton({ id, label, verb = 'Hapus', what = 'lokasi' }: Props) {
  const [result, action, pending] = useActionState<ActionResult | null, FormData>(deleteMerchantLocation, null)
  const [armed, setArmed] = useState(false)
  useActionToast(result, pending, 'Menghapus…')

  useEffect(() => {
    if (!armed) return
    const timer = setTimeout(() => setArmed(false), ARMED_MS)
    return () => clearTimeout(timer)
  }, [armed])

  return (
    <form
      action={action}
      onSubmit={(event) => {
        // The first press only arms; React skips the action when this is prevented.
        if (armed) return
        event.preventDefault()
        setArmed(true)
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        aria-busy={pending}
        aria-label={armed ? `Ya, ${verb.toLowerCase()} ${what} ${label}` : `${verb} ${what} ${label}`}
        onBlur={() => setArmed(false)}
        className={`${BUTTON_PLAIN} ${armed ? 'bg-over-wash text-over!' : ''}`}
      >
        {armed ? `Ya, ${verb.toLowerCase()}` : verb}
      </button>
    </form>
  )
}
