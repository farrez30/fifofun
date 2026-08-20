import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Tidak ada koneksi' }

/**
 * Shown by the service worker when a navigation cannot reach the network.
 *
 * It deliberately shows nothing about the household's money. Serving a cached
 * dashboard here would present yesterday's balances with today's framing, which
 * is worse than showing nothing at all, so this page has no data on it and says
 * so plainly.
 */
export default function OfflinePage() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-10">
      <main id="main">
        <p className="font-mono text-xs uppercase tracking-widest text-ink-faint">FiFoFun</p>
        <h1 className="mt-3 text-xl font-semibold tracking-tight text-ink">
          Tidak ada koneksi
        </h1>
        <p className="mt-3 text-sm text-ink-muted">
          Halaman ini sengaja kosong. Angka keuanganmu tidak disimpan di
          perangkat, jadi tidak ada versi lama yang bisa ditampilkan di sini.
        </p>
        <p className="mt-2 text-sm text-ink-muted">
          Saldo kemarin yang ditampilkan seolah-olah saldo hari ini jauh lebih
          berbahaya daripada layar kosong, karena angka yang salah tetap akan
          dipercaya.
        </p>
        <p className="mt-6 text-sm text-ink-muted">
          Coba lagi setelah jaringan kembali.
        </p>
      </main>
    </div>
  )
}
