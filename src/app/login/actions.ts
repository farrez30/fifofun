'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

/**
 * Sign in and sign up.
 *
 * Errors are returned rather than thrown so the form can show them in place.
 * The messages stay deliberately vague about which half of a credential pair
 * was wrong, because a precise message tells an attacker which addresses have
 * accounts.
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
    const { error } = await supabase.auth.signUp(parsed.data)
    if (error) return { error: error.message }
    return { notice: 'Akun dibuat. Cek email kalau konfirmasi diperlukan, lalu masuk.' }
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
