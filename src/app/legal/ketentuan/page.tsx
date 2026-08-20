import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Ketentuan Penggunaan',
  description:
    'Apa yang FiFoFun lakukan dan tidak lakukan, batas tanggung jawabnya, dan mengapa angkanya bukan nasihat keuangan.',
}

const UPDATED = '20 Agustus 2026'

/**
 * Terms of use.
 *
 * The section that matters most is the one saying this is not financial advice.
 * The app produces confident-looking figures with citations attached, and that
 * combination is exactly what makes people stop checking, so the limit has to be
 * stated plainly rather than buried.
 */
export default function TermsPage() {
  return (
    <>
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink">Ketentuan Penggunaan</h1>
        <p className="mt-1 text-xs text-ink-faint">Terakhir diperbarui {UPDATED}</p>
      </div>

      <p>
        FiFoFun adalah perkakas pribadi untuk mencatat dan merencanakan keuangan. Dengan
        memakainya kamu menyetujui ketentuan di bawah ini.
      </p>

      <Section title="Ini bukan nasihat keuangan">
        <p>
          Aplikasi ini menghitung, memproyeksikan, dan menampilkan angka lengkap dengan
          sumbernya. Itu tidak membuatnya menjadi nasihat keuangan, dan pembuatnya bukan
          perencana keuangan berizin.
        </p>
        <p className="mt-2">
          Justru karena angkanya tampil rapi dan bersumber, ia mudah dipercaya begitu saja.
          Perlakukan setiap proyeksi sebagai hitungan dari asumsi yang bisa saja keliru, bukan
          sebagai ramalan. Untuk keputusan besar, temui perencana keuangan berizin.
        </p>
      </Section>

      <Section title="Angka yang kamu lihat berasal dari data yang kamu masukkan">
        <p>
          Impor e-Statement direkonsiliasi berlapis terhadap saldo yang dicetak bank, dan impor
          ditolak seluruhnya kalau tidak cocok. Meski begitu:
        </p>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>
            Mutasi bank tidak bisa melihat belanja di dalam e-wallet. Uang yang masuk ke sana
            tercatat sebagai transfer, bukan pengeluaran, sampai kamu mencatat rinciannya.
          </li>
          <li>
            Transaksi tunai tidak terlihat sama sekali oleh bank dan harus dicatat sendiri.
          </li>
          <li>
            Kategori otomatis diterka dari keterangan bank yang tidak punya spesifikasi resmi.
            Yang belum yakin ditandai supaya kamu yang memutuskan.
          </li>
        </ul>
      </Section>

      <Section title="Asumsi di balik proyeksi">
        <p>
          Inflasi umum, inflasi pendidikan, imbal hasil investasi, lama antrean haji, dan biaya
          sekolah semuanya berupa asumsi. Sumbernya dicantumkan beserta tingkat keyakinannya:
          angka dari OJK, BPS, BI, BAZNAS, Kemenag dan Kemenkeu ditandai sebagai sumber resmi;
          patokan industri ditandai sebagai patokan industri; hal yang diturunkan di dalam
          aplikasi ini ditandai sebagai turunan.
        </p>
        <p className="mt-2">
          Asumsi bisa meleset, dan hasil masa lalu tidak menjamin hasil masa depan. Angka biaya
          sekolah khususnya sebaiknya kamu ganti dengan penawaran dari sekolah yang benar-benar
          dituju.
        </p>
      </Section>

      <Section title="Tanpa jaminan">
        <p>
          Perangkat lunak ini disediakan apa adanya, tanpa jaminan dalam bentuk apa pun, sesuai
          lisensi MIT yang menyertainya. Pembuatnya tidak bertanggung jawab atas kerugian yang
          timbul dari penggunaannya, termasuk keputusan keuangan yang diambil berdasarkan
          keluarannya.
        </p>
      </Section>

      <Section title="Tanggung jawabmu">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Menjaga kerahasiaan kata sandi akunmu.</li>
          <li>Memastikan kamu berhak atas data yang kamu impor.</li>
          <li>
            Memeriksa sendiri transaksi yang ditandai perlu ditinjau, alih-alih menganggap
            kategorisasi otomatis selalu benar.
          </li>
        </ul>
      </Section>

      <Section title="Ketersediaan">
        <p>
          Ini aplikasi pribadi, bukan layanan berlangganan. Tidak ada jaminan waktu aktif,
          tidak ada dukungan, dan layanannya bisa dihentikan kapan saja. Karena kode sumbernya
          terbuka, kamu bisa menjalankannya sendiri.
        </p>
      </Section>

      <Section title="Hukum yang berlaku">
        <p>Hukum Republik Indonesia.</p>
      </Section>
    </>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-base font-medium text-ink">{title}</h2>
      <div className="mt-2">{children}</div>
    </section>
  )
}
