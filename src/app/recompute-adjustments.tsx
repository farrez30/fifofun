'use client'

import { useActionState } from 'react'
import { BUTTON_QUIET } from '@/components/field-base'
import { useActionToast } from '@/components/use-action-toast'
import { recomputeAdjustments } from './catat/actions'

/** The one button on the attention card: put stale balance corrections back on their claim. */
export function RecomputeAdjustments() {
  const [result, action, pending] = useActionState(() => recomputeAdjustments(), null)
  useActionToast(result, pending, 'Menghitung ulang…')

  return (
    <form action={action} className="mt-2">
      <button type="submit" disabled={pending} aria-busy={pending} className={BUTTON_QUIET}>
        Hitung ulang penyesuaian
      </button>
    </form>
  )
}
