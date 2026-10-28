---
kode: TES-19
versi: 1.0.0
---

# TES-19 Katalog kasus tepi

Daftar kasus tepi yang sudah pernah memakan biaya di repo Coderoach, dalam
bentuk yang bisa dicari per domain dan stack, lengkap dengan jejak ke berkas
asal dan tes yang mengotomasinya. Bahan baku langkah 2 [TES-21](../TES-21-alur-desain-uji/MODUL.md)
dan skill `desain-uji`.

## Masalah

Kasus yang sama ditemukan ulang per repo: "hari ini" yang masih kemarin sampai
07.00 WIB (coderoach-app, AkarKita, Jeda), angka id-ID yang tertukar dengan
format mesin (coderoach-app, NDS-ETL), tebakan PIN paralel (Jeda), pesan dan
waktu login yang membocorkan keberadaan akun (coderoach-app, ViralyticsV2).
Setiap kali, buktinya berupa tes yang tersebar dan bagian "Jebakan"
`standar/AGENTS.base.md`, sehingga repo berikutnya tidak tahu harus menguji apa
sebelum kena sendiri.

## Solusi dan kenapa begini

`kasus.json` adalah data, bukan prosa: tiap kasus punya kolom gabungan pola FMEA
(dampak S/O/D), CAPEC/WSTG (rujukan serangan), dan postmortem (asal, asumsi yang
patah). Data bisa disaring agen per stack dan domain, divalidasi tes, dan
ditambah tanpa mengubah skema.

Syarat masuk sama dengan `AGENTS.base.md`: **berjejak**. Setiap kasus menunjuk
berkas yang benar-benar dibuka saat ditulis (`asal`), dan tes yang
mengotomasinya bila ada (`otomasi`). Kasus yang tidak bisa dijejak tidak masuk.

## Isi

| Berkas | Fungsi |
|---|---|
| `kasus.json` | Kasus tepi, `versi: 1` |
| `tests/modul-kasus-tepi.test.ts` (di coderoach-app) | Bentuk tiap kasus, id unik, jumlah minimum, jalur coderoach-app ada, tanda baca polos |

### Kolom

| Kolom | Isi |
|---|---|
| `id` | `TK-001` dan seterusnya, tidak pernah dipakai ulang |
| `judul` | Satu kalimat gejala |
| `domain` | `waktu-tanggal`, `angka-lokal`, `konkurensi`, `auth-otorisasi`, `input-jahat`, `ui-perangkat`, `jaringan-server`, `android`, `kualitas-data` |
| `stack[]` | Tag stack, sama dengan `stack` di `katalog.json` |
| `rujukan[]` | CWE, WSTG, WCAG SC, MASVS, OWASP LLM, elemen SFDIPOT (`SFDIPOT:Time`) |
| `pemicu` | Masukan atau kondisi yang memicu |
| `kenapa_gagal` | Asumsi yang patah, gaya "falsehoods" |
| `dampak` | `s` keparahan, `o` kemungkinan terjadi, `d` sulit terdeteksi (1 sampai 10, makin tinggi makin buruk) |
| `reproduksi` | Cara memicunya di tes |
| `harapan`, `sumber_harapan` | Perilaku benar dan dari mana harapan itu berasal (spesifikasi, ADR, standar, atau tes asal) |
| `jenis_cek` | `unit`, `integrasi`, `http`, `e2e`, `statis`, `properti`, `skrip-cek`, `perangkat`, `manual` |
| `otomasi` | `{repo, jalur}` tes yang mengotomasi, atau `null` bila belum ada |
| `asal` | `{repo, jalur, tanggal?}` berkas tempat kasus ditemukan |
| `status` | `pemilik`, `diverifikasi` (tanggal jejak terakhir dicek ada), `risiko_sisa` bila belum terotomasi |

Angka S/O/D di versi 1.0.0 adalah taksiran penyusun dari jejaknya, bukan hasil
pengukuran; tinjau bersama pemilik repo sebelum dipakai untuk memprioritaskan
anggaran. `pemilik` sementara diisi pengelola katalog sampai pemilik repo
menerimanya. `diverifikasi` berarti berkas `asal` dan `otomasi` dicek ada pada
tanggal itu, bukan bahwa tesnya dijalankan.

## Cara menempel

Modul ini tidak disalin ke repo pemakai; ia dibaca.

1. Saat mendesain uji sebuah fitur (TES-21 langkah 2), saring `kasus.json`
   menurut `stack` dan `domain` fitur itu.
2. Tiap kasus yang cocok jadi kandidat kasus uji; harapannya ditulis ulang dari
   spesifikasi fitur, bukan disalin.
3. Bila repo memakai satu kasus sebagai tes regresi, catat lewat lockfile:
   `node standar/modul/alat/lock.mjs tambah TES-19 --berkas <jalur tes> --sumber mwafiudin/coderoach-app@<sha>`.

## Menambah kasus

Setiap insiden baru jadi entri baru (TES-21 langkah 7) beserta tes regresinya.
Id berikutnya adalah nomor terbesar ditambah satu. Isi `asal` dengan berkas yang
memang ada; bila belum ada tes, `otomasi: null` dan tulis `risiko_sisa` beserta
siapa yang menerimanya. Teks memakai tanda baca polos (tanpa em dash, panah,
atau titik tengah penyambung), karena katalog ikut tampil di Rakit.

## Korpus umum (dirujuk, tidak disalin)

Dipakai sebagai sumber muatan tambahan saat langkah 3 TES-21. Isinya tidak
disalin ke repo ini; versi dan lisensi dicek saat dipakai.

- Big List of Naughty Strings (Max Woolf, repo GitHub `minimaxir/big-list-of-naughty-strings`).
- "Falsehoods programmers believe about names" (Patrick McKenzie, 2010) dan
  turunannya soal waktu ("Falsehoods programmers believe about time").
- OWASP API Security Top 10 2023.
- CWE Top 25 Most Dangerous Software Weaknesses (MITRE, edisi terbaru; rencana
  menyebut 2025, belum diverifikasi ke sumber primer).
- OWASP Web Security Testing Guide (WSTG) v4.2, untuk kategori uji per id WSTG.
- WCAG 2.2 beserta Techniques for WCAG 2.2, terutama daftar kegagalan (kode F).
- Pseudolocale Android `en-XA` (teks panjang beraksen) dan `ar-XB` (RTL).
- OWASP Top 10 for LLM Applications (edisi 2025, belum diverifikasi ke sumber primer).
- OWASP MASVS v2 dan MASTG untuk Android.

## Bukti terpasang

`npx vitest run tests/modul-kasus-tepi.test.ts` hijau di coderoach-app. Di repo
pemakai: tes regresi yang menyebut id `TK-...` di komentar atau namanya.

## Kapan tidak dipakai

Sebagai pengganti desain uji per fitur. Katalog ini daftar kandidat dari masa
lalu; fitur baru tetap butuh kasus dari spesifikasinya sendiri (TES-21 langkah 3).

## Riwayat versi

- 1.0.0 (2026-10-22): versi pertama, 103 kasus dari coderoach-app, AkarKita,
  Jeda, ViralyticsV2, NDS-ETL, d-day, rideDeck-ayam, dan nds-ads-pilot.
