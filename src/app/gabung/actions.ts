'use server'

import { redirect } from 'next/navigation'
import { hashCode, normaliseCode } from '@/lib/invites'
import { createClient } from '@/lib/supabase/server'

/**
 * Accepting an invitation.
 *
 * All of the deciding happens in `redeem_invite`, a definer function in the
 * database, and none of it happens here. That is the point: the membership row
 * has to be written for somebody who is not a member yet, and the choice was
 * between one auditable function whose behaviour is fixed and handing this file
 * a key that bypasses row level security entirely.
 *
 * This file therefore holds no authority at all. It normalises what was typed,
 * hashes it, and translates a status into a sentence.
 */

export interface JoinResult {
  ok: boolean
  message: string
}

/*
  One sentence per outcome, because "gagal" tells somebody holding a code that
  arrived four minutes ago exactly nothing about what to do next.
*/
const MESSAGES: Record<string, string> = {
  unknown: 'Kode itu tidak dikenali. Periksa lagi hurufnya, atau minta kode baru.',
  redeemed: 'Kode itu sudah dipakai. Setiap undangan hanya berlaku sekali.',
  expired: 'Kode itu sudah kedaluwarsa. Minta yang baru ke anggota rumah tangga.',
  already_member: 'Akun ini sudah tergabung di sebuah rumah tangga.',
  unauthenticated: 'Sesi kamu sudah berakhir. Masuk lagi lalu ulangi.',
}

export async function joinHousehold(
  _previous: JoinResult | null,
  formData: FormData,
): Promise<JoinResult> {
  const code = normaliseCode(String(formData.get('code') ?? ''))
  if (!code) {
    return {
      ok: false,
      message: 'Kodenya sepuluh karakter, tanpa huruf I, L atau O. Tanda hubung boleh ikut.',
    }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('redeem_invite', { p_code_hash: hashCode(code) })

  if (error) return { ok: false, message: 'Kodenya gagal diproses. Coba lagi sebentar lagi.' }
  if (data !== 'ok') {
    return { ok: false, message: MESSAGES[data as string] ?? 'Kode itu tidak bisa dipakai.' }
  }

  redirect('/')
}
