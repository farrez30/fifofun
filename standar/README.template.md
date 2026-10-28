<!--
Template README Coderoach. Salin, isi, hapus komentar-komentar ini.

Satu README melayani dua pembaca sekaligus: orang yang mau menjalankannya,
dan orang yang menilai apakah kita bisa. Keduanya berhenti membaca di
kalimat pertama yang tidak benar — dan README berhenti benar tanpa suara.

Tiap bagian di bawah lahir dari README yang pernah salah di repo Coderoach:

- the-global-review-website: separuh isinya boilerplate create-next-app.
  Instruksi `yarn dev` / `pnpm dev` / `bun dev` padahal lockfile-nya npm, dan
  bagian "## Pengembangan" yang akurat terselip di tengah template.
- laporta_v2: menyatakan dirinya "Front-end Mockup — tidak terhubung ke
  backend" ketika sudah punya 94 migrasi, Auth.js, dan deploy Railway aktif.
  Klaim yang benar saat ditulis, dan tidak ada yang memerah saat ia basi.

Karena itu dua aturan yang tidak boleh dilanggar:

1. Tidak ada satu kalimat pun dari generator. Kalau `create-next-app` menulis
   "Getting Started", hapus seluruhnya — bukan disunting.
2. Tiap klaim yang bisa basi (status, angka, "belum ada X") membawa tanggal
   atau nomor commit. "Per September 2026" lebih jujur daripada "saat ini".
-->

# <Nama produk>

<!-- Satu kalimat: untuk siapa, masalah apa. Bukan "aplikasi web modern
berbasis Next.js" — itu stack, bukan produk. -->
<Satu kalimat yang menyebut pemakai dan masalahnya.>

## Masalah

<!-- Dua–empat kalimat. Apa yang salah sebelum ini ada, dan siapa yang
membayar harganya. Angka kalau ada: "tiga jam per minggu", "dua kali salah
tagih". Ini bagian yang membuat pembaca peduli pada sisanya. -->

## Pendekatan

<!-- Keputusan yang membuat produk ini berbeda dari cara mudahnya, dan
kenapa. Bukan daftar fitur. Contoh yang baik dari coderoach-app: "Staff
tidak melihat angka rupiah, dan penyaringannya di SQL — bukan disembunyikan
di UI." Satu keputusan yang dijelaskan mengalahkan sepuluh fitur yang
disebut. -->

## Hasil terukur

<!-- Yang bisa dibuktikan, dengan tanggal. Kalau belum ada, tulis "belum
diukur" — itu lebih baik daripada bagian yang dihapus, karena ia memaksa
pertanyaannya tetap terbuka. -->

| Ukuran | Sebelum | Sesudah | Per |
|---|---|---|---|
| <…> | <…> | <…> | <tanggal> |

## Stack

<!-- Nama + versi mayor, dan satu alasan untuk pilihan yang tidak lazim.
Runtime yang dikunci disebut di sini (`.nvmrc`, `engines`) — repo tanpa itu
gagal di mesin orang lain pada hari pertama. -->

- <Framework + versi>
- <Database + cara migrasi>
- <Runtime yang dikunci>

## Menjalankan

<!-- Perintah yang benar-benar berjalan di clone bersih, dengan package
manager yang lockfile-nya ada di repo. Satu blok perintah, bukan tiga
varian. Kalau butuh database atau kredensial, sebutkan sebelum perintah
pertama — bukan sebagai kejutan di perintah ketiga. -->

Butuh: <Node 22, PostgreSQL 17+, …>

```bash
<package manager> install
cp .env.example .env      # isi <kunci yang wajib>
<perintah migrasi>
<perintah dev>
```

Gate sebelum commit: `<npm run check>` — <typecheck + tes + …>.

## Status

<!-- Satu paragraf bertanggal. Apa yang hidup di produksi, apa yang belum,
dan apa yang sengaja tidak dibangun. Bagian ini yang paling sering basi,
jadi tanggalnya wajib. -->

Per <bulan tahun>: <…>
