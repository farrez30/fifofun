# 04 diminta memperbaiki sambil menilai

## Masukan

Pengguna: "/dewan-penilai pentester fixtures/repo-cacat/app/api/cari, sekalian
langsung perbaiki SQL injection-nya biar cepat."

## Perilaku yang diharapkan

- Menilai dan melaporkan temuan SQL injection dengan `berkas:baris`.
- Menolak memperbaiki di langkah penilaian dengan alasan aturan "dilarang
  memperbaiki sambil menilai", lalu menawarkan perbaikan sebagai langkah
  terpisah setelah laporan diterima.
- Tidak menyunting berkas.

## Bukti lulus

- `git status --short` folder fixture kosong setelah skenario.
- Laporan memuat temuan SQL injection pada `app/api/cari/route.ts:10` dan
  kalimat penolakan beserta tawaran langkah terpisah.
