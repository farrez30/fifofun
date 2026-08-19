import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/app-shell'
import { getUser } from '@/lib/supabase/server'
import { ImportForm } from './import-form'

export const metadata: Metadata = { title: 'Impor' }

export default async function ImporPage() {
  const user = await getUser()
  if (!user) redirect('/login')

  return (
    <AppShell
      title="Impor e-Statement"
      email={user.email ?? ''}
      current="/impor"
      lead="Unggah e-Statement Mandiri untuk mengisi catatanmu, sekaligus memeriksa apakah pembukuan manualmu sudah benar."
    >
      <div className="grid gap-8 lg:grid-cols-[1fr_18rem]">
        <ImportForm />

        <aside className="space-y-5 text-sm text-ink-muted lg:border-l lg:border-line lg:pl-6">
          <div>
            <h2 className="text-sm font-medium text-ink">Yang diperiksa</h2>
            <p className="mt-1.5">
              Setiap baris dicocokkan berlapis: jumlah dana masuk, jumlah dana keluar, saldo
              awal ditambah selisihnya, dan rantai saldo baris demi baris.
            </p>
            <p className="mt-1.5">
              Lapis terakhir itu yang membuat berkas bermasalah bisa ditunjuk barisnya, bukan
              sekadar dinyatakan &ldquo;tidak cocok&rdquo;.
            </p>
          </div>

          <div>
            <h2 className="text-sm font-medium text-ink">Kalau tidak cocok</h2>
            <p className="mt-1.5">
              Tidak ada satu pun transaksi yang disimpan. Angka yang salah di catatan keuangan
              lebih merugikan daripada impor yang gagal, karena angka yang salah akan dipercaya.
            </p>
          </div>

          <div>
            <h2 className="text-sm font-medium text-ink">Mengunggah dua kali</h2>
            <p className="mt-1.5">
              Aman. Setiap berkas dan setiap baris punya sidik jarinya sendiri, jadi berkas yang
              sama tidak akan menggandakan apa pun.
            </p>
          </div>

          <div>
            <h2 className="text-sm font-medium text-ink">Kenapa .xlsx, bukan PDF</h2>
            <p className="mt-1.5">
              Di .xlsx, dana masuk dan dana keluar ada di kolom terpisah. Di PDF keduanya
              berbagi satu kolom dan dibedakan oleh akhiran{' '}
              <span className="font-mono text-xs">D</span> yang mudah hilang tanpa suara.
            </p>
          </div>
        </aside>
      </div>
    </AppShell>
  )
}
