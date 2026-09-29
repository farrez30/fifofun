'use client'

import { useEffect, useId, useRef } from 'react'
import { toast } from 'sonner'

/** The part of an action's answer a toast can say. */
export interface Outcome {
  ok: boolean
  message: string
  detail?: string
}

/**
 * One toast per form, following a save from start to finish.
 *
 * "Menyimpan…" appears the moment the action is pending and is replaced in
 * place, under the same id, by the outcome, so a save is one notice that
 * changes rather than two that stack. A failure stays until it is closed:
 * a message somebody has to act on should not time out while they read it.
 *
 * An action that ends with no new answer (the request itself failed) removes
 * the spinner instead of leaving it turning forever.
 */
export function useActionToast(result: Outcome | null, pending: boolean, loading = 'Menyimpan…') {
  const id = useId()
  const announced = useRef(result)
  const spinning = useRef(false)

  useEffect(() => {
    if (pending) {
      if (!spinning.current) toast.loading(loading, { id })
      spinning.current = true
      return
    }

    if (result && result !== announced.current) {
      announced.current = result
      spinning.current = false
      if (result.ok) toast.success(result.message, { id, description: result.detail })
      else toast.error(result.message, { id, description: result.detail, duration: Infinity })
      return
    }

    if (spinning.current) {
      spinning.current = false
      toast.dismiss(id)
    }
  }, [pending, result, loading, id])
}

/**
 * The same notice, wrapped around the work itself rather than watching state.
 *
 * For a drag that saves an order, and for a form whose component leaves the
 * screen the moment it succeeds (a settled review group): an effect in a
 * component that has unmounted never runs, and its spinner would turn forever.
 * A request that never answers comes back as a failed result, not a throw, so
 * it cannot take the page's error boundary down with it.
 */
export async function withToast<T extends Outcome>(work: Promise<T>, loading = 'Menyimpan…'): Promise<T> {
  const id = toast.loading(loading)
  try {
    const result = await work
    if (result.ok) toast.success(result.message, { id, description: result.detail })
    else toast.error(result.message, { id, description: result.detail, duration: Infinity })
    return result
  } catch {
    const failed = { ok: false, message: 'Gagal tersambung ke server.', detail: 'Periksa koneksi, lalu coba lagi.' }
    toast.error(failed.message, { id, description: failed.detail, duration: Infinity })
    return failed as T
  }
}
