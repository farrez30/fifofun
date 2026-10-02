'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { deleteEntry } from '@/app/catat/actions'
import { BUTTON_QUIET } from '@/components/field-base'
import type { ActionResult } from '@/lib/actions'
import { restoreEntry, unsplitEntry } from '../actions'
import { useActionToast } from '@/components/use-action-toast'

/**
 * The two irreversible-looking things on this page, neither of which is.
 *
 * Deleting is a `deleted_at`, so the row leaves every total and stays in the
 * database; putting a split back together hides the parts and brings the
 * original back. Both say so, because a button that looks like it destroys
 * something is a button people avoid using correctly.
 *
 * Delete sits behind a disclosure rather than a modal. A modal for a
 * reversible action is theatre, and a confirmation somebody has to open is
 * enough friction to stop a mis-tap.
 */

export function DeleteEntryButton({ id }: { id: string }) {
  const [result, action, pending] = useActionState<ActionResult | null, FormData>(deleteEntry, null)
  useActionToast(result, pending, 'Menghapus…')

  return (
    <details className="squircle rounded-md bg-surface shadow-xs p-4">
      <summary className="cursor-pointer text-subhead text-ink-muted">Hapus transaksi</summary>
      <p className="mt-2 text-footnote text-ink-muted">
        Menghapus hanya menyembunyikan barisnya dari semua hitungan. Datanya tetap ada, dan baris
        dari e-Statement memang tidak bisa dihapus sama sekali.
      </p>
      <form action={action} className="mt-3 flex flex-wrap items-center gap-3">
        {/* deleteEntry reads `transactionId`; this field carried `id` since the
            page shipped, so the button always answered "tidak dikenali". */}
        <input type="hidden" name="transactionId" value={id} />
        <Submit label="Ya, hapus" pendingLabel="Menghapus" />
      </form>
    </details>
  )
}

export function RestoreEntryButton({ id }: { id: string }) {
  const [result, action, pending] = useActionState<ActionResult | null, FormData>(restoreEntry, null)
  useActionToast(result, pending, 'Mengembalikan…')

  return (
    <form action={action} className="mt-3 flex flex-wrap items-center gap-3">
      <input type="hidden" name="id" value={id} />
      <Submit label="Kembalikan transaksi ini" pendingLabel="Mengembalikan" />
    </form>
  )
}

export function UnsplitButton({ id }: { id: string }) {
  const [result, action, pending] = useActionState<ActionResult | null, FormData>(unsplitEntry, null)
  useActionToast(result, pending, 'Menggabungkan…')

  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="id" value={id} />
      <Submit label="Gabungkan kembali" pendingLabel="Menggabungkan" />
    </form>
  )
}

/* Named per verb: "Memproses" said nothing about which of the three was running. */
function Submit({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      aria-busy={pending}
      className={BUTTON_QUIET}
    >
      {pending ? pendingLabel : label}
    </button>
  )
}
