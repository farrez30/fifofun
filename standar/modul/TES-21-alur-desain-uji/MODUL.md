---
kode: TES-21
versi: 1.0.0
---

# TES-21 Alur desain uji per fitur

Tujuh langkah dari spesifikasi sampai daftar risiko sisa yang ditandatangani,
untuk setiap fitur yang menyentuh data, uang, otorisasi, atau masukan dari luar.
Dijalankan manusia atau agen lewat skill `desain-uji`; gerbangnya dipegang
manusia.

## Masalah

Tes di repo kita kuat di tempat yang pernah terbakar dan tipis di tempat lain.
Kasus tepi ditemukan setelah insiden (lihat [TES-19](../TES-19-katalog-kasus-tepi/MODUL.md)),
bukan saat desain. Tes buatan agen punya kegagalan khas: harapannya disalin dari
perilaku kode yang ada, sehingga bug ikut dikunci sebagai "benar", dan tes yang
tidak memeriksa apa pun tetap hijau.

## Solusi dan kenapa begini

Satu alur tetap dengan dua gerbang manusia. Harapan ditulis **dari spesifikasi
atau standar, bukan dari kode**, dan disetujui sebelum tesnya ditulis; ini
memutus jalur "kode menjadi oracle bagi dirinya sendiri". Kekuatan tes diukur
(mutasi pada diff), bukan dinilai dari jumlah. Setiap insiden baru kembali ke
TES-19, sehingga katalog tumbuh dari bukti.

## Alternatif yang kalah

- Hanya menuntut cakupan baris: cakupan tinggi bisa dicapai tes tanpa asersi.
- Membiarkan agen menulis tes langsung dari kode: cepat, tetapi merekam perilaku
  sekarang termasuk bugnya.
- Satu sesi eksploratori tanpa desain: menemukan yang mencolok, tidak menjamin
  batas dan kombinasi.

## Tujuh langkah

1. **Masukan.** Spesifikasi atau acceptance criteria, kontrak API (OpenAPI bila
   ada), model data, DFD dengan batas kepercayaan, empat pertanyaan Threat
   Modeling Manifesto (apa yang dikerjakan, apa yang bisa salah, apa yang kita
   lakukan, apakah sudah cukup), daftar state UI, topologi deploy. Masukan yang
   tidak ada ditulis "tidak ada", tidak dikarang.
2. **Modelkan.** Variabel dan domainnya, state dan transisinya, batas
   kepercayaan, dependensi (heuristik SFDIPOT: Structure, Function, Data,
   Interfaces, Platform, Operations, Time). Tarik entri TES-19 yang cocok menurut
   `stack` dan `domain`.
3. **Kandidat kasus per teknik.** Partisi ekuivalen dan nilai batas; tabel
   keputusan; transisi state; kombinasi pairwise (naik ke 3 atau 4-way untuk
   bagian berisiko); STRIDE per elemen DFD dan LINDDUN untuk data pribadi;
   abuse dan misuse case; ASVS L1/L2 untuk kontrol keamanan; matriks state UI
   (kosong, memuat, galat, offline, teks panjang dan RTL, 320 px dan zoom 400%,
   reduced motion); FMEA dependensi (DB mati, disk penuh, tunnel putus, jam
   melenceng, sertifikat kedaluwarsa). Daftar periksa injeksi wajib: SQL,
   perintah OS, prompt, XSS (lihat `kit/rencana-uji.md`).
4. **Harapan.** Tiap kasus diberi harapan dan sumbernya (pasal spesifikasi, ADR,
   standar). Kode yang ada tidak boleh jadi sumber harapan. **Gerbang 1:
   manusia menyetujui tabel harapan sebelum satu tes pun ditulis.**
5. **Otomasi** dengan cek termurah yang efektif: unit untuk logika murni,
   integrasi di transaksi yang di-rollback untuk SQL, HTTP sungguhan untuk
   perilaku lapisan request, statis untuk aturan kode, perangkat untuk Android.
6. **Ukur kekuatan.** Tes harus build, stabil berulang (minimal tiga kali
   berturut-turut), dan membunuh mutan pada diff atau menambah cakupan. Tiap
   penjaga keamanan diuji mutasi: lumpuhkan, tepat satu tes merah. Tutup sisa
   dengan satu charter eksploratori 60 sampai 90 menit. Review oleh pemeriksa
   berkonteks segar.
7. **Keluaran.** Tes, otomasi, dan daftar risiko sisa (apa, kenapa diterima,
   siapa menerima, sampai kapan). **Gerbang 2: manusia menandatangani daftar
   risiko sisa.** Setiap insiden baru sesudahnya jadi entri TES-19 dan tes
   regresi.

## Isi kit

| Berkas | Fungsi |
|---|---|
| `kit/rencana-uji.md` | Templat rencana uji satu fitur: masukan, model, kandidat, tabel harapan, bukti kekuatan, risiko sisa, tanda tangan |

## Cara menempel

1. Salin `kit/rencana-uji.md` ke `docs/uji/<fitur>.md` di repo pemakai.
2. Isi langkah 1 sampai 4, berhenti di gerbang 1.
3. Setelah disetujui, tulis tes dan isi bagian bukti, lalu gerbang 2.
4. Catat bila templat dipakai: `node standar/modul/alat/lock.mjs tambah TES-21 --berkas docs/uji/<fitur>.md --disesuaikan docs/uji/<fitur>.md --sumber mwafiudin/coderoach-app@<sha>`.

## Yang disesuaikan

Teknik di langkah 3 dipilih sesuai risiko fitur; yang tidak dipakai ditulis
alasannya, bukan dihapus diam-diam. Ambang mutasi dan jumlah pengulangan boleh
lebih ketat per repo.

## Bukti terpasang

Rencana uji berisi persetujuan gerbang 1 bertanggal sebelum commit tes pertama
fitur itu, daftar mutan beserta tes yang membunuhnya, dan tanda tangan gerbang 2.

## Kapan tidak dipakai

Perubahan teks, gaya, atau refactor tanpa perubahan perilaku; cukup tes yang ada.

## Riwayat versi

- 1.0.0 (2026-10-22): versi pertama, dirumuskan dari rencana katalog modul
  (ADR 0028) dan penjaga tes yang sudah hidup di `standar/AGENTS.base.md`.
