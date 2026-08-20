import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Kebijakan Privasi',
  description:
    'Data apa saja yang disimpan FiFoFun, di mana disimpannya, siapa yang bisa membacanya, dan bagaimana menghapusnya.',
}

const UPDATED = '20 Agustus 2026'

/**
 * The privacy policy.
 *
 * Written as a description of what the code actually does rather than as a
 * template filled in, because every claim here is checkable against the
 * repository, which is public. Where the app collects nothing, it says so
 * instead of reserving the right to collect it later.
 */
export default function PrivacyPage() {
  return (
    <>
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink">Kebijakan Privasi</h1>
        <p className="mt-1 text-xs text-ink-faint">Terakhir diperbarui {UPDATED}</p>
      </div>

      <p>
        FiFoFun adalah aplikasi perencana keuangan pribadi. Kode sumbernya terbuka, jadi setiap
        pernyataan di halaman ini bisa kamu periksa sendiri di repositorinya, bukan hanya
        dipercaya.
      </p>

      <Section title="Data yang disimpan">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong className="font-medium text-ink">Identitas akun.</strong> Alamat email dan
            kata sandi yang sudah di-hash. Pengelolaannya oleh Supabase Auth; aplikasi ini tidak
            pernah menyimpan kata sandi dalam bentuk apa pun.
          </li>
          <li>
            <strong className="font-medium text-ink">Transaksi keuangan.</strong> Tanggal,
            nominal, keterangan, kategori, dan akun asal maupun tujuan, beserta keterangan
            mentah dari bank.
          </li>
          <li>
            <strong className="font-medium text-ink">Berkas e-Statement.</strong> Yang disimpan
            hanya nama berkas, ringkasan periodenya, dan sidik jari SHA-256 dari isinya. Berkas
            aslinya diproses di memori lalu dibuang, tidak pernah ditulis ke penyimpanan.
          </li>
          <li>
            <strong className="font-medium text-ink">Pengenal e-wallet.</strong> Nomor telepon
            di balik akun e-wallet, bila kamu mengisinya, semata agar top-up ke dompetmu sendiri
            tidak salah dihitung sebagai pengeluaran.
          </li>
        </ul>
      </Section>

      <Section title="Data yang tidak dikumpulkan">
        <p>
          Tidak ada kredensial internet banking, PIN, nomor kartu, maupun OTP. FiFoFun tidak
          pernah meminta hal-hal itu dan tidak punya tempat untuk menyimpannya. Aplikasi apa pun
          yang memintanya untuk membaca mutasi rekeningmu sebaiknya kamu tolak.
        </p>
        <p className="mt-2">
          Tidak ada pelacak pihak ketiga, tidak ada analytics, tidak ada iklan, dan tidak ada
          cookie selain yang dipakai untuk menjaga sesi masuk.
        </p>
      </Section>

      <Section title="Siapa yang bisa membacanya">
        <p>
          Basis datanya memakai row level security, yang berarti pemeriksaan hak akses dilakukan
          di dalam basis data itu sendiri, bukan hanya di kode aplikasi. Sebuah kueri yang salah
          tulis tetap tidak akan mengembalikan data rumah tangga lain, karena kebijakan aksesnya
          dijalankan satu lapis di bawah kode.
        </p>
        <p className="mt-2">
          Data tidak dijual, tidak disewakan, dan tidak dibagikan ke pihak ketiga mana pun.
        </p>
      </Section>

      <Section title="Di mana disimpan">
        <p>
          Pada Supabase, di atas PostgreSQL. Wilayah penyimpanannya di luar Indonesia. UU 27/2022
          tentang Pelindungan Data Pribadi mengizinkan pemrosesan di luar negeri sepanjang
          tingkat pelindungannya setara atau ada persetujuan; dengan memakai aplikasi ini kamu
          menyetujui penyimpanan tersebut. Kalau itu tidak dapat kamu terima, jangan memakainya.
        </p>
      </Section>

      <Section title="Hakmu">
        <p>
          UU 27/2022 memberimu hak untuk mengakses, membetulkan, menghapus, dan menarik kembali
          persetujuan atas data pribadimu. Karena ini aplikasi pribadi yang kamu jalankan sendiri:
        </p>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>Mengakses dan membetulkan bisa langsung di dalam aplikasi.</li>
          <li>
            Menghapus akun menghapus seluruh rumah tangga, transaksi, dan riwayat impor yang
            terkait, secara berjenjang dan permanen. Tidak ada salinan cadangan yang disimpan di
            luar itu.
          </li>
        </ul>
      </Section>

      <Section title="Penyimpanan di perangkat">
        <p>
          Service worker aplikasi ini sengaja tidak menyimpan halaman, saldo, maupun transaksi di
          perangkatmu. Yang disimpan hanya berkas statis hasil build dan satu halaman offline.
          Alasannya dua: cache tersebut bertahan setelah kamu keluar dan bisa dibaca siapa pun
          yang memegang perangkat, dan saldo basi yang ditampilkan seolah saldo hari ini lebih
          berbahaya daripada layar kosong.
        </p>
      </Section>

      <Section title="Perubahan">
        <p>
          Perubahan kebijakan ini tercatat di riwayat commit repositori, lengkap dengan tanggal
          dan isinya. Tanggal di atas menunjukkan revisi terakhir.
        </p>
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
