'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { expiryFrom, formatCode, generateCode, hashCode } from '@/lib/invites'
import { createClient } from '@/lib/supabase/server'

/**
 * Issuing and withdrawing invitations.
 *
 * Both go through PostgREST on the user's own token, so row level security
 * decides which household an invitation can be written into. Nothing here needs
 * the definer function: writing a row into your own household is exactly what
 * the ordinary policy already allows. Redeeming is the part that does not fit,
 * and that lives in the database.
 */

export interface IssueResult {
  ok: boolean
  message: string
  /**
   * The code, in plain text, exactly once.
   *
   * Only the hash is stored, so this is the only moment it exists anywhere
   * outside the browser showing it. Reissuing is cheap; recovering is not
   * possible, and that is the property worth keeping.
   */
  code?: string
}

async function context() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: household } = await supabase
    .from('households')
    .select('id')
    .limit(1)
    .maybeSingle()
  if (!household) return null

  return { supabase, householdId: household.id as string, userId: user.id }
}

export async function issueInvite(): Promise<IssueResult> {
  const ctx = await context()
  if (!ctx) return { ok: false, message: 'Sesi kamu sudah berakhir. Masuk lagi lalu ulangi.' }

  const code = generateCode()

  const { error } = await ctx.supabase.from('household_invites').insert({
    household_id: ctx.householdId,
    code_hash: hashCode(code),
    created_by: ctx.userId,
    expires_at: expiryFrom(new Date()).toISOString(),
  })

  if (error) return { ok: false, message: 'Undangannya gagal dibuat.' }

  revalidatePath('/undangan')
  return { ok: true, message: 'Undangan dibuat.', code: formatCode(code) }
}

const revokeSchema = z.object({ inviteId: z.uuid() })

export async function revokeInvite(
  _previous: IssueResult | null,
  formData: FormData,
): Promise<IssueResult> {
  const parsed = revokeSchema.safeParse({ inviteId: formData.get('inviteId') })
  if (!parsed.success) return { ok: false, message: 'Undangan itu tidak dikenali.' }

  const ctx = await context()
  if (!ctx) return { ok: false, message: 'Sesi kamu sudah berakhir. Masuk lagi lalu ulangi.' }

  /*
    Deleted rather than marked withdrawn. A redeemed invitation is a membership
    row now, and that row is the record worth keeping; the invitation that led
    to it is not, and keeping spent hashes around only grows a table nobody
    reads.
  */
  const { error } = await ctx.supabase
    .from('household_invites')
    .delete()
    .eq('id', parsed.data.inviteId)
    .is('redeemed_at', null)

  if (error) return { ok: false, message: 'Undangannya gagal dibatalkan.' }

  revalidatePath('/undangan')
  return { ok: true, message: 'Undangannya dibatalkan.' }
}
