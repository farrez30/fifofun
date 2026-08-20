'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { hashCode, normaliseCode } from '@/lib/invites'
import { createClient } from '@/lib/supabase/server'

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
    return { error: parsed.error.issues[0]?.message ?? 'Periksa kembali isian kamu' }
  }

  const supabase = await createClient()

  if (formData.get('intent') === 'signup') {
    const code = normaliseCode(String(formData.get('code') ?? ''))
    if (!code) {
      return { error: 'Kode undangannya belum benar. Sepuluh karakter, tanpa huruf I, L atau O.' }
    }

    /*
      Only the hash is sent. The code never reaches the database, so it cannot
      turn up in a statement log, and the function answers with a bare boolean
      so an unauthenticated caller learns nothing else from asking.
    */
    const { data: open } = await supabase.rpc('invite_is_open', { p_code_hash: hashCode(code) })
    if (open !== true) {
      return { error: 'Kode undangan itu tidak berlaku. Minta yang baru ke anggota rumah tangga.' }
    }

    const { error } = await supabase.auth.signUp(parsed.data)
    if (error) return { error: error.message }

    /*
      The invitation is spent at /gabung, not here. Whether sign-up returns a
      session depends on whether the project asks for email confirmation, and
      spending the code on a path that has no session yet would consume it for
      an account that may never be confirmed.
    */
    return {
      notice:
        'Akun dibuat. Kalau konfirmasi email diminta, buka tautannya dulu. Lalu masuk dan pakai kode undangan yang sama sekali lagi.',
    }
  }

  const { error } = await supabase.auth.signInWithPassword(parsed.data)
  // Deliberately vague: naming which half was wrong tells an attacker which
  // addresses have accounts.
  if (error) return { error: 'Email atau kata sandi tidak cocok' }

  redirect('/')
}

export async function signOut(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
