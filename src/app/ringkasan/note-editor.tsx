'use client'

import { useActionState } from 'react'
import { BUTTON_QUIET, CONTROL_TEXT } from '@/components/field-base'
import { SubmitButton } from '@/components/submit-button'
import { useActionToast } from '@/components/use-action-toast'
import type { ActionResult } from '@/lib/actions'
import { saveSummaryNote } from './actions'
import { NOTE_LIMIT } from './note'

/**
 * Where the household writes its plan, folded away: the page is shown to
 * someone else, and an open text box under the figures reads as unfinished.
 */
export function NoteEditor({ note }: { note: string }) {
  const [result, action, saving] = useActionState<ActionResult | null, FormData>(saveSummaryNote, null)
  useActionToast(result, saving)

  return (
    <details className="squircle rounded-md border border-line bg-surface p-4">
      <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-ink">
        {note ? 'Ubah rencana' : 'Tulis rencana'}
      </summary>
      <form action={action} className="mt-3 space-y-3">
        <label htmlFor="rencana-teks" className="block text-sm text-ink-muted">
          Beberapa baris singkat dengan kata-katamu sendiri.
        </label>
        <textarea
          id="rencana-teks"
          name="body"
          defaultValue={note}
          maxLength={NOTE_LIMIT}
          rows={5}
          placeholder="Mulai Okt: nabung 1 jt/bln. DD 2 bln dulu, lalu nikah."
          className={`w-full rounded-sm border border-transparent bg-fill-tertiary px-3 py-2 ${CONTROL_TEXT} text-ink placeholder:text-ink-faint focus:border-accent focus:bg-surface`}
        />
        <SubmitButton className={BUTTON_QUIET}>Simpan rencana</SubmitButton>
      </form>
    </details>
  )
}
