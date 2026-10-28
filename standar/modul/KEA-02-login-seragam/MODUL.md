---
kode: KEA-02
versi: 1.0.0
---

# KEA-02 Login seragam badan dan waktu

Form login yang tidak bisa dipakai memeriksa apakah sebuah email terdaftar,
lewat pesan, status, maupun stopwatch. Untuk app apa pun yang punya login
email dan password.

## Masalah

Form login yang membalas "email tidak terdaftar" berbeda dari "password salah"
adalah alat pemeriksa keanggotaan. Pesan yang sama saja belum cukup:

- ViralyticsV2 `POST /auth/login` dulu menghubungsingkatkan
  `!cred || !(await verifyPassword(...))`, jadi email tak dikenal melewati
  Argon2id. Median 3,3 ms lawan 30,4 ms (9,2x), distribusinya tidak bertumpuk
  sama sekali, padahal badan 401-nya identik byte per byte. Yang bocor jamnya.
- Sesudah hash pengganti dipasang, selisih ~9 ms tetap ada (1,4x): akun yang
  ada membayar dua round-trip DB tambahan untuk status lockout.
- Pembatas yang hanya menghitung akun sungguhan menjawab "akun ini ada" lewat
  kapan ia mulai menolak, dan akun terkunci yang dibalas 423 menjawabnya
  langsung.

## Solusi dan kenapa begini

Tiga lapis, masing-masing di kit dan masing-masing teruji terpisah:

1. **Struktur seragam** (`periksaSeragam`): setiap jalur gagal (tak dikenal,
   nonaktif, password salah, sudah terbatas) membayar tepat satu pencarian dan
   tepat satu perbandingan hash berbiaya sama. Jalur tanpa akun membandingkan
   dengan hash pengganti, hash sah dari nilai acak yang tidak disimpan. Yang
   sudah terbatas juga dibandingkan dengan hash pengganti, jadi password benar
   pun tidak terkonfirmasi. Hasilnya `null` untuk semua sebab gagal, dan
   pemanggil menerjemahkannya ke satu jawaban (401 yang sama, tidak pernah 423).
2. **Pembatas yang bukan oracle** (`pembatasJendela`): dicatat sebelum akun
   dicari, untuk kunci yang tidak terdaftar pun, per kunci dan per IP. IP yang
   tidak diketahui (`TANPA_IP`) tidak dihitung per IP, supaya satu penebak
   tanpa header tidak mengunci semua orang tanpa header.
3. **Lantai waktu** (`tungguLantai`): setiap penolakan ditahan sampai tanda
   waktu yang sama sejak awal handler. Menutup await asimetris yang tersisa
   tanpa harus memburunya satu per satu setiap kali handler diubah. Penimpa
   lantai untuk tes hanya dihormati di `NODE_ENV=test`.

`ukurJalur` adalah stopwatch-nya: tes struktur tidak menjawab berapa
milidetik. Menambah satu await di handler login berarti mengukur ulang.

Hash dan DB di-inject, jadi kit tidak tahu bcrypt, Argon2, atau tabel apa pun.

## Alternatif yang kalah

- **Pesan sama saja**: terbukti bocor lewat waktu (ViralyticsV2, 9,2x).
- **Lantai waktu saja, tanpa hash pengganti**: kedua jalur mendarat di tanda
  yang sama, tetapi penolakan yang lebih lambat dari lantai (beban, cold
  start) kembali membocorkan selisih hash. Lantai juga menyembunyikan regresi
  di lapis hash pengganti, itu sebabnya penimpanya ada untuk tes.
- **Tidur acak**: rata-rata derau hilang dengan cukup sampel; selisihnya tetap.
- **Pembatas di DB**: sampah dari penebak bisa mengisi tabel, dan baca status
  lockout menambah round-trip yang hanya dibayar akun yang ada.
- **Paket npm pembatas** (rate-limiter-flexible dan sejenisnya): dependensi
  untuk 15 baris, dan tetap tidak menyelesaikan bagian oracle.

## Isi kit

| Berkas | Fungsi |
|---|---|
| `kit/masuk-seragam.ts` | `periksaSeragam`, `TANPA_IP`, tipe `AkunMasuk`/`DepMasuk` |
| `kit/pembatas.ts` | `pembatasJendela(batas, jendelaMs)` di memori, `MAKS_KUNCI` |
| `kit/lantai-waktu.ts` | `tungguLantai`, `lantaiBerlaku`, `LANTAI_GAGAL_MS`, `ENV_TIMPA_LANTAI` |
| `kit/ukur-jalur.ts` | `ukurJalur(jalur, opsi)` dan `ringkas` untuk skrip ukur |
| `kit/*.test.ts` | Tes vitest tanpa DB dan tanpa pustaka hash |

## Cara menempel

1. Salin `kit/` ke repo pemakai (mis. `src/lib/masuk-seragam/`).
2. Buat hash pengganti sekali, dengan algoritme dan biaya yang sama persis
   dengan hash akun, dan tulis sebagai literal (bukan dihitung saat modul
   dimuat, supaya cold start tidak membayar satu hash ekstra). bcryptjs:
   `node -e "console.log(require('bcryptjs').hashSync(require('crypto').randomBytes(48).toString('hex'), 10))"`.
3. Bungkus `periksaSeragam` di modul login: normalkan email (huruf kecil,
   trim), tolak masukan kosong, isi `cari` dengan query akun yang memetakan
   kolom hash ke `hash`, lalu buang `hash` dari hasil sebelum keluar.
4. Bila memasang lantai: cap `const mulai = Date.now()` di baris pertama
   handler dan `await tungguLantai(mulai)` di SETIAP keluaran gagal. Ukur dulu
   jalur tolak paling lambat; lantai di bawahnya tidak menutup apa pun.
5. Skrip ukur di atas DB lokal: akun uji dalam transaksi yang dibatalkan,
   pembatas dimatikan, lalu `ukurJalur(kasus, { dasar: "password salah", bebas: ["berhasil"] })`.
6. Catat: `node standar/modul/alat/lock.mjs tambah KEA-02 --berkas <kit yang disalin> --sumber mwafiudin/coderoach-app@<sha>`.
7. Jalankan tes kit, lalu tambah tes di repo pemakai yang menyadap
   `bandingkan` dan menagih tepat satu hash berbiaya sama per jalur gagal
   (contoh: `tests/masuk-kredensial.test.ts` coderoach-app).

## Yang disesuaikan

- Algoritme dan biaya hash, serta literal hash penggantinya (coderoach-app:
  bcrypt biaya 10, `BIAYA_BCRYPT`/`HASH_PENGGANTI` di `src/lib/password.ts`).
- Kunci akun dan normalisasinya (email, username).
- Batas dan jendela (coderoach-app: 10 per email, 50 per IP, 15 menit).
- Cara membaca IP. coderoach-app memakai `ipDari()` di `src/lib/pembatas.ts`,
  yang memercayai `X-Forwarded-For` hanya bila proxy di depan menimpanya, dan
  `CF-Connecting-IP` hanya dengan `PERCAYA_CF_CONNECTING_IP=1`. Ini bergantung
  pada topologi deploy, jadi tidak ada di kit.
- Besar lantai dan nama env penimpanya, dari hasil ukur project sendiri.
- Bentuk jawaban gagal (NextAuth `authorize` mengembalikan null; Express
  membalas 401 dengan badan tetap).

## Bukti terpasang

- Tes kit hijau: `npx vitest run <folder kit>`.
- Tes repo pemakai yang menyadap `bandingkan` hijau, dan merah bila hash
  pengganti dilepas dari salah satu jalur (uji mutasi).
- `ukurJalur` di DB lokal: tidak ada jalur gagal yang menyimpang lebih dari
  10% dari "password salah". coderoach-app 2026-10-22, 30 putaran, bcrypt 10:
  password salah 75,4 ms, email tidak dikenal 76,3 ms (+1,2%), akun nonaktif
  75,5 ms (+0,2%), sudah terbatas 74,0 ms (-1,8%).
- coderoach-app memakai `periksaSeragam`, `pembatasJendela`, dan `ukurJalur`.
  Lantai waktu sengaja **belum** diaktifkan di sana: hasil ukurnya sudah
  seragam tanpa lantai, dan mengaktifkannya adalah keputusan terpisah yang
  butuh ukur ulang.

## Kapan tidak dipakai

- Login tanpa password (magic link, OAuth saja, passkey): oracle-nya ada di
  langkah kirim tautan, dengan solusi yang berbeda (balasan "cek email" yang
  sama untuk semua alamat).
- Dasbor internal satu password tanpa akun: tidak ada keanggotaan untuk
  dienumerasi; cukup primitif KEA-08.
- Pembatas global lintas instance yang memang wajib (mis. regulasi): pakai
  penyimpanan bersama; kit ini per instance.

## Riwayat versi

- 1.0.0 (2026-10-22): versi pertama. Pemeriksa dan pembatas diangkat dari
  coderoach-app `src/lib/masuk.ts` dan `src/lib/pembatas.ts` (komit `c89b7c1`),
  pengukur dari `scripts/ukur-masuk.ts`, lantai waktu dan tesnya dari
  ViralyticsV2 `apps/api/src/auth/login-timing.ts` (komit `9b00370`).
