import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/app-shell'
import { getUser } from '@/lib/auth/session'
import { ImportForm } from './import-form'
import { InfoTip } from '@/components/info-tip'

export const metadata: Metadata = { title: 'Impor' }
/* Blocks on runtime data by design; the why lives in src/app/page.tsx above `instant`. */
export const instant = false

export default async function ImporPage() {
  const user = await getUser()
  if (!user) redirect('/login')

  return (
    <AppShell
      title="Impor e-Statement"
      email={user.email ?? ''}
      current="/impor"
    >
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <ImportForm />

        {/* What a person worries about before uploading, said as the answer
            only. How the checks work sits behind the info button. */}
        <aside className="space-y-5 text-sm text-ink-muted lg:border-l lg:border-line lg:pl-6">
          <div>
            <div className="flex items-center gap-1">
              <h2 className="text-sm font-medium text-ink">Kalau tidak cocok</h2>
              <InfoTip label="Yang diperiksa">
                <p>
                  Setiap baris dicocokkan berlapis: jumlah dana masuk, jumlah dana keluar, saldo
                  awal ditambah selisihnya, dan rantai saldo baris demi baris. Lapis terakhir itu
                  yang membuat berkas bermasalah bisa ditunjuk barisnya.
                </p>
                <p className="mt-2">
                  Dipakai .xlsx, bukan PDF: di .xlsx dana masuk dan keluar ada di kolom terpisah,
                  di PDF keduanya berbagi satu kolom dan dibedakan akhiran D yang mudah hilang.
                </p>
              </InfoTip>
            </div>
            <p className="mt-1.5">Tidak ada satu pun transaksi yang disimpan.</p>
          </div>

          <div>
            <h2 className="text-sm font-medium text-ink">Mengunggah dua kali</h2>
            <p className="mt-1.5">Aman. Berkas yang sama tidak menggandakan apa pun.</p>
          </div>
        </aside>
      </div>
    </AppShell>
  )
}
