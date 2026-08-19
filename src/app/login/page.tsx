import type { Metadata } from 'next'
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
      </div>
    </main>
  )
}
