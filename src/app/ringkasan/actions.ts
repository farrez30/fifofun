'use server'

import { revalidatePath, updateTag } from 'next/cache'
import { z } from 'zod'
import { SESSION_EXPIRED, context, fail, writeFailed, type ActionResult } from '@/lib/actions'
import { summaryNoteTag } from '@/lib/queries/tags'
import { NOTE_LIMIT } from './note'

/**
 * The few lines of the household's own under the summary.
 *
 * Plain text, kept as typed apart from trailing spaces and blank lines at the
 * ends; the page prints it as text, so nothing in it can become markup.
 */

const noteSchema = z
  .string()
  .transform((value) => value.replace(/\r\n/g, '\n').trim())
  .pipe(z.string().max(NOTE_LIMIT, `Rencana maksimal ${NOTE_LIMIT} huruf.`))

export async function saveSummaryNote(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = noteSchema.safeParse(String(formData.get('body') ?? ''))
  if (!parsed.success) return fail('Rencananya belum bisa disimpan.', parsed.error.issues[0]?.message)

  const ctx = await context()
  if (!ctx) return fail(SESSION_EXPIRED)

  const { error } = await ctx.supabase
    .from('summary_notes')
    .upsert({ household_id: ctx.householdId, body: parsed.data }, { onConflict: 'household_id' })
    .select('household_id')
  if (error) return writeFailed('ringkasan', 'Rencananya gagal disimpan.', error)

  updateTag(summaryNoteTag(ctx.householdId))
  revalidatePath('/ringkasan')
  return { ok: true, message: parsed.data ? 'Rencana disimpan.' : 'Rencana dikosongkan.' }
}
