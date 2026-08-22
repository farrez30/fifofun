'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { deleteEntry } from '@/app/catat/actions'
import type { ActionResult } from '@/lib/actions'
import { unsplitEntry } from '../actions'

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
  const [result, action] = useActionState<ActionResult | null, FormData>(deleteEntry, null)

  return (
    <details className="border border-line bg-surface p-4">
      <summary className="cursor-pointer text-sm text-ink-muted">Hapus transaksi</summary>
      <p className="mt-2 text-xs text-ink-muted">
        Menghapus hanya menyembunyikan barisnya dari semua hitungan. Datanya tetap ada, dan baris
        dari e-Statement memang tidak bisa dihapus sama sekali.
      </p>
      <form action={action} className="mt-3 flex flex-wrap items-center gap-3">
        <input type="hidden" name="id" value={id} />
        <Submit label="Ya, hapus" />
        {result ? (
          <p role="status" className={`text-sm ${result.ok ? 'text-under' : 'text-over'}`}>
            {result.message}
            {result.detail ? <span className="text-ink-muted"> {result.detail}</span> : null}
          </p>
        ) : null}
      </form>
    </details>
  )
}

export function UnsplitButton({ id }: { id: string }) {
  const [result, action] = useActionState<ActionResult | null, FormData>(unsplitEntry, null)

  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="id" value={id} />
      <Submit label="Gabungkan kembali" />
      {result ? (
        <p role="status" className={`text-sm ${result.ok ? 'text-under' : 'text-over'}`}>
          {result.message}
          {result.detail ? <span className="text-ink-muted"> {result.detail}</span> : null}
        </p>
      ) : null}
    </form>
  )
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-11 rounded-sm border border-line-strong px-3 text-sm text-ink transition-colors duration-150 hover:bg-sunken disabled:opacity-40"
    >
      {pending ? 'Memproses' : label}
    </button>
  )
}
