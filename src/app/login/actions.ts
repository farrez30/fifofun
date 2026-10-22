'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { asService, sql } from '@/db/query'
import { signIn, signOut as endSession, signUp } from '@/lib/auth/gerbang'
import { hashCode, normaliseCode } from '@/lib/invites'

/**
 * Sign in and sign up.
 *
 * Errors are returned rather than thrown so the form can show them in place.
 * The messages stay deliberately vague about which half of a credential pair
 * was wrong, because a precise message tells an attacker which addresses have
 * accounts.
 *
 * Signing up needs an invitation. The check happens before the account is
 * created rather than after, because an account that exists and can never
 * belong to a household is a dead end for whoever made it and a row somebody
 * else has to look at.
 */

const credentials = z.object({
  email: z.email('Masukkan alamat email yang valid'),
  password: z.string().min(8, 'Kata sandi minimal 8 karakter'),
})

export interface AuthState {
  error?: string
  notice?: string
}

function readCredentials(formData: FormData) {
  return credentials.safeParse({
    email: String(formData.get('email') ?? ''),
    password: String(formData.get('password') ?? ''),
  })
}

/**
 * One action for both paths, selected by the submit button that was pressed.
 * Two separate actions would need two `useActionState` hooks and a `formAction`
 * whose return type React does not accept.
 */
export async function authenticate(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = readCredentials(formData)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Periksa kembali isian kamu.' }
  }

  if (formData.get('intent') === 'signup') {
    const code = normaliseCode(String(formData.get('code') ?? ''))
    if (!code) {
      return { error: 'Kode undangannya belum benar. Sepuluh karakter, tanpa huruf I, L atau O.' }
    }

    /*
      Only the hash is sent. The code never reaches the database, so it cannot
      turn up in a statement log, and the function answers with a bare boolean
      so a caller with no account learns nothing else from asking. Asked as the
      owner because there is no session yet.
    */
    const invite = await asService.maybeOne<{ open: boolean }>(
      sql`SELECT public.invite_is_open(p_code_hash => ${hashCode(code)}) AS open`,
    )
    if (invite?.open !== true) {
      return { error: 'Kode undangan itu tidak berlaku. Minta yang baru ke anggota rumah tangga.' }
    }

    const created = await signUp(parsed.data.email, parsed.data.password)
    if (!created.ok) {
      if (!created.taken) console.error('[login] gagal mendaftarkan akun')
      return { error: 'Akun ini tidak bisa dibuat sekarang. Coba lagi sebentar lagi.' }
    }

    /*
      There is no email confirmation step any more, so the new account signs in
      straight away and lands on /gabung, where the code is spent with a
      session in hand. /gabung stays the one place that redeems a code.
    */
    if ((await signIn(parsed.data.email, parsed.data.password)) !== 'ok') {
      return { notice: 'Akun dibuat. Masuk dengan email dan kata sandinya, lalu pakai kode undangan yang sama.' }
    }
    redirect('/gabung')
  }

  const result = await signIn(parsed.data.email, parsed.data.password)
  if (result === 'throttled') {
    return { error: 'Terlalu banyak percobaan masuk. Tunggu satu menit, lalu coba lagi.' }
  }
  // Deliberately vague: naming which half was wrong tells an attacker which
  // addresses have accounts.
  if (result !== 'ok') return { error: 'Email atau kata sandi tidak cocok.' }

  redirect('/')
}

export async function signOut(): Promise<void> {
  await endSession()
  redirect('/login')
}
