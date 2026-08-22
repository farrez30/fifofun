import { z } from 'zod'
import { MAX_SEN, parseIdAmount } from '@/lib/money'
import { createClient } from '@/lib/supabase/server'

/**
 * What every server action shares: the result shape, the session and household
 * lookup, and the zod fields that read money and dates out of a form.
 *
 * This file deliberately carries no `'use server'` directive. A module marked
 * that way may only export async functions, and half of this is schemas and
 * constants. It imports the server-side Supabase client, so it must never be
 * imported from a client component either; the action files that use it are
 * the boundary.
 *
 * Money arrives as sen digits. `MoneyInput` writes the amount it holds into a
 * hidden field as a plain string of digits, so the server parses one shape
 * with one parser and never goes through a float. `rupiahField` exists for a
 * free-text input that is not a `MoneyInput`; nothing uses it yet.
 */

export interface ActionResult {
  ok: boolean
  message: string
  detail?: string
  /** How many rows the decision touched. */
  applied?: number
}

export function fail(message: string, detail?: string): ActionResult {
  return { ok: false, message, detail }
}

export const SESSION_EXPIRED = 'Sesi kamu sudah berakhir. Masuk lagi lalu ulangi.'

/** The signed-in user and the household RLS lets them see, or null for either missing. */
export async function context() {
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

  return { supabase, householdId: household.id as string }
}

/** Sen as digits, bounded. '0' is a legal zero; whether zero is allowed is the caller's call. */
export const senField = z
  .string()
  .trim()
  .regex(/^\d{1,18}$/, 'Nominalnya belum bisa dibaca.')
  .transform((digits) => BigInt(digits))
  .refine((sen) => sen <= MAX_SEN, 'Nominalnya di luar jangkauan.')

export const positiveSen = senField.refine((sen) => sen > 0n, 'Nominalnya harus lebih dari nol.')

/** A money field that may be left empty; '' and '0' both mean none. */
export const optionalSen = z
  .string()
  .trim()
  .transform((digits) => (digits === '' || digits === '0' ? null : digits))
  .pipe(senField.nullable())

/** Indonesian money text ("1.552.574,00") from an input that is not a MoneyInput. */
export const rupiahField = z
  .string()
  .trim()
  .transform((raw, ctx) => {
    if (raw === '') {
      ctx.addIssue({ code: 'custom', message: 'Nominalnya belum diisi.' })
      return z.NEVER
    }
    let sen: bigint
    try {
      sen = parseIdAmount(raw)
    } catch {
      ctx.addIssue({ code: 'custom', message: 'Nominalnya belum bisa dibaca.' })
      return z.NEVER
    }
    if (sen < 0n || sen > MAX_SEN) {
      ctx.addIssue({ code: 'custom', message: 'Nominalnya di luar jangkauan.' })
      return z.NEVER
    }
    return sen
  })

/** `YYYY-MM`, or nothing. */
export const monthKeyField = z
  .string()
  .trim()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Bulannya harus YYYY-MM')
  .or(z.literal(''))
  .transform((value) => (value === '' ? null : value))

export const optionalUuid = z
  .string()
  .trim()
  .transform((value) => (value === '' ? null : value))
  .pipe(z.uuid().nullable())

/** What a date input submits. */
export const isoDateField = z
  .string()
  .trim()
  .regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, 'Tanggalnya belum lengkap.')

/** What a time input submits, to the minute. */
export const hhmmField = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Jamnya belum lengkap.')
