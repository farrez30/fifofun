import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getHousehold } from '@/lib/queries/household'
import { getUser } from '@/lib/supabase/server'
import { JoinForm } from './join-form'

export const metadata: Metadata = { title: 'Gabung rumah tangga' }

/**
 * Where an account with no household lands.
 *
 * Every page used to say the account was not connected to one, and one of them
 * told whoever read it to run the seed script. That is an instruction for the
 * person who built the app, shown to the person who did not, and it left the
 * only way forward outside the app entirely.
 */
export default async function JoinPage() {
  const user = await getUser()
  if (!user) redirect('/login')

  // Nobody who already belongs somewhere needs this page, and landing on it
  // would suggest they had lost something.
  if (await getHousehold()) redirect('/')

  return (
    <main id="main" className="grid min-h-dvh place-items-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <p className="font-mono text-xs uppercase tracking-widest text-ink-faint">FiFoFun</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">
            Masukkan kode undanganmu
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            Akun ini belum tergabung ke rumah tangga mana pun, jadi belum ada catatan yang bisa
            ditampilkan. Kode undangan diterbitkan oleh anggota yang sudah ada di dalamnya.
          </p>
        </div>

        <JoinForm />

        <p className="mt-8 border-t border-line pt-4 text-xs text-ink-faint">
          Tidak punya kodenya? Undangan hanya bisa dibuat dari dalam rumah tangga yang dituju,
          dan berlaku sekali pakai.
        </p>
      </div>
    </main>
  )
}
