import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getUser } from '@/lib/supabase/server'
import { LoginForm } from './login-form'

export const metadata: Metadata = {
  title: 'Masuk',
}

export default async function LoginPage() {
  if (await getUser()) redirect('/')

  return (
    <main id="main" className="grid min-h-dvh place-items-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <p className="font-mono text-xs uppercase tracking-widest text-ink-faint">FiFoFun</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">
            Masuk ke catatan keuanganmu
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            Datamu hanya bisa dibaca oleh akun ini. Kebijakan di database yang
            memastikannya, bukan kode aplikasi.
          </p>
        </div>

        <LoginForm />

        {/* Reachable before signing up, not after. Someone should be able to
            read what happens to their data before handing any of it over. */}
        <p className="mt-8 border-t border-line pt-4 text-xs text-ink-faint">
          Dengan membuat akun kamu menyetujui{' '}
          <Link href="/legal/ketentuan" className="underline underline-offset-2 hover:text-ink">
            Ketentuan Penggunaan
          </Link>{' '}
          dan{' '}
          <Link href="/legal/privasi" className="underline underline-offset-2 hover:text-ink">
            Kebijakan Privasi
          </Link>
          . Aplikasi ini tidak pernah meminta kredensial internet banking, PIN, atau OTP.
        </p>
      </div>
    </main>
  )
}
