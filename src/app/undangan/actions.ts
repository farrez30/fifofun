'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { insertInto, sql } from '@/db/query'
import { SESSION_EXPIRED, context } from '@/lib/actions'
import { expiryFrom, formatCode, generateCode, hashCode } from '@/lib/invites'

/**
 * Issuing and withdrawing invitations.
 *
 * Both run as the signed-in user, so row level security
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

export async function issueInvite(): Promise<IssueResult> {
  const ctx = await context()
  if (!ctx) return { ok: false, message: SESSION_EXPIRED }

  const code = generateCode()

  try {
    await ctx.db.rows(
      insertInto('household_invites', {
        household_id: ctx.householdId,
        code_hash: hashCode(code),
        created_by: ctx.userId,
        expires_at: expiryFrom(new Date()).toISOString(),
      }),
    )
  } catch (e) {
    console.error('[undangan] issue failed', e)
    return { ok: false, message: 'Undangannya gagal dibuat.' }
  }

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
  if (!ctx) return { ok: false, message: SESSION_EXPIRED }

  /*
    Deleted rather than marked withdrawn. A redeemed invitation is a membership
    row now, and that row is the record worth keeping; the invitation that led
    to it is not, and keeping spent hashes around only grows a table nobody
    reads.
  */
  try {
    await ctx.db.rows(sql`
      DELETE FROM public.household_invites
      WHERE id = ${parsed.data.inviteId} AND household_id = ${ctx.householdId} AND redeemed_at IS NULL
      RETURNING id`)
  } catch (e) {
    console.error('[undangan] revoke failed', e)
    return { ok: false, message: 'Undangannya gagal dibatalkan.' }
  }

  revalidatePath('/undangan')
  return { ok: true, message: 'Undangannya dibatalkan.' }
}
