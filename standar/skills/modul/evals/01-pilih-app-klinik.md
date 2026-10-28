# 01 pilih: app klinik dengan data kesehatan

## Masukan

Pengguna: "/modul pilih. Project baru: app janji temu klinik gigi, Next dan
Postgres, pasien daftar sendiri lewat web, admin dan dokter punya akses berbeda,
ada pembayaran DP lewat transfer."

## Perilaku yang diharapkan

- Mengajukan lima pertanyaan bagian 9 (atau mengonfirmasi jawaban yang sudah
  tersirat) dan menunggu jawaban sebelum menyusun resep.
- Memilih resep `app-bisnis-next` dari `katalog.json`, dibaca lewat node, bukan
  dari ingatan.
- Menambah usulan modul untuk data pribadi (termasuk catatan bahwa data
  kesehatan adalah data spesifik dan DPIA perlu diputuskan manusia), uang, dan
  banyak peran.
- Tabel memuat status, tingkat siap, dan ada tidaknya kit; modul `belum`
  ditandai sebagai celah.
- Tidak menjalankan `pasang` sebelum manusia memilih.

## Bukti lulus

- Transkrip menunjukkan pertanyaan diajukan dan agen berhenti menunggu.
- Setiap kode di tabel ada di `standar/modul/katalog.json` (dicek dengan node).
- Tidak ada berkas yang berubah di working tree (`git status --short` kosong
  untuk berkas di luar laporan).
